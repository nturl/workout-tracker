import { describe, it, expect } from "vitest";
import {
  weekKey,
  sessionSlug,
  sessionKey,
  calculateStreak,
  getBestStreak,
  getWeekProgress,
  getRecoveryLevel,
  getGreeting,
  DAYS,
  isBiWeeklyOn,
  isSessionScheduled,
} from "@/lib/helpers";
import { weeklyPlan, type WorkoutSession } from "@/lib/workoutData";

describe("weekKey", () => {
  it("returns the Sunday of the week for a given date", () => {
    // Wednesday March 26, 2026
    const date = new Date("2026-03-26T12:00:00");
    const key = weekKey(date);
    // Sunday of that week is March 22
    expect(key).toBe("2026-03-22");
  });

  it("returns same day for Sunday", () => {
    const sunday = new Date("2026-03-22T12:00:00");
    expect(weekKey(sunday)).toBe("2026-03-22");
  });
});

describe("sessionSlug", () => {
  it("creates a slug from session title", () => {
    expect(sessionSlug({ title: "Super-Slow Strength" })).toBe("super-slow-strength");
    expect(sessionSlug({ title: "VO2 Max Training" })).toBe("vo2-max-training");
    expect(sessionSlug({ title: "Egoscue E-cises" })).toBe("egoscue-e-cises");
  });

  it("handles special characters", () => {
    expect(sessionSlug({ title: "Hot and Cold" })).toBe("hot-and-cold");
    expect(sessionSlug({ title: "Brain Training" })).toBe("brain-training");
  });
});

describe("sessionKey", () => {
  it("combines week, day, and session slug", () => {
    const key = sessionKey("2026-03-22", "Monday", { title: "Super-Slow Strength" });
    expect(key).toBe("2026-03-22:Monday:super-slow-strength");
  });
});

describe("calculateStreak", () => {
  it("returns 0 for empty completions", () => {
    expect(calculateStreak({})).toBe(0);
  });

  it("returns 1 when today is fully completed", () => {
    const today = new Date();
    const todayName = DAYS[today.getDay()];
    const wk = weekKey(today);
    const plan = weeklyPlan.find((d) => d.day === todayName);
    if (!plan) return; // Skip if no plan for today

    const completions: Record<string, boolean> = {};
    plan.sessions.forEach((s) => {
      completions[sessionKey(wk, todayName, s)] = true;
    });

    expect(calculateStreak(completions)).toBe(1);
  });
});

describe("getBestStreak", () => {
  it("returns 0 for empty completions", () => {
    expect(getBestStreak({})).toBe(0);
  });
});

describe("getWeekProgress", () => {
  it("returns correct totals for empty completions", () => {
    const wk = weekKey(new Date());
    const result = getWeekProgress({}, wk);
    expect(result.done).toBe(0);
    expect(result.total).toBeGreaterThan(0);
    expect(result.pct).toBe(0);
  });

  it("counts completed sessions", () => {
    const today = new Date();
    const wk = weekKey(today);
    const plan = weeklyPlan[0]; // Monday
    const completions: Record<string, boolean> = {};
    plan.sessions.forEach((s) => {
      completions[sessionKey(wk, plan.day, s)] = true;
    });

    const result = getWeekProgress(completions, wk);
    expect(result.done).toBe(plan.sessions.length);
    expect(result.pct).toBeGreaterThan(0);
  });
});

describe("getRecoveryLevel", () => {
  it("returns Well Recovered for high scores", () => {
    const level = getRecoveryLevel({ date: "2026-03-30", oura: { readinessScore: 90 } });
    expect(level.label).toBe("Well Recovered");
    expect(level.color).toBe("#22c55e");
  });

  it("returns Moderate for mid-range scores", () => {
    const level = getRecoveryLevel({ date: "2026-03-30", eightSleep: { sleepFitnessScore: 75 } });
    expect(level.label).toBe("Moderate Recovery");
  });

  it("returns Low Recovery for poor scores", () => {
    const level = getRecoveryLevel({ date: "2026-03-30", oura: { readinessScore: 50 } });
    expect(level.label).toBe("Low Recovery");
    expect(level.color).toBe("#ef4444");
  });

  it("returns No Data when no metrics provided", () => {
    const level = getRecoveryLevel({ date: "2026-03-30" });
    expect(level.label).toBe("No Data");
  });

  it("considers HRV for well recovered", () => {
    const level = getRecoveryLevel({ date: "2026-03-30", oura: { hrv: 65 } });
    expect(level.label).toBe("Well Recovered");
  });
});

describe("getGreeting", () => {
  it("returns a string greeting", () => {
    const greeting = getGreeting();
    expect(["Good morning", "Good afternoon", "Good evening"]).toContain(greeting);
  });
});

describe("isBiWeeklyOn", () => {
  // Anchor: Sunday 2026-05-10 (week of Thu 2026-05-14 VO2 session)
  it("returns true for the anchor week", () => {
    expect(isBiWeeklyOn("2026-05-10")).toBe(true);
  });

  it("returns false for the week after the anchor (off week)", () => {
    expect(isBiWeeklyOn("2026-05-17")).toBe(false);
  });

  it("returns true two weeks after the anchor (next VO2 week)", () => {
    expect(isBiWeeklyOn("2026-05-24")).toBe(true);
  });

  it("returns true two weeks before the anchor", () => {
    expect(isBiWeeklyOn("2026-04-26")).toBe(true);
  });

  it("returns false one week before the anchor", () => {
    expect(isBiWeeklyOn("2026-05-03")).toBe(false);
  });
});

describe("isSessionScheduled", () => {
  const regularSession = { isBiWeekly: false } as WorkoutSession;
  const biWeeklySession = { isBiWeekly: true } as WorkoutSession;
  const undefinedSession = {} as WorkoutSession;

  it("always schedules regular sessions", () => {
    expect(isSessionScheduled(regularSession, "2026-05-10")).toBe(true);
    expect(isSessionScheduled(regularSession, "2026-05-17")).toBe(true);
    expect(isSessionScheduled(undefinedSession, "2026-05-17")).toBe(true);
  });

  it("schedules bi-weekly sessions only on on-weeks", () => {
    expect(isSessionScheduled(biWeeklySession, "2026-05-10")).toBe(true);
    expect(isSessionScheduled(biWeeklySession, "2026-05-17")).toBe(false);
    expect(isSessionScheduled(biWeeklySession, "2026-05-24")).toBe(true);
  });
});
