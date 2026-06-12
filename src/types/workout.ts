import type { Level } from "@/lib/workoutData";

export type Theme = "light" | "dark" | "system";

export interface ExerciseLog {
  weight?: number;
  reps?: number;
  sets?: number;
  notes?: string;
  completed?: boolean;
  tutSeconds?: number;
  // ISO timestamp set when the exercise was confirmed complete.
  // Powers timing-history views ("when do I usually run / lift / meditate").
  completedAt?: string;
}

export interface WorkoutLogEntry {
  notes?: string;
  duration?: number;
  feeling?: 1 | 2 | 3 | 4 | 5;
  completedAt?: string;
  exerciseLogs?: Record<string, ExerciseLog>;
}

export type CompletionRecord = Record<string, boolean>;
export type WorkoutLogRecord = Record<string, WorkoutLogEntry>;
export type DailyHabitRecord = Record<string, boolean>;
/** @deprecated use DailyHabitRecord */
export type NotWatchRecord = DailyHabitRecord;

export interface NotificationSettings {
  enabled: boolean;
  times: Record<string, string>;
}

export interface RecoveryEntry {
  date: string;
  eightSleep?: {
    sleepFitnessScore?: number;
    timeSlept?: string;
    deepSleep?: string;
    deepSleepPct?: number;
    remSleep?: string;
    remSleepPct?: number;
    rhr?: number;
    hrv?: number;
    screenshotDataUrl?: string;
    autoImported?: boolean;
    importedAt?: string;
  };
  oura?: {
    readinessScore?: number;
    sleepScore?: number;
    totalSleep?: string;
    efficiency?: number;
    restfulness?: string;
    remSleep?: string;
    remSleepPct?: number;
    deepSleep?: string;
    deepSleepPct?: number;
    lightSleep?: string;
    lightSleepPct?: number;
    awakeTime?: string;
    timeInBed?: string;
    latency?: number;
    timing?: string;
    hrv?: number;
    rhr?: number;
    averageHR?: number;
    bodyTemp?: number;
    respiratoryRate?: number;
    spo2?: number;
    screenshotDataUrl?: string;
  };
}

export type RecoveryData = { [date: string]: RecoveryEntry };

export interface RecoveryLevel {
  label: string;
  color: string;
  emoji: string;
  advice: string;
}

export interface SyncPayload {
  completions?: CompletionRecord;
  logs?: WorkoutLogRecord;
  level?: Level;
  recovery?: RecoveryData;
  habits?: Record<string, DailyHabitRecord>;
}

export interface SyncData extends SyncPayload {
  updatedAt?: number;
  ouraLastSynced?: string;
  eightSleepLastSynced?: string;
  // Legacy per-habit fields, kept for reading old synced blobs during migration.
  notWatch?: DailyHabitRecord;
  noGamble?: DailyHabitRecord;
  noNicotine?: DailyHabitRecord;
  ash?: DailyHabitRecord;
  meditation?: DailyHabitRecord;
}

export { type Level };
