import { describe, it, expect, beforeEach, vi } from "vitest";
import "../mocks/redis";
import { clearMockRedis, seedMockRedis } from "../mocks/redis";
import { NextRequest } from "next/server";
import { weeklyPlan } from "@/lib/workoutData";
import { DAYS, weekKey, sessionKey, isSessionScheduled } from "@/lib/helpers";
import { GET } from "@/app/api/cron/habit-status/route";

const CRON_SECRET = "test-cron-secret";

function makeRequest(date: string | null, auth?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (auth) headers["authorization"] = auth;
  const url = date
    ? `http://localhost:3000/api/cron/habit-status?date=${date}`
    : "http://localhost:3000/api/cron/habit-status";
  return new NextRequest(url, { method: "GET", headers });
}

// A real date whose weekday has at least one scheduled (non-biweekly)
// session in weeklyPlan, so completions/sessionKey line up with production
// logic instead of a hand-guessed key string. Returns every scheduled
// session's key for that date - a day can have more than one, and "done"
// requires all of them (mirrors calculateStreak's allDone check).
function findDateWithSession(): { date: string; keys: string[] } {
  const base = new Date(2026, 7, 24); // a Monday; weeklyPlan is stable content
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const dayName = DAYS[d.getDay()];
    const wk = weekKey(d);
    const plan = weeklyPlan.find((p) => p.day === dayName);
    const scheduled = (plan?.sessions ?? []).filter((s) => isSessionScheduled(s, wk));
    if (scheduled.length > 0) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { date: dateStr, keys: scheduled.map((s) => sessionKey(wk, dayName, s)) };
    }
  }
  throw new Error("no scheduled session found in a full week - weeklyPlan may be empty");
}

describe("/api/cron/habit-status", () => {
  beforeEach(() => {
    clearMockRedis();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
  });

  it("returns 401 without auth header", async () => {
    const res = await GET(makeRequest("2026-08-24"));
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong secret", async () => {
    const res = await GET(makeRequest("2026-08-24", "Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 400 without a date param", async () => {
    const res = await GET(makeRequest(null, `Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed date", async () => {
    const res = await GET(makeRequest("08-24-2026", `Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(400);
  });

  it("returns an empty user list when no one has data", async () => {
    const res = await GET(makeRequest("2026-08-24", `Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBe("2026-08-24");
    expect(body.users).toEqual([]);
  });

  it("only includes habits with an explicit value on that date", async () => {
    seedMockRedis({
      "user:u1:data": JSON.stringify({
        habits: {
          notWatch: { "2026-08-24": true, "2026-08-23": false },
          noGamble: { "2026-08-23": true }, // no entry for the 24th
        },
        habitDefs: [{ id: "notWatch", label: "Not Watch" }],
      }),
    });

    const res = await GET(makeRequest("2026-08-24", `Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body.users).toHaveLength(1);
    expect(body.users[0].habits).toEqual({ notWatch: true });
    expect(body.users[0].habitDefs).toEqual([{ id: "notWatch", label: "Not Watch" }]);
  });

  it("includes an explicit false (missed), not just true", async () => {
    seedMockRedis({
      "user:u1:data": JSON.stringify({ habits: { ash: { "2026-08-24": false } } }),
    });
    const res = await GET(makeRequest("2026-08-24", `Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body.users[0].habits).toEqual({ ash: false });
  });

  it("reports exerciseCompleted true when every scheduled session that day is done", async () => {
    const { date, keys } = findDateWithSession();
    const completions = Object.fromEntries(keys.map((k) => [k, true]));
    seedMockRedis({ "user:u1:data": JSON.stringify({ completions }) });
    const res = await GET(makeRequest(date, `Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body.users[0].exerciseCompleted).toBe(true);
  });

  it("reports exerciseCompleted false when a scheduled session is missed", async () => {
    const { date } = findDateWithSession();
    seedMockRedis({ "user:u1:data": JSON.stringify({ completions: {} }) });
    const res = await GET(makeRequest(date, `Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body.users[0].exerciseCompleted).toBe(false);
  });

  it("handles multiple users independently", async () => {
    seedMockRedis({
      "user:u1:data": JSON.stringify({ habits: { ash: { "2026-08-24": true } } }),
      "user:u2:data": JSON.stringify({ habits: { ash: { "2026-08-24": false } } }),
    });
    const res = await GET(makeRequest("2026-08-24", `Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body.users).toHaveLength(2);
    const byId = Object.fromEntries(body.users.map((u: { userId: string; habits: Record<string, boolean> }) => [u.userId, u.habits]));
    expect(byId.u1).toEqual({ ash: true });
    expect(byId.u2).toEqual({ ash: false });
  });
});
