import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Level } from "@/lib/workoutData";
import { LEGACY_HABIT_IDS, DEFAULT_HABITS, makeHabitId, habitDefsEqual, type HabitDef } from "@/lib/habits";
import type {
  CompletionRecord,
  WorkoutLogRecord,
  WorkoutLogEntry,
  NotificationSettings,
  DailyHabitRecord,
  RecoveryData,
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
 * Rules: adopt the server list when local is empty, or the server version is
 * strictly newer. On an exact-version tie with differing content, fall back to a
 * deterministic content comparison (defense, kept from the original design) so
 * two devices converge instead of diverging silently. That tiebreaker is skipped
 * while a local edit is pending (`habitDefsDirty`) so an equal-version server
 * echo can't clobber a change that's about to be pushed.
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
      serverV > localV ||
      (!local.habitDefsDirty &&
        serverV === localV &&
        JSON.stringify(incoming.habitDefs) > JSON.stringify(local.habitDefs));
    if (serverWins) {
      habitDefs = incoming.habitDefs;
      habitDefsVersion = serverV;
      habitDefsDirty = false; // we just adopted the server's list
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
  return s;
}

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
  getSyncPayload: () => {
    completions: CompletionRecord;
    logs: WorkoutLogRecord;
    level: Level;
    recovery: RecoveryData;
    habits: Record<string, DailyHabitRecord>;
    habitDefs: HabitDef[];
    habitDefsVersion: number;
  };
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
      mounted: false,

      // Actions
      toggleCompletion: (key) =>
        set((state) => ({
          completions: { ...state.completions, [key]: !state.completions[key] },
        })),

      saveLog: (key, entry) =>
        set((state) => ({
          logs: { ...state.logs, [key]: entry },
        })),

      setLevel: (level) => set({ level }),

      setTheme: (theme) => set({ theme }),

      setRecoveryData: (recoveryData) => set({ recoveryData }),

      mergeRecoveryData: (partial) =>
        set((state) => {
          const merged = { ...state.recoveryData };
          for (const [key, value] of Object.entries(partial)) {
            if (value) merged[key] = value;
          }
          return { recoveryData: merged };
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
        })),

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
          return {
            habitDefs: acked.habitDefs,
            habitDefsVersion: acked.habitDefsVersion,
            habitDefsDirty: false,
          };
        }),

      hydrateFromSync: (data) =>
        set((state) => {
          // V19: prefer-true merge for completions. See mergeCompletionsPreferTrue above.
          const mergedCompletions = mergeCompletionsPreferTrue(state.completions, data.completions);

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
          // Prefer-true merge for daily habit toggles, same rationale as completions:
          // protects an in-flight local tap from being overwritten by stale server state.
          const mergeDailyHabit = (local: DailyHabitRecord, incoming?: DailyHabitRecord): DailyHabitRecord => {
            const merged: DailyHabitRecord = { ...local };
            if (incoming) {
              for (const [date, value] of Object.entries(incoming)) {
                merged[date] = Boolean(merged[date]) || Boolean(value);
              }
            }
            return merged;
          };

          // Merge the data-driven habits map (prefer-true, like completions).
          const mergedHabits: Record<string, DailyHabitRecord> = { ...state.habits };
          if (data.habits) {
            for (const [id, rec] of Object.entries(data.habits)) {
              mergedHabits[id] = mergeDailyHabit(mergedHabits[id] || {}, rec);
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
            logs: { ...state.logs, ...(data.logs || {}) },
            level: data.level || state.level,
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
    }),
    {
      name: "workout-store",
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
      }),
      version: 3,
      migrate: (persisted, version) => migrateHabitsState(persisted, version) as unknown as WorkoutState,
    }
  )
);
