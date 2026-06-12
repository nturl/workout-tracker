import { describe, it, expect, beforeEach, vi } from "vitest";
import "../mocks/redis";
import { clearMockRedis, seedMockRedis, getMockRedis } from "../mocks/redis";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/cron/sync-eight-sleep/route";

const CRON_SECRET = "test-cron-secret";

function makeGetRequest(auth?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (auth) headers["authorization"] = auth;
  return new NextRequest("http://localhost:3000/api/cron/sync-eight-sleep", {
    method: "GET",
    headers,
  });
}

function makePostRequest(body: unknown, auth?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) headers["authorization"] = auth;
  return new NextRequest("http://localhost:3000/api/cron/sync-eight-sleep", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("/api/cron/sync-eight-sleep", () => {
  beforeEach(() => {
    clearMockRedis();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
  });

  // ── Auth ──────────────────────────────────────────────────────────

  describe("POST - auth", () => {
    it("returns 401 without auth header", async () => {
      const res = await POST(makePostRequest({ entries: [] }));
      expect(res.status).toBe(401);
    });

    it("returns 401 with wrong secret", async () => {
      const res = await POST(makePostRequest({ entries: [] }, "Bearer wrong"));
      expect(res.status).toBe(401);
    });

    it("returns 401 when CRON_SECRET is not set", async () => {
      vi.stubEnv("CRON_SECRET", "");
      const res = await POST(makePostRequest({ entries: [] }, `Bearer ${CRON_SECRET}`));
      expect(res.status).toBe(401);
    });
  });

  describe("GET - auth", () => {
    it("returns 401 without auth header", async () => {
      const res = await GET(makeGetRequest());
      expect(res.status).toBe(401);
    });

    it("returns 401 with wrong secret", async () => {
      const res = await GET(makeGetRequest("Bearer wrong"));
      expect(res.status).toBe(401);
    });
  });

  // ── POST - validation ─────────────────────────────────────────────

  describe("POST - validation", () => {
    it("returns 400 when entries is missing", async () => {
      const res = await POST(makePostRequest({}, `Bearer ${CRON_SECRET}`));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("entries array required");
    });

    it("returns 400 when entries is empty", async () => {
      const res = await POST(makePostRequest({ entries: [] }, `Bearer ${CRON_SECRET}`));
      expect(res.status).toBe(400);
    });

    it("returns 400 when no users exist", async () => {
      const res = await POST(makePostRequest({
        entries: [{ date: "2026-04-08", text: "Your Sleep Fitness Score is 86." }],
      }, `Bearer ${CRON_SECRET}`));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("No users found");
    });
  });

  // ── POST - import ─────────────────────────────────────────────────

  describe("POST - import", () => {
    beforeEach(() => {
      seedMockRedis({ "user:user-123:data": { recovery: {} } });
    });

    it("imports a single Eight Sleep SMS entry", async () => {
      const res = await POST(makePostRequest({
        entries: [{ date: "2026-04-08", text: "Your Sleep Fitness Score is 86. You slept 8h 21m. HRV: 36 ms. RHR: 61 bpm." }],
      }, `Bearer ${CRON_SECRET}`));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.imported).toBe(1);
      expect(data.results[0].status).toBe("imported");
      expect(data.results[0].metrics).toMatchObject({
        sleepFitnessScore: 86,
        timeSlept: "8h 21m",
        hrv: 36,
        rhr: 61,
      });
    });

    it("stores imported data in Redis with correct structure", async () => {
      await POST(makePostRequest({
        entries: [{ date: "2026-04-08", text: "Your Sleep Fitness Score is 86. HRV: 36 ms." }],
      }, `Bearer ${CRON_SECRET}`));

      const redis = getMockRedis();
      const raw = await redis.get("user:user-123:data");
      const stored = JSON.parse(raw!);
      expect(stored.recovery["2026-04-08"].eightSleep).toMatchObject({
        sleepFitnessScore: 86,
        hrv: 36,
        autoImported: true,
      });
      expect(stored.recovery["2026-04-08"].eightSleep.importedAt).toBeDefined();
      expect(stored.updatedAt).toBeTypeOf("number");
      expect(stored.eightSleepLastSynced).toBeDefined();
    });

    it("imports multiple entries across different dates", async () => {
      const res = await POST(makePostRequest({
        entries: [
          { date: "2026-04-07", text: "Your Sleep Fitness Score is 82. HRV: 40 ms." },
          { date: "2026-04-08", text: "Your Sleep Fitness Score is 86. HRV: 36 ms." },
        ],
      }, `Bearer ${CRON_SECRET}`));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.imported).toBe(2);
      expect(data.total).toBe(2);
    });

    it("skips entries that cannot be parsed", async () => {
      const res = await POST(makePostRequest({
        entries: [
          { date: "2026-04-07", text: "Hello, how are you?" },
          { date: "2026-04-08", text: "Your Sleep Fitness Score is 86." },
        ],
      }, `Bearer ${CRON_SECRET}`));

      const data = await res.json();
      expect(data.imported).toBe(1);
      expect(data.total).toBe(2);
      expect(data.results[0].status).toBe("no_metrics_found");
      expect(data.results[1].status).toBe("imported");
    });

    it("merges with existing recovery data", async () => {
      seedMockRedis({
        "user:user-123:data": {
          recovery: {
            "2026-04-08": {
              date: "2026-04-08",
              oura: { readinessScore: 82, hrv: 45 },
            },
          },
        },
      });

      await POST(makePostRequest({
        entries: [{ date: "2026-04-08", text: "Your Sleep Fitness Score is 86. HRV: 36 ms." }],
      }, `Bearer ${CRON_SECRET}`));

      const redis = getMockRedis();
      const raw = await redis.get("user:user-123:data");
      const stored = JSON.parse(raw!);
      // Oura data should be preserved
      expect(stored.recovery["2026-04-08"].oura).toMatchObject({
        readinessScore: 82,
        hrv: 45,
      });
      // Eight Sleep data should be added
      expect(stored.recovery["2026-04-08"].eightSleep.sleepFitnessScore).toBe(86);
    });

    it("parses deep sleep and REM sleep percentages", async () => {
      const res = await POST(makePostRequest({
        entries: [{ date: "2026-04-08", text: "Your Sleep Fitness Score is 86. Deep sleep: 14%. REM sleep: 35%." }],
      }, `Bearer ${CRON_SECRET}`));

      const data = await res.json();
      expect(data.results[0].metrics).toMatchObject({
        sleepFitnessScore: 86,
        deepSleepPct: 14,
        remSleepPct: 35,
      });
    });
  });

  // ── GET - staleness check ─────────────────────────────────────────

  describe("GET - staleness check", () => {
    it("returns no_users status when no users exist", async () => {
      const res = await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("no_users");
      expect(data.stale).toBe(false);
    });

    it("reports stale when eightSleepLastSynced is missing", async () => {
      seedMockRedis({ "user:user-123:data": { recovery: {} } });
      const res = await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));
      const data = await res.json();
      expect(data.stale).toBe(true);
      expect(data.lastSynced).toBeNull();
    });

    it("reports not stale when recently synced", async () => {
      seedMockRedis({
        "user:user-123:data": {
          recovery: {},
          eightSleepLastSynced: new Date().toISOString(),
        },
      });
      const res = await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));
      const data = await res.json();
      expect(data.stale).toBe(false);
      expect(data.lastSynced).toBeDefined();
      expect(data.staleHours).toBe(0);
    });

    it("reports stale when synced more than 48h ago", async () => {
      const oldDate = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
      seedMockRedis({
        "user:user-123:data": {
          recovery: {},
          eightSleepLastSynced: oldDate,
        },
      });
      const res = await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));
      const data = await res.json();
      expect(data.stale).toBe(true);
      expect(data.staleHours).toBeGreaterThanOrEqual(49);
    });
  });
});
