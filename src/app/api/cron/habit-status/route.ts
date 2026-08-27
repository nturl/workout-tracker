import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { weeklyPlan } from "@/lib/workoutData";
import { DAYS, weekKey, sessionKey, isSessionScheduled } from "@/lib/helpers";
import type { CompletionRecord, DailyHabitRecord } from "@/types/workout";
import type { HabitDef } from "@/lib/habits";

function authorize(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

// Mirrors the allDone check in calculateStreak/getBestStreak (helpers.ts), for
// one specific calendar date instead of scanning history. null on a day with
// no scheduled session - a rest day isn't a completed workout, and callers
// that want "only what a record actually says" (journal-nudge) need to be
// able to tell "nothing was due" apart from "something was due and missed."
function exerciseCompletedOn(dateStr: string, completions: CompletionRecord): boolean | null {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayName = DAYS[date.getDay()];
  const wk = weekKey(date);
  const plan = weeklyPlan.find((p) => p.day === dayName);
  const scheduled = (plan?.sessions ?? []).filter((s) => isSessionScheduled(s, wk));
  if (scheduled.length === 0) return null;
  return scheduled.every((s) => completions[sessionKey(wk, dayName, s)]);
}

// GET /api/cron/habit-status?date=YYYY-MM-DD
//
// Read-only export of one date's real completion signal - the scheduled-
// workout state plus the daily-habit checkboxes - for external automations
// that need "did this actually happen" rather than a calendar block or a
// guess (journal-nudge's evidence.py, specifically). No mutations. Auth
// matches the other /api/cron routes: Bearer $CRON_SECRET.
//
// habits[id] omits any date with no explicit true/false recorded, rather
// than defaulting to false - an untouched habit is not the same as a missed
// one, and the caller (evidence.py) treats "not present" as "no signal."
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = new URL(req.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
  }

  const redis = getRedis();
  const dataKeys = await redis.keys("user:*:data");

  const users: Array<{
    userId: string;
    exerciseCompleted: boolean | null;
    habits: Record<string, boolean>;
    habitDefs: HabitDef[];
  }> = [];

  for (const key of dataKeys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    const data = JSON.parse(raw);
    const habits: Record<string, DailyHabitRecord> = data.habits || {};
    const habitsToday: Record<string, boolean> = {};
    for (const [habitId, rec] of Object.entries(habits)) {
      const val = rec?.[date];
      if (val !== undefined) habitsToday[habitId] = val;
    }
    users.push({
      userId: key.replace("user:", "").replace(":data", ""),
      exerciseCompleted: exerciseCompletedOn(date, data.completions || {}),
      habits: habitsToday,
      habitDefs: data.habitDefs || [],
    });
  }

  return NextResponse.json({ date, users });
}
