import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Level } from "@/lib/workoutData";
import { LEGACY_HABIT_IDS, DEFAULT_HABITS, makeHabitId, habitDefsEqual, type HabitDef } from "@/lib/habits";
import type {
  CompletionRecord,
  WorkoutLogRecord,
  WorkoutLogEntry,
  NotificationSettings,
  DailyHabitRecord,
  RecoveryData,
  SyncPayload,
  SyncTombstones,
  Theme,
} from "@/types/workout";

export interface TimerSettings {
  audio: boolean;
  countdownTicks: boolean;
  haptics: boolean;
  wakeLock: boolean;
}

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  audio: true,
  countdownTicks: true,
  haptics: true,
  wakeLock: true,
};

// ---------------------------------------------------------------------------
// Dirty-key tracking (BUG-01). Records which KEYS this device has changed since
// its last acknowledged push, so a push can carry only real writes instead of
// the whole store. A key that is dirty but missing from its map is a deletion
// and is sent as a tombstone. Full design: top of src/app/api/sync/route.ts.
// ---------------------------------------------------------------------------

/** Set of changed keys within one map. */
export type DirtyKeys = Record<string, true>;

export interface DirtyState {
  completions: DirtyKeys;
  logs: DirtyKeys;
  recovery: DirtyKeys;
  /** habitId -> date -> changed */
  habits: Record<string, DirtyKeys>;
  level: boolean;
}

export const emptyDirty = (): DirtyState => ({
  completions: {},
  logs: {},
  recovery: {},
  habits: {},
  level: false,
});

const withKey = (map: DirtyKeys | undefined, key: string): DirtyKeys => ({ ...(map || {}), [key]: true });

const withKeys = (map: DirtyKeys | undefined, keys: string[]): DirtyKeys => {
  const next: DirtyKeys = { ...(map || {}) };
  for (const k of keys) next[k] = true;
  return next;
};

/**
 * Merge completion records with prefer-true semantics: a set is marked complete
 * if either side has it as complete. Prevents stale server state from erasing
 * a fresh local completion during the race between a gym tap and the debounced
 * push. To untoggle, the user flips locally, which writes false to both sides
 * on the next sync.
 *
 * Exported for direct unit coverage of the merge rule.
 */
export function mergeCompletionsPreferTrue(
  local: CompletionRecord,
  incoming: CompletionRecord | undefined,
): CompletionRecord {
  const merged: CompletionRecord = { ...local };
  if (incoming) {
    for (const [key, value] of Object.entries(incoming)) {
      merged[key] = Boolean(merged[key]) || Boolean(value);
    }
  }
  return merged;
}

/** A fresh, independently-mutable copy of the default habit list. */
export const seedDefaultHabits = (): HabitDef[] => DEFAULT_HABITS.map((h) => ({ id: h.id, label: h.label }));

export interface HabitDefsState {
  habitDefs: HabitDef[];
  // Server-assigned version this list is based on (0 until the server mints one).
  habitDefsVersion: number;
  // True when there's a local edit not yet acknowledged by the server.
  habitDefsDirty: boolean;
}

/**
 * Decide the winning habit-def list when server data arrives on hydrate. The
 * merge key is the SERVER-ASSIGNED `habitDefsVersion`, never a client clock, so a
 * device with a skewed clock can neither win merges nor strand another device's
 * edit (the old `habitDefsUpdatedAt` bug). The server is the only minter of
 * versions; clients only ever adopt them.
 *
 * Rules: adopt the server list when local is empty. Otherwise, a pending local
 * edit (`habitDefsDirty`) beats ANY server list — BUG-02: gating only the
 * equal-version tiebreaker on `habitDefsDirty` meant a merely-newer server
 * version silently ate an unpushed rename/add/delete/reorder AND cleared the
 * dirty flag, so the edit stopped being tracked as needing a re-send. When not
 * dirty, adopt a strictly-newer server version; on an exact-version tie with
 * differing content, fall back to a deterministic content comparison (defense,
 * kept from the original design) so two devices converge rather than diverge.
 *
 * When a dirty edit wins over a newer server version we still adopt the server's
 * VERSION as the edit's new CAS base. Without that rebase the edit's next push
 * carries a stale base, the server rejects it (resolveHabitDefs), and the edit
 * can never land — it would be protected here only to starve in the ack path.
 *
 * Exported for direct unit coverage.
 */
export function mergeHabitDefs(
  local: HabitDefsState,
  incoming: { habitDefs?: HabitDef[]; habitDefsVersion?: number },
): HabitDefsState {
  let habitDefs = local.habitDefs;
  let habitDefsVersion = local.habitDefsVersion;
  let habitDefsDirty = local.habitDefsDirty;

  if (incoming.habitDefs && incoming.habitDefs.length > 0) {
    const serverV = incoming.habitDefsVersion ?? 0;
    const localV = local.habitDefsVersion ?? 0;
    const localEmpty = !local.habitDefs || local.habitDefs.length === 0;
    const serverWins =
      localEmpty ||
      (!local.habitDefsDirty &&
        (serverV > localV ||
          (serverV === localV &&
            JSON.stringify(incoming.habitDefs) > JSON.stringify(local.habitDefs))));
    if (serverWins) {
      habitDefs = incoming.habitDefs;
      habitDefsVersion = serverV;
      habitDefsDirty = false; // we just adopted the server's list
    } else if (local.habitDefsDirty && serverV > localV) {
      // Keep the unpushed edit, but rebase it onto the version it now conflicts
      // with so the retry's CAS token is current and the edit is accepted.
      habitDefsVersion = serverV;
    }
  }

  // Safety net: never leave the user staring at an empty habit list.
  if (!habitDefs || habitDefs.length === 0) {
    habitDefs = seedDefaultHabits();
    habitDefsVersion = 0;
    habitDefsDirty = false;
  }

  return { habitDefs, habitDefsVersion, habitDefsDirty };
}

/**
 * Persist migrations:
 *  - v0 -> v1: fold the old per-habit top-level fields (notWatch, noGamble, ...)
 *    into a single `habits` map so existing local streaks survive the
 *    data-driven refactor.
 *  - v1 -> v2: seed `habitDefs` from DEFAULT_HABITS for existing users who
 *    predate per-user habit lists. Their `habits` completion map keeps working
 *    since the seeded ids match the old hardcoded ids.
 * Exported for direct unit coverage.
 */
export function migrateHabitsState(persisted: unknown, version: number): unknown {
  const s = (persisted ?? {}) as Record<string, unknown>;
  if (version < 1) {
    const habits = (s.habits as Record<string, DailyHabitRecord>) || {};
    for (const id of LEGACY_HABIT_IDS) {
      const rec = s[id] as DailyHabitRecord | undefined;
      if (rec && Object.keys(rec).length > 0) habits[id] = rec;
      delete s[id];
    }
    s.habits = habits;
  }
  if (version < 2) {
    if (!Array.isArray(s.habitDefs) || (s.habitDefs as unknown[]).length === 0) {
      s.habitDefs = seedDefaultHabits();
    }
  }
  if (version < 3) {
    // The client wall-clock `habitDefsUpdatedAt` is replaced by a
    // server-assigned `habitDefsVersion`. Drop the (possibly skewed) timestamp
    // and reset everyone to version 0 / not-dirty; the server mints real
    // versions from the next content change onward.
    delete s.habitDefsUpdatedAt;
    if (typeof s.habitDefsVersion !== "number") s.habitDefsVersion = 0;
    if (typeof s.habitDefsDirty !== "boolean") s.habitDefsDirty = false;
  }
  if (version < 4) {
    // v3 -> v4: add dirty-key tracking (BUG-01). Purely additive — nothing
    // existing is read or rewritten. Starting empty is safe because the first
    // push after any load is still a full-map push (see useSync), so local
    // work that predates this migration still reaches the server.
    if (!s.dirty || typeof s.dirty !== "object") s.dirty = emptyDirty();
  }
  if (version < 5) {
    // v4 -> v5: BUG-13. Before the tri-state redesign (commit 989297d,
    // 2026-08-26 15:14 ET) `false` was written by the old binary toggle and
    // meant "unchecked", not an explicit "missed" — but the tri-state UI now
    // renders any `false` as a red X. Remove every habit date key whose value
    // is `false` and whose date is on/before the cutoff, and mark those
    // removals dirty so the next push tombstones them on the server too (S1's
    // delta/tombstone design — the same mechanism clearHabit uses). Dates from
    // 2026-08-26 onward are genuine post-redesign misses and are left alone.
    //
    // B2 mitigation: the cutoff is inferred from the commit timestamp, not a
    // confirmed deploy date, and this migration is one-shot and destructive
    // (both locally and, via the tombstone, server-side) with no second
    // pass. Every removed {habitId, date} is copied into `habitFalseBackupV5`
    // before deletion, so a wrong cutoff can still be recovered by hand. This
    // field is persisted locally but deliberately never synced — see
    // getSyncPayload/getSyncDelta/partialize below, and it is excluded there
    // on purpose so a backup of a deletion is never itself pushed anywhere.
    const CUTOFF = "2026-08-25";
    const habits = (s.habits as Record<string, DailyHabitRecord>) || {};
    const dirty: DirtyState =
      s.dirty && typeof s.dirty === "object" ? (s.dirty as DirtyState) : emptyDirty();
    const dirtyHabits: Record<string, DirtyKeys> = { ...dirty.habits };
    const existingBackup =
      s.habitFalseBackupV5 && typeof s.habitFalseBackupV5 === "object"
        ? (s.habitFalseBackupV5 as Record<string, DailyHabitRecord>)
        : {};
    const backup: Record<string, DailyHabitRecord> = Object.fromEntries(
      Object.entries(existingBackup).map(([id, rec]) => [id, { ...rec }]),
    );
    for (const [id, rec] of Object.entries(habits)) {
      if (!rec) continue;
      const nextRec = { ...rec };
      let touched = false;
      for (const [date, value] of Object.entries(rec)) {
        if (value === false && date <= CUTOFF) {
          delete nextRec[date];
          dirtyHabits[id] = withKey(dirtyHabits[id], date);
          backup[id] = { ...(backup[id] || {}), [date]: false };
          touched = true;
        }
      }
      if (touched) habits[id] = nextRec;
    }
    s.habits = habits;
    s.dirty = { ...dirty, habits: dirtyHabits };
    s.habitFalseBackupV5 = backup;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Per-account local persistence (BUG-03). One fixed localStorage key meant a
// second account signing in on the same device inherited — and then pushed —
// the previous account's data. Each account now gets its own key; the original
// unscoped key is adopted once, by the first account that loads, so the
// existing install keeps its data.
// ---------------------------------------------------------------------------

/** The original, un-scoped key. Still written by older cached bundles. */
export const LEGACY_STORE_KEY = "workout-store";
/** Marks which account already adopted the legacy key's contents. */
const LEGACY_CLAIM_KEY = "workout-store:adopted-by";
/** Throwaway key persist is pointed at while resetting in-memory state during
 *  an account switch (B1), so the reset's setItem can never land on the
 *  outgoing account's real key or a not-yet-rehydrated incoming key. */
const RESET_SCRATCH_KEY = "workout-store:__scratch__";

export const storeKeyForAccount = (accountId: string | null): string =>
  accountId ? `${LEGACY_STORE_KEY}:${accountId}` : `${LEGACY_STORE_KEY}:signed-out`;

const safeLocalStorage = (): Storage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** Key whose writes are mirrored back to the legacy key, so an older cached
 *  bundle that still reads `workout-store` never sees a frozen snapshot. */
let mirrorToLegacyFrom: string | null = null;

const accountStorage = {
  getItem: (name: string) => safeLocalStorage()?.getItem(name) ?? null,
  setItem: (name: string, value: string) => {
    const ls = safeLocalStorage();
    if (!ls) return;
    ls.setItem(name, value);
    if (name === mirrorToLegacyFrom) ls.setItem(LEGACY_STORE_KEY, value);
  },
  removeItem: (name: string) => safeLocalStorage()?.removeItem(name),
};

interface WorkoutState {
  // Data
  completions: CompletionRecord;
  logs: WorkoutLogRecord;
  level: Level;
  theme: Theme;
  recoveryData: RecoveryData;
  notifSettings: NotificationSettings;
  timerSettings: TimerSettings;
  selectedDay: string;
  ouraLastSynced: string | null;
  eightSleepLastSynced: string | null;
  // All daily-habit completion data, keyed by habit id -> { date -> done }.
  habits: Record<string, DailyHabitRecord>;
  // Per-user habit definitions (id + label), in display order. The UI renders
  // this list; the `habits` map above keys completion data by these ids.
  habitDefs: HabitDef[];
  // Server-assigned version this habitDefs list is based on (0 until the server
  // mints one). The merge key, replacing the old client-clock timestamp so a
  // skewed clock can't win merges. See mergeHabitDefs.
  habitDefsVersion: number;
  // True when there's a local habitDefs edit not yet acknowledged by the server.
  habitDefsDirty: boolean;
  // Keys changed on this device since its last acked push (BUG-01). Persisted,
  // so an edit made offline still pushes after a reload.
  dirty: DirtyState;
  // B2 mitigation: every {habitId, date: false} deleted by the v4->v5 cutoff
  // migration, kept so a wrong cutoff can be restored by hand. Persisted
  // locally, deliberately NEVER sent to the server — see getSyncPayload,
  // getSyncDelta and partialize.
  habitFalseBackupV5: Record<string, DailyHabitRecord>;

  // UI state
  mounted: boolean;

  // Actions
  toggleCompletion: (key: string) => void;
  saveLog: (key: string, entry: WorkoutLogEntry) => void;
  setLevel: (level: Level) => void;
  setTheme: (theme: Theme) => void;
  setRecoveryData: (data: RecoveryData) => void;
  mergeRecoveryData: (data: Partial<RecoveryData>) => void;
  setNotifSettings: (settings: NotificationSettings) => void;
  setTimerSettings: (settings: TimerSettings) => void;
  setSelectedDay: (day: string) => void;
  setMounted: (mounted: boolean) => void;
  toggleHabit: (habitId: string, date: string) => void;
  setHabit: (habitId: string, date: string, done: boolean) => void;
  /**
   * Clear one habit date back to UNRECORDED (undefined) — not to the tri-state
   * "missed" (false). The removal is tracked as dirty and leaves the client as
   * a tombstone on the next push, so the server deletes the key rather than
   * re-merging its old value. This is the deletion entry point for BUG-13/14.
   */
  clearHabit: (habitId: string, date: string) => void;

  // Habit-list management (Settings)
  addHabit: (label: string) => void;
  renameHabit: (id: string, label: string) => void;
  removeHabit: (id: string) => void;
  moveHabit: (id: string, direction: "up" | "down") => void;
  // Reconcile local habitDefs with the server's canonical answer after a push.
  applyHabitDefsAck: (
    acked: { habitDefs?: HabitDef[]; habitDefsVersion?: number },
    sent: HabitDef[],
  ) => void;

  // Bulk operations for sync
  hydrateFromSync: (data: {
    completions?: CompletionRecord;
    logs?: WorkoutLogRecord;
    level?: Level;
    recovery?: RecoveryData;
    habits?: Record<string, DailyHabitRecord>;
    habitDefs?: HabitDef[];
    habitDefsVersion?: number;
    // Legacy top-level habit fields, read once to migrate old synced data.
    notWatch?: DailyHabitRecord;
    noGamble?: DailyHabitRecord;
    noNicotine?: DailyHabitRecord;
    ash?: DailyHabitRecord;
    meditation?: DailyHabitRecord;
    ouraLastSynced?: string;
    eightSleepLastSynced?: string;
  }) => void;
  /** Full-store snapshot. Used only for the one bootstrap push per load, which
   *  is what carries local work the server has never seen. */
  getSyncPayload: () => {
    completions: CompletionRecord;
    logs: WorkoutLogRecord;
    level: Level;
    recovery: RecoveryData;
    habits: Record<string, DailyHabitRecord>;
    habitDefs: HabitDef[];
    habitDefsVersion: number;
  };
  /** Only the keys this device changed since its last acked push, plus
   *  tombstones for the ones it removed. Every push after the bootstrap one. */
  getSyncDelta: () => SyncPayload & { habitDefs: HabitDef[]; habitDefsVersion: number };
  /** Retire the dirty marks a successful push settled. A key is only cleared if
   *  its current value still matches what was sent, so an edit made while the
   *  request was in flight stays dirty and goes out on the next push. */
  clearDirty: (sent: SyncPayload) => void;
}

const DEFAULT_NOTIF_SETTINGS: NotificationSettings = {
  enabled: false,
  times: {
    Monday: "17:00", Tuesday: "17:00", Wednesday: "07:00",
    Thursday: "12:00", Friday: "17:00", Saturday: "09:00", Sunday: "10:00",
  },
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set, get) => ({
      // Initial state
      completions: {},
      logs: {},
      level: "beginner" as Level,
      theme: "system" as Theme,
      recoveryData: {},
      notifSettings: DEFAULT_NOTIF_SETTINGS,
      timerSettings: DEFAULT_TIMER_SETTINGS,
      selectedDay: DAYS[new Date().getDay()],
      ouraLastSynced: null,
      eightSleepLastSynced: null,
      habits: {},
      habitDefs: seedDefaultHabits(),
      habitDefsVersion: 0,
      habitDefsDirty: false,
      dirty: emptyDirty(),
      habitFalseBackupV5: {},
      mounted: false,

      // Actions
      toggleCompletion: (key) =>
        set((state) => ({
          completions: { ...state.completions, [key]: !state.completions[key] },
          dirty: { ...state.dirty, completions: withKey(state.dirty.completions, key) },
        })),

      saveLog: (key, entry) =>
        set((state) => ({
          logs: { ...state.logs, [key]: entry },
          dirty: { ...state.dirty, logs: withKey(state.dirty.logs, key) },
        })),

      setLevel: (level) => set((state) => ({ level, dirty: { ...state.dirty, level: true } })),

      setTheme: (theme) => set({ theme }),

      setRecoveryData: (recoveryData) =>
        set((state) => ({
          recoveryData,
          dirty: { ...state.dirty, recovery: withKeys(state.dirty.recovery, Object.keys(recoveryData)) },
        })),

      mergeRecoveryData: (partial) =>
        set((state) => {
          const merged = { ...state.recoveryData };
          const touched: string[] = [];
          for (const [key, value] of Object.entries(partial)) {
            if (value) {
              merged[key] = value;
              touched.push(key);
            }
          }
          return {
            recoveryData: merged,
            dirty: { ...state.dirty, recovery: withKeys(state.dirty.recovery, touched) },
          };
        }),

      setNotifSettings: (notifSettings) => set({ notifSettings }),

      setTimerSettings: (timerSettings) => set({ timerSettings }),

      setSelectedDay: (selectedDay) => set({ selectedDay }),

      setMounted: (mounted) => set({ mounted }),

      toggleHabit: (habitId, date) =>
        set((state) => ({
          habits: {
            ...state.habits,
            [habitId]: { ...(state.habits[habitId] || {}), [date]: !state.habits[habitId]?.[date] },
          },
          dirty: {
            ...state.dirty,
            habits: { ...state.dirty.habits, [habitId]: withKey(state.dirty.habits[habitId], date) },
          },
        })),

      setHabit: (habitId, date, done) =>
        set((state) => ({
          habits: {
            ...state.habits,
            [habitId]: { ...(state.habits[habitId] || {}), [date]: done },
          },
          dirty: {
            ...state.dirty,
            habits: { ...state.dirty.habits, [habitId]: withKey(state.dirty.habits[habitId], date) },
          },
        })),

      clearHabit: (habitId, date) =>
        set((state) => {
          const rec = { ...(state.habits[habitId] || {}) };
          delete rec[date];
          return {
            habits: { ...state.habits, [habitId]: rec },
            // Dirty-but-absent is what turns into a tombstone in getSyncDelta.
            dirty: {
              ...state.dirty,
              habits: { ...state.dirty.habits, [habitId]: withKey(state.dirty.habits[habitId], date) },
            },
          };
        }),

      addHabit: (label) =>
        set((state) => {
          const trimmed = label.trim();
          if (!trimmed) return {};
          // Dedupe against current def ids AND orphaned completion-map keys so a
          // re-added habit gets a fresh id instead of silently inheriting a
          // deleted habit's old streak.
          const taken = [...state.habitDefs.map((h) => h.id), ...Object.keys(state.habits)];
          const id = makeHabitId(trimmed, taken);
          // Mark dirty (not a version bump): the version is server-assigned and
          // gets minted when this edit is pushed and acked.
          return {
            habitDefs: [...state.habitDefs, { id, label: trimmed }],
            habitDefsDirty: true,
          };
        }),

      renameHabit: (id, label) =>
        set((state) => {
          const trimmed = label.trim();
          if (!trimmed) return {};
          return {
            habitDefs: state.habitDefs.map((h) => (h.id === id ? { ...h, label: trimmed } : h)),
            habitDefsDirty: true,
          };
        }),

      removeHabit: (id) =>
        set((state) => {
          // Keep at least one habit: an empty list is not a supported state
          // (it would sync as [] and then resurrect to defaults). The UI also
          // disables the last delete, so this is belt-and-suspenders.
          const exists = state.habitDefs.some((h) => h.id === id);
          if (!exists || state.habitDefs.length <= 1) return {};
          return {
            habitDefs: state.habitDefs.filter((h) => h.id !== id),
            habitDefsDirty: true,
          };
        }),

      moveHabit: (id, direction) =>
        set((state) => {
          const idx = state.habitDefs.findIndex((h) => h.id === id);
          if (idx === -1) return {};
          const target = direction === "up" ? idx - 1 : idx + 1;
          if (target < 0 || target >= state.habitDefs.length) return {};
          const next = [...state.habitDefs];
          [next[idx], next[target]] = [next[target], next[idx]];
          return { habitDefs: next, habitDefsDirty: true };
        }),

      applyHabitDefsAck: (acked, sent) =>
        set((state) => {
          // The server returns its canonical list + version after a push. Only
          // adopt it if the user hasn't edited again since `sent` was captured
          // (current list still equals `sent`), so a mid-flight edit isn't
          // reverted - that edit triggers its own follow-up push which settles
          // it. This handles both accept (server echoes `sent` with a new
          // version) and reject/conflict (server returns the winning list).
          if (acked.habitDefs === undefined || acked.habitDefsVersion === undefined) return {};
          if (!habitDefsEqual(state.habitDefs, sent)) return {};
          if (state.habitDefsDirty && !habitDefsEqual(acked.habitDefs, sent)) {
            // BUG-02: REJECTED, not accepted — the server kept a different list
            // because our CAS base was stale. Adopting it here would delete the
            // edit outright. Keep it, take the server's version as the new base,
            // and stay dirty so the caller re-sends it against that base.
            return { habitDefsVersion: acked.habitDefsVersion, habitDefsDirty: true };
          }
          return {
            habitDefs: acked.habitDefs,
            habitDefsVersion: acked.habitDefsVersion,
            habitDefsDirty: false,
          };
        }),

      hydrateFromSync: (data) =>
        set((state) => {
          // BUG-01/BUG-04 merge rule for hydrate: a key this device has changed
          // but not yet had acked (dirty) keeps its LOCAL value — including
          // "locally deleted" — and everything else takes the server's value.
          // Prefer-true stays underneath as the pre-dirty-tracking safety net
          // for completions (where false only ever means "not yet"), but it is
          // wrong for habits, which since the tri-state redesign use false to
          // mean an explicit "missed" the user typed on purpose.
          const restoreLocal = <T,>(
            merged: Record<string, T>,
            local: Record<string, T>,
            dirtyKeys: DirtyKeys,
          ): Record<string, T> => {
            for (const key of Object.keys(dirtyKeys)) {
              if (key in local) merged[key] = local[key];
              else delete merged[key];
            }
            return merged;
          };

          // V19: prefer-true merge for completions. See mergeCompletionsPreferTrue above.
          const mergedCompletions = restoreLocal(
            mergeCompletionsPreferTrue(state.completions, data.completions),
            state.completions,
            state.dirty.completions,
          );

          // Deep-merge recovery: merge each date's entry, not just top-level keys
          const mergedRecovery = { ...state.recoveryData };
          if (data.recovery) {
            for (const [date, entry] of Object.entries(data.recovery)) {
              if (entry) {
                const existing = mergedRecovery[date] || { date };
                mergedRecovery[date] = {
                  ...existing,
                  ...entry,
                  eightSleep: { ...existing.eightSleep, ...entry.eightSleep },
                  oura: { ...existing.oura, ...entry.oura },
                };
              }
            }
          }
          // BUG-04: dirty-wins, NOT prefer-true. `false` here is an explicit
          // "missed" the user tapped, so ORing it against a stale server `true`
          // silently un-misses the day. A date this device changed and hasn't
          // had acked keeps its local value (or stays deleted); any other date
          // takes the server's, which is the converged value.
          const mergeDailyHabit = (
            local: DailyHabitRecord,
            incoming: DailyHabitRecord | undefined,
            dirtyDates: DirtyKeys,
          ): DailyHabitRecord => {
            const merged: DailyHabitRecord = { ...local };
            if (incoming) {
              for (const [date, value] of Object.entries(incoming)) {
                if (dirtyDates[date]) continue; // pending local edit wins
                merged[date] = value;
              }
            }
            return merged;
          };

          const mergedHabits: Record<string, DailyHabitRecord> = { ...state.habits };
          if (data.habits) {
            for (const [id, rec] of Object.entries(data.habits)) {
              const localRec = mergedHabits[id];
              // Dirty marks only mean something against a record we actually
              // hold. clearHabit() removes a DATE and leaves the record object
              // in place, so "no record at all" is never a deletion — it's a
              // habit this device has simply never seen, and the server's copy
              // is the only copy.
              mergedHabits[id] = mergeDailyHabit(
                localRec || {},
                rec,
                localRec ? state.dirty.habits[id] || {} : {},
              );
            }
          }
          // One-way migration of legacy top-level habit fields: fill only the
          // dates the map doesn't already have, so a post-migration uncheck is
          // never resurrected by stale server data.
          const foldLegacy = (id: string, incoming?: DailyHabitRecord) => {
            if (!incoming) return;
            const result: DailyHabitRecord = { ...(mergedHabits[id] || {}) };
            for (const [date, value] of Object.entries(incoming)) {
              if (!(date in result)) result[date] = value;
            }
            mergedHabits[id] = result;
          };
          foldLegacy("notWatch", data.notWatch);
          foldLegacy("noGamble", data.noGamble);
          foldLegacy("noNicotine", data.noNicotine);
          foldLegacy("ash", data.ash);
          foldLegacy("meditation", data.meditation);

          // habitDefs merges on a SERVER-ASSIGNED version (defeats clock skew).
          // See mergeHabitDefs for the full rationale.
          const mergedDefs = mergeHabitDefs(
            {
              habitDefs: state.habitDefs,
              habitDefsVersion: state.habitDefsVersion,
              habitDefsDirty: state.habitDefsDirty,
            },
            { habitDefs: data.habitDefs, habitDefsVersion: data.habitDefsVersion },
          );

          return {
            completions: mergedCompletions,
            logs: restoreLocal({ ...state.logs, ...(data.logs || {}) }, state.logs, state.dirty.logs),
            // A level this device changed but hasn't had acked isn't overwritten
            // by the server copy that predates it (BUG-01, the `level` case).
            level: state.dirty.level ? state.level : (data.level || state.level),
            recoveryData: mergedRecovery,
            habits: mergedHabits,
            habitDefs: mergedDefs.habitDefs,
            habitDefsVersion: mergedDefs.habitDefsVersion,
            habitDefsDirty: mergedDefs.habitDefsDirty,
            ouraLastSynced: data.ouraLastSynced || state.ouraLastSynced,
            eightSleepLastSynced: data.eightSleepLastSynced || state.eightSleepLastSynced,
          };
        }),

      getSyncPayload: () => {
        const { completions, logs, level, recoveryData, habits, habitDefs, habitDefsVersion } = get();
        // habitDefsVersion is sent as the CAS base (the version this list is
        // based on); the server mints the next version from it.
        return { completions, logs, level, recovery: recoveryData, habits, habitDefs, habitDefsVersion };
      },

      getSyncDelta: () => {
        const { completions, logs, recoveryData, habits, level, habitDefs, habitDefsVersion, dirty } = get();
        // habitDefs is always sent: it is already CAS-versioned server-side, so
        // it is not part of the last-write-wins problem, and sending it keeps
        // the ack path (applyHabitDefsAck) working exactly as before.
        const delta: SyncPayload & { habitDefs: HabitDef[]; habitDefsVersion: number } = {
          syncMode: "delta",
          habitDefs,
          habitDefsVersion,
        };
        const tombstones: SyncTombstones = {};

        // A dirty key present in the map is a write; a dirty key missing from
        // the map is a deletion.
        const split = <T,>(dirtyKeys: DirtyKeys, source: Record<string, T>) => {
          const values: Record<string, T> = {};
          const removed: string[] = [];
          for (const key of Object.keys(dirtyKeys)) {
            if (key in source) values[key] = source[key];
            else removed.push(key);
          }
          return { values, removed };
        };

        const c = split(dirty.completions, completions);
        if (Object.keys(c.values).length) delta.completions = c.values;
        if (c.removed.length) tombstones.completions = c.removed;

        const l = split(dirty.logs, logs);
        if (Object.keys(l.values).length) delta.logs = l.values;
        if (l.removed.length) tombstones.logs = l.removed;

        const r = split(dirty.recovery, recoveryData);
        if (Object.keys(r.values).length) delta.recovery = r.values;
        if (r.removed.length) tombstones.recovery = r.removed;

        const habitWrites: Record<string, DailyHabitRecord> = {};
        const habitDrops: Record<string, string[]> = {};
        for (const [habitId, dates] of Object.entries(dirty.habits)) {
          const h = split(dates, habits[habitId] || {});
          if (Object.keys(h.values).length) habitWrites[habitId] = h.values;
          if (h.removed.length) habitDrops[habitId] = h.removed;
        }
        if (Object.keys(habitWrites).length) delta.habits = habitWrites;
        if (Object.keys(habitDrops).length) tombstones.habits = habitDrops;

        if (dirty.level) delta.level = level;
        if (Object.keys(tombstones).length) delta.tombstones = tombstones;
        return delta;
      },

      clearDirty: (sent) =>
        set((state) => {
          const next: DirtyState = {
            completions: { ...state.dirty.completions },
            logs: { ...state.dirty.logs },
            recovery: { ...state.dirty.recovery },
            habits: Object.fromEntries(
              Object.entries(state.dirty.habits).map(([id, dates]) => [id, { ...dates }]),
            ),
            level: state.dirty.level,
          };

          // Retire a mark only when the store still holds exactly what went out;
          // anything the user changed mid-flight stays dirty for the next push.
          const settle = (
            marks: DirtyKeys,
            sentValues: Record<string, unknown> | undefined,
            sentRemovals: string[] | undefined,
            current: Record<string, unknown>,
          ) => {
            for (const [key, value] of Object.entries(sentValues || {})) {
              if (current[key] === value) delete marks[key];
            }
            for (const key of sentRemovals || []) {
              if (!(key in current)) delete marks[key];
            }
          };

          const t = sent.tombstones;
          settle(next.completions, sent.completions, t?.completions, state.completions);
          settle(next.logs, sent.logs, t?.logs, state.logs);
          settle(next.recovery, sent.recovery, t?.recovery, state.recoveryData);
          for (const [habitId, dates] of Object.entries(next.habits)) {
            settle(dates, sent.habits?.[habitId], t?.habits?.[habitId], state.habits[habitId] || {});
            if (Object.keys(dates).length === 0) delete next.habits[habitId];
          }
          if (next.level && sent.level !== undefined && state.level === sent.level) next.level = false;

          return { dirty: next };
        }),
    }),
    {
      // Starts on the legacy key so an existing install loads exactly as it did
      // before; setPersistAccount() below re-points it at the per-account key
      // as soon as the signed-in account is known (BUG-03).
      name: LEGACY_STORE_KEY,
      storage: createJSONStorage(() => accountStorage),
      partialize: (state) => ({
        completions: state.completions,
        logs: state.logs,
        level: state.level,
        theme: state.theme,
        recoveryData: state.recoveryData,
        notifSettings: state.notifSettings,
        timerSettings: state.timerSettings,
        habits: state.habits,
        habitDefs: state.habitDefs,
        habitDefsVersion: state.habitDefsVersion,
        // Persisted so an edit made offline survives a reload and still pushes.
        habitDefsDirty: state.habitDefsDirty,
        // Same reason: an offline tap must still be known to be unpushed after
        // a reload, or its delta would never be sent.
        dirty: state.dirty,
        // B2 mitigation: persisted so it survives a reload, but intentionally
        // NOT part of getSyncPayload/getSyncDelta — it never leaves this
        // device.
        habitFalseBackupV5: state.habitFalseBackupV5,
      }),
      version: 5,
      migrate: (persisted, version) => migrateHabitsState(persisted, version) as unknown as WorkoutState,
    }
  )
);

/** Data fields reset on an account change. UI-only state (theme, selectedDay,
 *  mounted) is deliberately left alone — it isn't anyone's data. */
const freshAccountState = () => ({
  completions: {},
  logs: {},
  level: "beginner" as Level,
  recoveryData: {},
  notifSettings: DEFAULT_NOTIF_SETTINGS,
  habits: {},
  habitDefs: seedDefaultHabits(),
  habitDefsVersion: 0,
  habitDefsDirty: false,
  dirty: emptyDirty(),
  habitFalseBackupV5: {},
  ouraLastSynced: null,
  eightSleepLastSynced: null,
});

/**
 * Point local persistence at `accountId`'s own key and load that account's data
 * (BUG-03). Must run — and settle — before any sync is enabled for the account,
 * otherwise whatever the previous account left behind gets pushed into the new
 * account's server record.
 *
 * The first account to call this adopts the contents of the original un-scoped
 * key, so the existing install keeps its history. The claim is recorded so a
 * second account on the same device can never adopt it too. Writes for the
 * adopting account are mirrored back to the legacy key, so an older cached PWA
 * bundle that still reads `workout-store` doesn't see a frozen snapshot.
 */
export async function setPersistAccount(accountId: string | null): Promise<void> {
  const key = storeKeyForAccount(accountId);
  const persistApi = useWorkoutStore.persist;
  if (persistApi.getOptions().name === key) return;

  const ls = safeLocalStorage();
  if (ls && accountId) {
    const claimedBy = ls.getItem(LEGACY_CLAIM_KEY);
    const legacy = ls.getItem(LEGACY_STORE_KEY);
    if (!claimedBy && legacy !== null && ls.getItem(key) === null) {
      ls.setItem(key, legacy);
      ls.setItem(LEGACY_CLAIM_KEY, accountId);
      mirrorToLegacyFrom = key;
    } else if (claimedBy === accountId) {
      mirrorToLegacyFrom = key;
    } else {
      mirrorToLegacyFrom = null;
    }
  } else {
    mirrorToLegacyFrom = null;
  }

  // Drop the outgoing account's data BEFORE rehydrating: persist's default
  // merge is a shallow spread over current state, so anything the incoming
  // account has no value for would otherwise survive the switch.
  //
  // B1: useWorkoutStore.setState is persist-wrapped — it calls setItem()
  // against whatever key persistApi.getOptions().name is AT THAT MOMENT. The
  // old code called setState(fresh) while still pointed at the OUTGOING
  // key, so the empty reset blob was serialized straight over the account
  // being left (wiping its data and its unpushed `dirty` marks) and
  // rehydrate() never repaired it (v5 -> v5 isn't a migration, so hydrate()
  // never re-runs setItem). Point persist at a scratch key for the reset
  // itself, so neither the outgoing key nor the not-yet-rehydrated incoming
  // key can be clobbered by the fresh/empty state.
  persistApi.setOptions({ name: RESET_SCRATCH_KEY });
  useWorkoutStore.setState(freshAccountState());
  persistApi.setOptions({ name: key });
  await persistApi.rehydrate();
}
