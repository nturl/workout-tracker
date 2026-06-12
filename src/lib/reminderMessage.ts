/**
 * Build a smart, context-aware reminder message for a given user + day.
 * Pulls: the day's session, streak, week progress, recovery data.
 */

import { getRedis } from "./redis";
import type { PushPayload } from "./webpush";
import { weeklyPlan, type DayPlan, type WorkoutSession, type Level } from "./workoutData";
import { isBiWeeklyOn, sessionKey } from "./helpers";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export type DayName = (typeof DAY_NAMES)[number];

/**
 * Minutes elapsed since the configured reminder time on the same clock day.
 * Positive = time passed. Negative = in the future. The reminder cron fires
 * when this is in [0, 15) minutes.
 */
export function minutesSinceReminder(reminderHHMM: string, currentHHMM: string): number {
  const [rh, rm] = reminderHHMM.split(":").map(Number);
  const [ch, cm] = currentHHMM.split(":").map(Number);
  return (ch * 60 + cm) - (rh * 60 + rm);
}

interface DayWorkout {
  title: string;
  emoji: string;
  tip: string;
}

export const DAILY_WORKOUTS: Record<DayName, DayWorkout> = {
  Monday: { title: "Super-Slow Strength", emoji: "🏋️", tip: "10s up, 10s down. Time under tension." },
  Tuesday: { title: "Functional Fitness + Mitochondrial", emoji: "🫀", tip: "7-min circuit + 4 rounds 30-60s all-out. Aerobic anchor." },
  Wednesday: { title: "Morning Detox + Brain Training", emoji: "🧘", tip: "Sauna, rebound, cold shower. Skill learning later." },
  Thursday: { title: "Heat + Tabata (+ VO2 bi-weekly)", emoji: "🔥", tip: "8 rounds x 20s/10s. VO2 4x4 every other Thursday." },
  Friday: { title: "Super-Slow Strength R2", emoji: "🏋️", tip: "Round 2. Beat Monday's weight or TUT on at least one lift." },
  Saturday: { title: "Adventure + Tabata #2", emoji: "🏔️", tip: "Get outside. Tabata #2 unless adventure went over 90 min hard." },
  Sunday: { title: "Social Sport + Brain Training", emoji: "⚽", tip: "Play something fun with others." },
};

async function kvGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  const raw = await redis.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
}

function todayKeyUTC(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

interface RecoveryEntry {
  eightSleep?: { sleepFitnessScore?: number; hrv?: number };
  oura?: { readinessScore?: number; hrv?: number };
}

interface RecoveryInsight {
  note: string;
  score: number;
}

async function getRecoveryInsight(userId: string, dateKey: string): Promise<RecoveryInsight | null> {
  const entry =
    (await kvGet<RecoveryEntry>(`user:${userId}:recovery:${dateKey}`)) ||
    (await kvGet<RecoveryEntry>(`recovery:${dateKey}`));
  if (!entry) return null;

  const score = entry.oura?.readinessScore ?? entry.eightSleep?.sleepFitnessScore ?? 0;
  const hrv = entry.oura?.hrv ?? entry.eightSleep?.hrv ?? 0;

  if (score >= 85 || hrv >= 60) return { note: "Well recovered — go hard.", score };
  if (score >= 70 || hrv >= 40) return { note: "Moderate recovery — follow the plan.", score };
  if (score > 0 || hrv > 0) return { note: "Low recovery — dial back intensity.", score };
  return null;
}

async function getStreak(userId: string): Promise<number> {
  // Best-effort: use the user's sync blob which mirrors the local store.
  const raw = await kvGet<{ completions?: Record<string, boolean> }>(`user:${userId}:state`);
  const completions = raw?.completions || {};
  if (Object.keys(completions).length === 0) return 0;

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dayName = DAY_NAMES[d.getDay()];
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const wk = todayKeyUTC(weekStart);
    // Match any key for that day — the user has per-session completion keys, we just need "something done".
    const prefix = `${wk}:${dayName}:`;
    const anyDone = Object.keys(completions).some((k) => k.startsWith(prefix) && completions[k]);
    if (anyDone) streak++;
    else if (i > 0) break;
  }
  return streak;
}

async function getWeekProgress(userId: string): Promise<{ done: number; total: number }> {
  const raw = await kvGet<{ completions?: Record<string, boolean> }>(`user:${userId}:state`);
  const completions = raw?.completions || {};
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  const wk = todayKeyUTC(d);
  let done = 0;
  for (const [k, v] of Object.entries(completions)) {
    if (v && k.startsWith(`${wk}:`)) done++;
  }
  // We don't know total without walking the plan on the server, so approximate: 7 default sessions/week.
  return { done, total: 7 };
}

export interface ReminderContext {
  userId: string;
  dayName: DayName;
  dateKey: string;
}

// Daily corrective work that runs every single day — never the workout the
// reminder should name. (Recovery/detox is NOT here: on Wednesday it IS the day.)
const SUPPORTING_CATEGORIES = new Set(["posture", "meditation"]);

const MAX_LISTED_EXERCISES = 6;

/** Sunday of the week containing dateKey (YYYY-MM-DD), used for the bi-weekly cadence. */
function weekStartKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** "Machine Chest Press" -> "Chest Press"; drops parenthetical durations. */
function shortExerciseName(name: string): string {
  return name.replace(/^Machine\s+/i, "").replace(/\s*\([^)]*\)/g, "").trim();
}

/** The day's real workout(s): skips daily posture/meditation/recovery and bi-weekly sessions that are off this week. */
function headlineSessions(day: DayPlan, wk: string): WorkoutSession[] {
  return day.sessions.filter((s) => {
    if (SUPPORTING_CATEGORIES.has(s.category)) return false;
    if (s.isBiWeekly && !isBiWeeklyOn(wk)) return false;
    return true;
  });
}

function protocolCue(s: WorkoutSession): string | null {
  if (!s.repProtocol) return null;
  const { upSeconds, downSeconds, toFailure } = s.repProtocol;
  return `${upSeconds}s up/${downSeconds}s down${toFailure ? " to failure" : ""}`;
}

/**
 * A concise descriptor for one session:
 *  - Strength (has a rep protocol): list the lifts + tempo cue.
 *      "Chest Press, Pull-Down, Shoulder Press, Seated Row, Leg Press, Dead Lift (10s up/10s down to failure)"
 *  - Single-protocol cardio: the one "exercise" IS the protocol.
 *      "Tabata: 8 rounds x 20s/10s"
 *  - Circuits / interval blocks / everything else: title + subtitle, never the full move list.
 *      "Functional Fitness: 7-Minute Workout Circuit"
 */
function sessionDescriptor(s: WorkoutSession, level: Level): string {
  const detail = s.levels[level] || s.levels.beginner;
  const names = (detail.exercises || []).map((e) => shortExerciseName(e.name)).filter(Boolean);

  if (s.repProtocol && names.length > 0) {
    const shown = names.slice(0, MAX_LISTED_EXERCISES);
    const list = shown.join(", ") + (names.length > shown.length ? "…" : "");
    const cue = protocolCue(s);
    return cue ? `${list} (${cue})` : list;
  }
  if (names.length === 1) return `${s.title}: ${names[0]}`;
  return s.subtitle ? `${s.title}: ${s.subtitle}` : s.title;
}

/**
 * Names the specific work for the day across all of its headline sessions,
 * joined with " • ". Falls back to the day focus when there is no real session.
 */
function specificWorkoutLine(day: DayPlan, level: Level, wk: string): string {
  const sessions = headlineSessions(day, wk);
  if (sessions.length === 0) return day.focus;
  return sessions.map((s) => sessionDescriptor(s, level)).join(" • ");
}

async function getLevel(userId: string): Promise<Level> {
  const raw = await kvGet<{ level?: Level }>(`user:${userId}:state`);
  const level = raw?.level;
  return level === "beginner" || level === "intermediate" || level === "advanced" ? level : "beginner";
}

export async function buildReminderPayload(ctx: ReminderContext): Promise<PushPayload> {
  const workout = DAILY_WORKOUTS[ctx.dayName];
  const wk = weekStartKey(ctx.dateKey);
  const [level, recovery, streak, progress] = await Promise.all([
    getLevel(ctx.userId),
    getRecoveryInsight(ctx.userId, ctx.dateKey),
    getStreak(ctx.userId),
    getWeekProgress(ctx.userId),
  ]);

  const day = weeklyPlan.find((d) => d.day === ctx.dayName);
  const specifics = day ? specificWorkoutLine(day, level, wk) : workout.tip;

  const bodyParts: string[] = [specifics];
  if (recovery) bodyParts.push(recovery.note);
  if (streak >= 3) bodyParts.push(`🔥 ${streak}-day streak — keep it.`);
  if (progress.done > 0 && progress.done < progress.total) {
    bodyParts.push(`${progress.done}/${progress.total} sessions this week.`);
  }

  return {
    title: `${workout.emoji} ${ctx.dayName}: ${workout.title}`,
    body: bodyParts.join(" "),
    tag: `reminder-${ctx.dateKey}`,
    url: process.env.NEXT_PUBLIC_APP_URL || "/",
    requireInteraction: false,
    data: { kind: "reminder", day: ctx.dayName, streak, weekDone: progress.done },
  };
}

export type Checkpoint = "afternoon" | "evening";

export interface StatusContext extends ReminderContext {
  checkpoint: Checkpoint;
}

async function getCompletions(userId: string): Promise<Record<string, boolean>> {
  const raw = await kvGet<{ completions?: Record<string, boolean> }>(`user:${userId}:state`);
  return raw?.completions || {};
}

/**
 * A mid-day / evening accountability nudge: how today's headline sessions stand.
 * Uses the same sessions the morning reminder names, and the same completion
 * keys the app writes (sessionKey), so "done" reflects what's checked off in-app.
 */
export async function buildStatusPayload(ctx: StatusContext): Promise<PushPayload> {
  const wk = weekStartKey(ctx.dateKey);
  const day = weeklyPlan.find((d) => d.day === ctx.dayName);
  const sessions = day ? headlineSessions(day, wk) : [];
  const completions = await getCompletions(ctx.userId);

  const left = sessions
    .filter((s) => !completions[sessionKey(wk, ctx.dayName, s)])
    .map((s) => s.title);
  const total = sessions.length;
  const done = total - left.length;

  const evening = ctx.checkpoint === "evening";
  const title = `${evening ? "🌙" : "☀️"} ${ctx.dayName} ${evening ? "evening" : "midday"} check-in`;

  let body: string;
  if (total === 0) {
    body = "Nothing scheduled today — rest and recover.";
  } else if (left.length === 0) {
    body = `All ${total} done. ${evening ? "Strong finish. 💪" : "Ahead of schedule. 💪"}`;
  } else if (done === 0) {
    body = `Nothing logged yet${evening ? " — still time" : ""}. Today: ${left.join(", ")}.`;
  } else {
    body = `${done}/${total} done. Still to do: ${left.join(", ")}.`;
  }

  return {
    title,
    body,
    tag: `status-${ctx.dateKey}-${ctx.checkpoint}`,
    url: process.env.NEXT_PUBLIC_APP_URL || "/",
    requireInteraction: false,
    data: { kind: "status", checkpoint: ctx.checkpoint, day: ctx.dayName, done, total },
  };
}

/**
 * Given an IANA timezone, return the current DayName + HH:mm in that zone.
 * Falls back to server time if the zone is invalid.
 */
export function localTimeParts(timezone: string | undefined, now = new Date()): { day: DayName; hhmm: string } {
  try {
    if (timezone) {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const parts = fmt.formatToParts(now);
      const weekday = parts.find((p) => p.type === "weekday")?.value || "";
      const hour = parts.find((p) => p.type === "hour")?.value || "00";
      const minute = parts.find((p) => p.type === "minute")?.value || "00";
      const day = (DAY_NAMES as readonly string[]).includes(weekday) ? (weekday as DayName) : DAY_NAMES[now.getDay()];
      return { day, hhmm: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}` };
    }
  } catch {}
  const day = DAY_NAMES[now.getDay()];
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return { day, hhmm };
}

export function dateKeyInTimezone(timezone: string | undefined, now = new Date()): string {
  try {
    if (timezone) {
      const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
      return fmt.format(now); // en-CA gives YYYY-MM-DD
    }
  } catch {}
  return todayKeyUTC(now);
}
