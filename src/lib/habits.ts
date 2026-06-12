export interface HabitDef {
  id: string;
  label: string;
}

/**
 * Daily habits, in display order on the Workouts tab.
 * Adding a habit is a one-line change here — the store keeps a single
 * `habits` map keyed by these ids, and the UI renders this list directly.
 */
export const HABITS: HabitDef[] = [
  { id: "meditation", label: "Meditation" },
  { id: "walk", label: "Outside walk" },
  { id: "duolingo", label: "Duolingo" },
  { id: "readwise", label: "Readwise" },
  { id: "supplementsAm", label: "Supplements (AM)" },
  { id: "supplementsPm", label: "Supplements (PM)" },
  { id: "telegram", label: "Telegram (15m)" },
  { id: "email", label: "Email (30m)" },
  { id: "journal", label: "Daily journal" },
  { id: "notWatch", label: "Not Watch" },
  { id: "noGamble", label: "No Gamble" },
  { id: "noNicotine", label: "No Nicotine" },
  { id: "ash", label: "Ash" },
];

/**
 * Habit ids that were stored as top-level store fields before the data-driven
 * refactor. Used once to migrate old local + synced data into the habits map.
 */
export const LEGACY_HABIT_IDS = ["notWatch", "noGamble", "noNicotine", "ash", "meditation"] as const;
