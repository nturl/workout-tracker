import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Level } from "@/lib/workoutData";
import { LEGACY_HABIT_IDS } from "@/lib/habits";
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

/**
 * Persist migration v0 -> v1: fold the old per-habit top-level fields
 * (notWatch, noGamble, ...) into a single `habits` map so existing local
 * streaks survive the data-driven refactor. Exported for direct unit coverage.
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

  // Bulk operations for sync
  hydrateFromSync: (data: {
    completions?: CompletionRecord;
    logs?: WorkoutLogRecord;
    level?: Level;
    recovery?: RecoveryData;
    habits?: Record<string, DailyHabitRecord>;
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

          return {
            completions: mergedCompletions,
            logs: { ...state.logs, ...(data.logs || {}) },
            level: data.level || state.level,
            recoveryData: mergedRecovery,
            habits: mergedHabits,
            ouraLastSynced: data.ouraLastSynced || state.ouraLastSynced,
            eightSleepLastSynced: data.eightSleepLastSynced || state.eightSleepLastSynced,
          };
        }),

      getSyncPayload: () => {
        const { completions, logs, level, recoveryData, habits } = get();
        return { completions, logs, level, recovery: recoveryData, habits };
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
      }),
      version: 1,
      migrate: (persisted, version) => migrateHabitsState(persisted, version) as unknown as WorkoutState,
    }
  )
);
