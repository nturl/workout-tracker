export interface HabitDef {
  id: string;
  label: string;
}

/**
 * Seed habits for a brand-new user (or one who has cleared their data).
 * Each user gets their own editable copy of this list in the store
 * (`habitDefs`); the UI renders that copy, not this constant directly.
 * Kept as the default fallback only — see useWorkoutStore hydration/migration.
 */
export const DEFAULT_HABITS: HabitDef[] = [
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

/**
 * Derive a stable, store-safe id from a user-typed habit label.
 * Lowercases, kebab-cases, strips anything outside [a-z0-9-], and guarantees
 * uniqueness against `existingIds` by appending a numeric suffix. The result
 * always matches the sync validator's id rule (^[a-zA-Z0-9_-]+$, max 64 chars).
 */
export function makeHabitId(label: string, existingIds: string[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "habit";
  if (!existingIds.includes(base)) return base;
  // Leave room for the "-N" suffix within the 64-char cap.
  const stem = base.slice(0, 60);
  let n = 2;
  let candidate = `${stem}-${n}`;
  while (existingIds.includes(candidate)) {
    n += 1;
    candidate = `${stem}-${n}`;
  }
  return candidate;
}

/**
 * Order-sensitive deep equality for two habit-def lists. A reorder counts as a
 * change so it propagates. Shared by the sync route (to decide whether to mint a
 * new server version) and the client (to detect an edit made mid-push).
 */
export function habitDefsEqual(a: HabitDef[], b: HabitDef[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].label !== b[i].label) return false;
  }
  return true;
}
