import { describe, it, expect, beforeEach, vi } from "vitest";
import "../mocks/redis";
import { clearMockRedis, seedMockRedis, getMockRedis } from "../mocks/redis";
import { NextRequest } from "next/server";

// Mock oura and oauthTokens
const mockFetchDailyData = vi.fn();
const mockGetTokens = vi.fn();

vi.mock("@/lib/oura", () => ({
  fetchDailyData: (...args: unknown[]) => mockFetchDailyData(...args),
}));

vi.mock("@/lib/oauthTokens", () => ({
  getTokens: (...args: unknown[]) => mockGetTokens(...args),
}));

import { GET, POST } from "@/app/api/cron/sync-recovery/route";

const CRON_SECRET = "test-cron-secret";

function makeGetRequest(auth?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (auth) headers["authorization"] = auth;
  return new NextRequest("http://localhost:3000/api/cron/sync-recovery", {
    method: "GET",
    headers,
  });
}

function makePostRequest(auth?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (auth) headers["authorization"] = auth;
  return new NextRequest("http://localhost:3000/api/cron/sync-recovery", {
    method: "POST",
    headers,
  });
}

describe("/api/cron/sync-recovery", () => {
  beforeEach(() => {
    clearMockRedis();
    mockFetchDailyData.mockReset();
    mockGetTokens.mockReset();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
  });

  describe("GET - auth", () => {
    it("returns 401 without auth header", async () => {
      const res = await GET(makeGetRequest());
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 with wrong secret", async () => {
      const res = await GET(makeGetRequest("Bearer wrong"));
      expect(res.status).toBe(401);
    });

    it("succeeds with correct auth", async () => {
      const res = await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));
      expect(res.status).toBe(200);
    });
  });

  describe("POST - auth", () => {
    it("returns 401 without auth header", async () => {
      const res = await POST(makePostRequest());
      expect(res.status).toBe(401);
    });

    it("succeeds with correct auth", async () => {
      const res = await POST(makePostRequest(`Bearer ${CRON_SECRET}`));
      expect(res.status).toBe(200);
    });
  });

  describe("syncing", () => {
    it("returns empty results when no users have Oura connected", async () => {
      const res = await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.users).toBe(0);
      expect(data.results).toEqual([]);
    });

    it("syncs today and yesterday for each user", async () => {
      seedMockRedis({ "user:u1:oauth:oura": "encrypted-tokens" });
      mockGetTokens.mockResolvedValue({ accessToken: "at", refreshToken: "rt", expiresAt: 9999999999 });
      mockFetchDailyData.mockResolvedValue({ readiness: { score: 80 } });

      const res = await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.dates).toHaveLength(2);
      expect(data.users).toBe(1);
      expect(data.synced).toBe(1);
      expect(mockFetchDailyData).toHaveBeenCalledTimes(2); // yesterday + today
    });

    it("stores synced data in Redis under user:userId:data", async () => {
      seedMockRedis({ "user:u1:oauth:oura": "encrypted-tokens" });
      mockGetTokens.mockResolvedValue({ accessToken: "at", refreshToken: "rt", expiresAt: 9999999999 });
      mockFetchDailyData.mockResolvedValue({ readiness: { score: 85 }, sleep: { score: 90 } });

      await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));

      const redis = getMockRedis();
      const stored = await redis.get("user:u1:data");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.recovery).toBeTruthy();
      expect(parsed.updatedAt).toBeTruthy();
    });

    it("merges with existing user data", async () => {
      seedMockRedis({
        "user:u1:oauth:oura": "encrypted-tokens",
        "user:u1:data": JSON.stringify({ someExisting: "data", recovery: {} }),
      });
      mockGetTokens.mockResolvedValue({ accessToken: "at", refreshToken: "rt", expiresAt: 9999999999 });
      mockFetchDailyData.mockResolvedValue({ readiness: { score: 75 } });

      await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));

      const redis = getMockRedis();
      const stored = JSON.parse((await redis.get("user:u1:data"))!);
      expect(stored.someExisting).toBe("data");
      expect(stored.recovery).toBeTruthy();
    });

    it("handles missing tokens gracefully", async () => {
      seedMockRedis({ "user:u1:oauth:oura": "encrypted-tokens" });
      mockGetTokens.mockResolvedValue(null);

      const res = await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));
      const data = await res.json();
      expect(data.results[0].errors).toContain("No tokens");
      expect(data.synced).toBe(0);
    });

    it("handles fetch failure for one date without blocking others", async () => {
      seedMockRedis({ "user:u1:oauth:oura": "encrypted-tokens" });
      mockGetTokens.mockResolvedValue({ accessToken: "at", refreshToken: "rt", expiresAt: 9999999999 });
      // First call (yesterday) fails, second (today) succeeds
      mockFetchDailyData
        .mockRejectedValueOnce(new Error("Oura API down"))
        .mockResolvedValueOnce({ readiness: { score: 80 } });

      const res = await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));
      const data = await res.json();
      expect(data.results[0].synced).toHaveLength(1); // today synced
      expect(data.results[0].errors).toHaveLength(1); // yesterday failed
    });

    it("syncs multiple users independently", async () => {
      seedMockRedis({
        "user:u1:oauth:oura": "tokens1",
        "user:u2:oauth:oura": "tokens2",
      });
      mockGetTokens.mockResolvedValue({ accessToken: "at", refreshToken: "rt", expiresAt: 9999999999 });
      mockFetchDailyData.mockResolvedValue({ readiness: { score: 70 } });

      const res = await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));
      const data = await res.json();
      expect(data.users).toBe(2);
      expect(data.synced).toBe(2);
      expect(mockFetchDailyData).toHaveBeenCalledTimes(4); // 2 users x 2 dates
    });

    it("handles null Oura data (no data available for date)", async () => {
      seedMockRedis({ "user:u1:oauth:oura": "tokens" });
      mockGetTokens.mockResolvedValue({ accessToken: "at", refreshToken: "rt", expiresAt: 9999999999 });
      mockFetchDailyData.mockResolvedValue(null);

      const res = await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));
      const data = await res.json();
      expect(data.results[0].synced).toHaveLength(0);
      expect(data.results[0].errors.length).toBeGreaterThan(0);
    });
  });
});
