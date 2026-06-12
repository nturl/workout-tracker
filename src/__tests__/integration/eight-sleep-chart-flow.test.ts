import { describe, it, expect, beforeEach, vi } from "vitest";
import "../mocks/redis";
import "../mocks/clerk";
import { clearMockRedis, seedMockRedis, getMockRedis } from "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/cron/sync-eight-sleep/route";
import { GET as syncGet } from "@/app/api/sync/route";

const CRON_SECRET = "test-cron-secret";
const USER_ID = "user-active-123";

function makeImportRequest(entries: { date: string; text: string }[]): NextRequest {
  return new NextRequest("http://localhost:3000/api/cron/sync-eight-sleep", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify({ entries }),
  });
}

function makeSyncGet(): NextRequest {
  return new NextRequest("http://localhost:3000/api/sync", {
    method: "GET",
    headers: { "X-Forwarded-For": `test-${Math.random()}` },
  });
}

describe("Eight Sleep -> Chart data flow", () => {
  beforeEach(() => {
    clearMockRedis();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    setMockUserId(USER_ID);
  });

  it("imports Eight Sleep data and retrieves it via sync endpoint with correct structure", async () => {
    // Seed: active user with Oura connected (so Eight Sleep import picks the right user)
    seedMockRedis({
      [`user:${USER_ID}:oauth:oura`]: JSON.stringify({ accessToken: "tok", refreshToken: "ref", expiresAt: 9999999999 }),
      [`user:${USER_ID}:data`]: JSON.stringify({ recovery: {}, completions: {} }),
    });

    // Import Eight Sleep data for 3 days
    const importRes = await POST(makeImportRequest([
      { date: "2026-04-06", text: "Your Sleep Fitness Score is 82. You slept 7h 15m. HRV: 38 ms. RHR: 58 bpm." },
      { date: "2026-04-07", text: "Your Sleep Fitness Score is 88. You slept 8h 05m. HRV: 45 ms. RHR: 55 bpm." },
      { date: "2026-04-08", text: "Your Sleep Fitness Score is 79. You slept 6h 50m. HRV: 32 ms. RHR: 62 bpm." },
    ]));

    const importData = await importRes.json();
    expect(importData.success).toBe(true);
    expect(importData.imported).toBe(3);

    // Verify data is in Redis with correct recovery structure
    const redis = getMockRedis();
    const raw = await redis.get(`user:${USER_ID}:data`);
    const stored = JSON.parse(raw!);

    // All 3 days should be in recovery
    expect(stored.recovery["2026-04-06"].eightSleep).toMatchObject({
      sleepFitnessScore: 82, hrv: 38, rhr: 58, autoImported: true,
    });
    expect(stored.recovery["2026-04-07"].eightSleep).toMatchObject({
      sleepFitnessScore: 88, hrv: 45, rhr: 55, autoImported: true,
    });
    expect(stored.recovery["2026-04-08"].eightSleep).toMatchObject({
      sleepFitnessScore: 79, hrv: 32, rhr: 62, autoImported: true,
    });

    // eightSleepLastSynced should be set
    expect(stored.eightSleepLastSynced).toBeDefined();

    // Now fetch via sync GET (same as client would)
    const syncRes = await syncGet(makeSyncGet());
    const syncJson = await syncRes.json();
    const syncData = syncJson.data;

    // Sync endpoint should return recovery data with Eight Sleep entries
    expect(syncData.recovery).toBeDefined();
    expect(syncData.recovery["2026-04-06"].eightSleep.sleepFitnessScore).toBe(82);
    expect(syncData.recovery["2026-04-07"].eightSleep.rhr).toBe(55);
    expect(syncData.recovery["2026-04-08"].eightSleep.hrv).toBe(32);
  });

  it("merges Eight Sleep data with existing Oura data for same day", async () => {
    seedMockRedis({
      [`user:${USER_ID}:oauth:oura`]: JSON.stringify({ accessToken: "tok", refreshToken: "ref", expiresAt: 9999999999 }),
      [`user:${USER_ID}:data`]: JSON.stringify({
        recovery: {
          "2026-04-08": {
            date: "2026-04-08",
            oura: { readinessScore: 85, hrv: 48, rhr: 54, sleepScore: 82 },
          },
        },
        completions: {},
      }),
    });

    // Import Eight Sleep for the same day
    const res = await POST(makeImportRequest([
      { date: "2026-04-08", text: "Your Sleep Fitness Score is 79. HRV: 32 ms. RHR: 62 bpm." },
    ]));

    expect((await res.json()).imported).toBe(1);

    const redis = getMockRedis();
    const raw = await redis.get(`user:${USER_ID}:data`);
    const stored = JSON.parse(raw!);
    const day = stored.recovery["2026-04-08"];

    // Both sources should coexist
    expect(day.oura.readinessScore).toBe(85);
    expect(day.oura.hrv).toBe(48);
    expect(day.eightSleep.sleepFitnessScore).toBe(79);
    expect(day.eightSleep.rhr).toBe(62);
  });

  it("chart data extraction matches expected structure for RecoveryHistory", async () => {
    // Seed with mixed data (Oura + Eight Sleep)
    seedMockRedis({
      [`user:${USER_ID}:oauth:oura`]: JSON.stringify({ accessToken: "tok", refreshToken: "ref", expiresAt: 9999999999 }),
      [`user:${USER_ID}:data`]: JSON.stringify({
        recovery: {
          "2026-04-06": {
            date: "2026-04-06",
            oura: { readinessScore: 85, hrv: 48, rhr: 54 },
          },
          "2026-04-07": {
            date: "2026-04-07",
            eightSleep: { sleepFitnessScore: 82, hrv: 38, rhr: 58, autoImported: true },
          },
          "2026-04-08": {
            date: "2026-04-08",
            oura: { readinessScore: 90, hrv: 55, rhr: 50 },
            eightSleep: { sleepFitnessScore: 86, hrv: 42, rhr: 56, autoImported: true },
          },
        },
        completions: {},
      }),
    });

    const syncRes = await syncGet(makeSyncGet());
    const syncJson = await syncRes.json();
    const recovery = syncJson.data.recovery;

    // Simulate what RecoveryHistory does: extract score, HRV, RHR per day
    // Priority: Oura first, then Eight Sleep
    const extractScore = (entry: Record<string, unknown> | undefined) => {
      if (!entry) return null;
      const e = entry as { oura?: { readinessScore?: number }; eightSleep?: { sleepFitnessScore?: number } };
      return e.oura?.readinessScore ?? e.eightSleep?.sleepFitnessScore ?? null;
    };
    const extractHrv = (entry: Record<string, unknown> | undefined) => {
      if (!entry) return null;
      const e = entry as { oura?: { hrv?: number }; eightSleep?: { hrv?: number } };
      return e.oura?.hrv ?? e.eightSleep?.hrv ?? null;
    };
    const extractRhr = (entry: Record<string, unknown> | undefined) => {
      if (!entry) return null;
      const e = entry as { oura?: { rhr?: number }; eightSleep?: { rhr?: number } };
      return e.oura?.rhr ?? e.eightSleep?.rhr ?? null;
    };

    // Day with only Oura
    expect(extractScore(recovery["2026-04-06"])).toBe(85);
    expect(extractHrv(recovery["2026-04-06"])).toBe(48);
    expect(extractRhr(recovery["2026-04-06"])).toBe(54);

    // Day with only Eight Sleep
    expect(extractScore(recovery["2026-04-07"])).toBe(82);
    expect(extractHrv(recovery["2026-04-07"])).toBe(38);
    expect(extractRhr(recovery["2026-04-07"])).toBe(58);

    // Day with both - Oura takes priority
    expect(extractScore(recovery["2026-04-08"])).toBe(90);
    expect(extractHrv(recovery["2026-04-08"])).toBe(55);
    expect(extractRhr(recovery["2026-04-08"])).toBe(50);
  });
});
