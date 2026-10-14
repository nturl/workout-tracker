import { describe, it, expect, beforeEach, vi } from "vitest";
import "../mocks/redis";
import { clearMockRedis, seedMockRedis } from "../mocks/redis";
import { weeklyPlan } from "@/lib/workoutData";
import { sessionKey, isSessionScheduled, getWeekProgress } from "@/lib/helpers";
import { buildReminderPayload, buildStatusPayload, localTimeParts, dateKeyInTimezone, DAILY_WORKOUTS, minutesSinceReminder } from "@/lib/reminderMessage";

describe("reminderMessage", () => {
  beforeEach(() => {
    clearMockRedis();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");
  });

  describe("buildReminderPayload", () => {
    it("uses the day's workout title + emoji", async () => {
      const payload = await buildReminderPayload({ userId: "u1", dayName: "Monday", dateKey: "2025-04-14" });
      expect(payload.title).toContain(DAILY_WORKOUTS.Monday.title);
      expect(payload.title).toContain(DAILY_WORKOUTS.Monday.emoji);
    });

    it("names the specific exercises for a strength day", async () => {
      const payload = await buildReminderPayload({ userId: "u1", dayName: "Monday", dateKey: "2025-04-14" });
      // Default level (beginner) lists the concrete machine lifts.
      expect(payload.body).toContain("Chest Press");
      expect(payload.body).toContain("Leg Press");
      expect(payload.body).toContain("10s up/10s down");
    });

    it("respects the user's level when listing exercises", async () => {
      seedMockRedis({ "user:u1:data": JSON.stringify({ level: "advanced" }) });
      const payload = await buildReminderPayload({ userId: "u1", dayName: "Monday", dateKey: "2025-04-14" });
      // Advanced super-slow uses movement-category names, not machine names.
      expect(payload.body).toContain("Upper-Body Push");
      expect(payload.body).not.toContain("Machine");
    });

    it("includes VO2 Max only on bi-weekly on-weeks", async () => {
      // Anchor week is 2026-05-10; Thursday 2026-05-14 is an on-week, 2026-05-21 is off.
      const onWeek = await buildReminderPayload({ userId: "u1", dayName: "Thursday", dateKey: "2026-05-14" });
      const offWeek = await buildReminderPayload({ userId: "u1", dayName: "Thursday", dateKey: "2026-05-21" });
      expect(onWeek.body).toContain("VO2 Max");
      expect(offWeek.body).not.toContain("VO2 Max");
      // Tabata is weekly, so it appears either way.
      expect(onWeek.body).toContain("20s/10s");
      expect(offWeek.body).toContain("20s/10s");
    });

    it("includes recovery note when sleep score is high", async () => {
      seedMockRedis({
        "user:u1:recovery:2025-04-14": JSON.stringify({ eightSleep: { sleepFitnessScore: 90 } }),
      });
      const payload = await buildReminderPayload({ userId: "u1", dayName: "Monday", dateKey: "2025-04-14" });
      expect(payload.body).toContain("Well recovered");
    });

    it("sets tag and URL", async () => {
      const payload = await buildReminderPayload({ userId: "u1", dayName: "Tuesday", dateKey: "2025-04-15" });
      expect(payload.tag).toBe("reminder-2025-04-15");
      expect(payload.url).toBe("https://app.test");
    });
  });

  // The app syncs to user:{id}:data (src/app/api/sync/route.ts); nothing writes :state.
  describe("reads the synced user:{id}:data blob", () => {
    // Every scheduled session on dayName in week wk, marked done.
    function dayDone(wk: string, dayName: string): Record<string, boolean> {
      const out: Record<string, boolean> = {};
      for (const s of weeklyPlan.find((d) => d.day === dayName)!.sessions) {
        if (isSessionScheduled(s, wk)) out[sessionKey(wk, dayName, s)] = true;
      }
      return out;
    }

    it("status check-in counts sessions completed in the app", async () => {
      seedMockRedis({ "user:u1:data": { completions: dayDone("2026-10-11", "Monday") } });
      const p = await buildStatusPayload({ userId: "u1", dayName: "Monday", dateKey: "2026-10-12", checkpoint: "evening" });
      expect(p.body).not.toContain("Nothing logged yet");
      expect(p.data!.done).toBe(p.data!.total);
    });

    it("uses the synced level", async () => {
      seedMockRedis({ "user:u1:data": { level: "advanced" } });
      const p = await buildReminderPayload({ userId: "u1", dayName: "Monday", dateKey: "2025-04-14" });
      expect(p.body).toContain("Upper-Body Push");
    });

    it("streak and week progress are anchored to the reminder's dateKey, not server time", async () => {
      // Sat 4/12, Sun 4/13, Mon 4/14 2025 fully done: a 3-day streak ending on dateKey.
      const completions = { ...dayDone("2025-04-06", "Saturday"), ...dayDone("2025-04-13", "Sunday"), ...dayDone("2025-04-13", "Monday") };
      seedMockRedis({ "user:u1:data": { completions } });
      const p = await buildReminderPayload({ userId: "u1", dayName: "Monday", dateKey: "2025-04-14" });
      const week = getWeekProgress(completions, "2025-04-13");
      expect(p.body).toContain("3-day streak");
      expect(p.body).toContain(`${week.done}/${week.total} sessions this week.`);
      expect(p.data).toMatchObject({ streak: 3, weekDone: week.done });
    });
  });

  describe("localTimeParts", () => {
    it("returns day and HH:mm for a known timezone", () => {
      const result = localTimeParts("America/Los_Angeles", new Date("2025-04-14T15:30:00Z"));
      // 15:30 UTC = 08:30 PDT on Monday
      expect(result.hhmm).toBe("08:30");
      expect(result.day).toBe("Monday");
    });

    it("falls back to server time when timezone is invalid", () => {
      const now = new Date("2025-04-14T12:00:00Z");
      const result = localTimeParts("Not/AZone", now);
      expect(result.hhmm).toMatch(/^\d{2}:\d{2}$/);
    });

    it("handles undefined timezone", () => {
      const result = localTimeParts(undefined, new Date("2025-04-14T12:00:00Z"));
      expect(result.hhmm).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe("dateKeyInTimezone", () => {
    it("returns YYYY-MM-DD in the given timezone", () => {
      // 2025-04-14T06:30:00Z = 2025-04-13 23:30 PDT
      const key = dateKeyInTimezone("America/Los_Angeles", new Date("2025-04-14T06:30:00Z"));
      expect(key).toBe("2025-04-13");
    });
  });

  describe("minutesSinceReminder", () => {
    // Cron fires every 15 min; a reminder fires when delta is in [0, 15).
    const inWindow = (r: string, c: string) => {
      const d = minutesSinceReminder(r, c);
      return d >= 0 && d < 15;
    };

    it("fires at the exact reminder tick", () => {
      expect(minutesSinceReminder("12:00", "12:00")).toBe(0);
      expect(inWindow("12:00", "12:00")).toBe(true);
    });

    it("fires at the next cron tick after an off-grid reminder", () => {
      // Target 12:07 should fire at the 12:15 tick (delta=8), not 12:00 (delta=-7).
      expect(minutesSinceReminder("12:07", "12:00")).toBe(-7);
      expect(inWindow("12:07", "12:00")).toBe(false);
      expect(minutesSinceReminder("12:07", "12:15")).toBe(8);
      expect(inWindow("12:07", "12:15")).toBe(true);
    });

    it("does not re-fire at a later tick in the same hour", () => {
      // After firing at 12:15 for target 12:07, the 12:30 tick (delta=23) must skip.
      expect(inWindow("12:07", "12:30")).toBe(false);
    });

    it("rejects ticks before the reminder time", () => {
      expect(inWindow("09:00", "08:45")).toBe(false);
      expect(inWindow("07:30", "07:15")).toBe(false);
    });

    it("handles top-of-hour reminders without double-firing", () => {
      expect(inWindow("08:00", "08:00")).toBe(true);
      expect(inWindow("08:00", "08:15")).toBe(false);
    });

    it("covers worst case: reminder HH:16 fires at HH:30 with delta=14", () => {
      expect(minutesSinceReminder("12:16", "12:30")).toBe(14);
      expect(inWindow("12:16", "12:30")).toBe(true);
      expect(inWindow("12:16", "12:15")).toBe(false);
    });
  });
});
