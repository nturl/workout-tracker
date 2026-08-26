import { weeklyPlan, type WorkoutSession } from "@/lib/workoutData";
import type { CompletionRecord, DailyHabitRecord, RecoveryEntry, RecoveryLevel } from "@/types/workout";

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function weekKey(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Anchor: Sunday of the week containing the last VO2 Max session (Thu 2026-05-14).
// Weeks an even number of weeks away from this anchor are "on" weeks for bi-weekly sessions.
const BI_WEEKLY_ANCHOR_WEEK = "2026-05-10";

export function isBiWeeklyOn(wk: string): boolean {
  const [y, m, d] = wk.split("-").map(Number);
  const [ay, am, ad] = BI_WEEKLY_ANCHOR_WEEK.split("-").map(Number);
  const weeksAway = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ay, am - 1, ad)) / (7 * 86400000));
  return weeksAway % 2 === 0;
}

export function isSessionScheduled(session: WorkoutSession, wk: string): boolean {
  return !session.isBiWeekly || isBiWeeklyOn(wk);
}

export function sessionSlug(session: Pick<WorkoutSession, "title">): string {
  return session.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function sessionKey(wk: string, dayName: string, session: Pick<WorkoutSession, "title">): string {
  return `${wk}:${dayName}:${sessionSlug(session)}`;
}

export function getTodayDayName(): string {
  return DAYS[new Date().getDay()];
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getWeekDates(weekOffset = 0) {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay() + weekOffset * 7);
  return DAYS.map((day, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return { day, date: d, dateLabel: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
  });
}

export function weekKeyForOffset(weekOffset: number): string {
  const now = new Date();
  now.setDate(now.getDate() + weekOffset * 7);
  return weekKey(now);
}

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function calculateStreak(completions: CompletionRecord): number {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const dayName = DAYS[checkDate.getDay()];
    const wk = weekKey(checkDate);
    const plan = weeklyPlan.find((d) => d.day === dayName);
    if (!plan) continue;
    const allDone = plan.sessions.every((s) => !isSessionScheduled(s, wk) || completions[sessionKey(wk, dayName, s)]);
    if (allDone) streak++;
    else if (i > 0) break;
  }
  return streak;
}

export function getBestStreak(completions: CompletionRecord): number {
  let best = 0, current = 0;
  const today = new Date();
  for (let i = 365; i >= 0; i--) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const dayName = DAYS[checkDate.getDay()];
    const wk = weekKey(checkDate);
    const plan = weeklyPlan.find((d) => d.day === dayName);
    if (!plan) continue;
    const allDone = plan.sessions.every((s) => !isSessionScheduled(s, wk) || completions[sessionKey(wk, dayName, s)]);
    if (allDone) { current++; best = Math.max(best, current); }
    else current = 0;
  }
  return best;
}

export function getWeekProgress(completions: CompletionRecord, wk: string) {
  let total = 0, done = 0;
  weeklyPlan.forEach((day) => {
    day.sessions.forEach((s) => {
      if (!isSessionScheduled(s, wk)) return;
      total++;
      if (completions[sessionKey(wk, day.day, s)]) done++;
    });
  });
  return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function calculateDailyHabitStreak(habit: DailyHabitRecord): number {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dateKey(d);
    if (habit[key]) streak++;
    else if (i > 0 || habit[key] === false) break;
    // i === 0 and undefined (not logged yet): don't break the prior streak.
    // i === 0 and explicitly false (marked missed): break immediately.
  }
  return streak;
}

export interface RecentDay {
  key: string;
  dayLabel: string;
  isToday: boolean;
}

export function getLastNDays(n: number): RecentDay[] {
  const today = new Date();
  const todayStr = dateKey(today);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (n - 1 - i));
    return {
      key: dateKey(d),
      dayLabel: DAYS[d.getDay()][0],
      isToday: dateKey(d) === todayStr,
    };
  });
}

export function getBestDailyHabitStreak(habit: DailyHabitRecord): number {
  let best = 0, current = 0;
  const today = new Date();
  for (let i = 365; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dateKey(d);
    if (habit[key]) { current++; best = Math.max(best, current); }
    else current = 0;
  }
  return best;
}

export function getRecoveryLevel(entry: RecoveryEntry): RecoveryLevel {
  const score = entry.oura?.readinessScore ?? entry.eightSleep?.sleepFitnessScore ?? 0;
  const hrv = entry.oura?.hrv ?? entry.eightSleep?.hrv ?? 0;

  if (score >= 85 || hrv >= 60) {
    return { label: "Well Recovered", color: "#22c55e", emoji: "\u{1F7E2}", advice: "You're primed \u2014 go hard today. Push intensity and volume." };
  }
  if (score >= 70 || hrv >= 40) {
    return { label: "Moderate Recovery", color: "#f59e0b", emoji: "\u{1F7E1}", advice: "Solid baseline. Follow the program as written, listen to your body." };
  }
  if (score > 0 || hrv > 0) {
    return { label: "Low Recovery", color: "#ef4444", emoji: "\u{1F534}", advice: "Consider dialing back intensity. Focus on form over weight, skip burnout sets." };
  }
  return { label: "No Data", color: "#6b7280", emoji: "\u26AA", advice: "Log your recovery data to get personalized recommendations." };
}
