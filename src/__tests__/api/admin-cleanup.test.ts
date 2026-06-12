import { describe, it, expect, beforeEach, vi } from "vitest";
import "../mocks/redis";
import { clearMockRedis, seedMockRedis, getMockRedis } from "../mocks/redis";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/admin/cleanup/route";

const CRON_SECRET = "test-cron-secret";

function makeGetRequest(auth?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (auth) headers["authorization"] = auth;
  return new NextRequest("http://localhost:3000/api/admin/cleanup", {
    method: "GET",
    headers,
  });
}

function makePostRequest(body: unknown, auth?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) headers["authorization"] = auth;
  return new NextRequest("http://localhost:3000/api/admin/cleanup", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("/api/admin/cleanup", () => {
  beforeEach(() => {
    clearMockRedis();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
  });

  // ── Auth ──────────────────────────────────────────────────────────

  describe("auth", () => {
    it("GET returns 401 without auth", async () => {
      const res = await GET(makeGetRequest());
      expect(res.status).toBe(401);
    });

    it("POST returns 401 without auth", async () => {
      const res = await POST(makePostRequest({}));
      expect(res.status).toBe(401);
    });

    it("GET returns 401 with wrong secret", async () => {
      const res = await GET(makeGetRequest("Bearer wrong"));
      expect(res.status).toBe(401);
    });
  });

  // ── GET - health report ───────────────────────────────────────────

  describe("GET - health report", () => {
    it("reports clean state with no orphaned keys", async () => {
      seedMockRedis({
        "user:active-user:oauth:oura": JSON.stringify({ accessToken: "tok" }),
        "user:active-user:data": JSON.stringify({ recovery: {} }),
      });

      const res = await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));
      const data = await res.json();

      expect(data.activeUsers).toEqual(["active-user"]);
      expect(data.orphanedUsers).toEqual([]);
      expect(data.cleanupNeeded).toBe(false);
    });

    it("identifies orphaned users without Oura connection", async () => {
      seedMockRedis({
        "user:active-user:oauth:oura": JSON.stringify({ accessToken: "tok" }),
        "user:active-user:data": JSON.stringify({ recovery: {} }),
        "user:orphaned-user:data": JSON.stringify({ recovery: {} }),
      });

      const res = await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));
      const data = await res.json();

      expect(data.activeUsers).toEqual(["active-user"]);
      expect(data.orphanedUsers).toEqual(["orphaned-user"]);
      expect(data.cleanupNeeded).toBe(true);
    });

    it("reports legacy key counts", async () => {
      seedMockRedis({
        "user:active-user:oauth:oura": JSON.stringify({ accessToken: "tok" }),
        "user:active-user:data": JSON.stringify({}),
        "phone:+15551234567:userId": "old-user",
        "recovery:2026-04-01": JSON.stringify({ date: "2026-04-01" }),
        "completion:2026-04-01:Monday": JSON.stringify({ completedAt: "2026-04-01" }),
      });

      const res = await GET(makeGetRequest(`Bearer ${CRON_SECRET}`));
      const data = await res.json();

      expect(data.keyBreakdown["phone:+*:userId (legacy)"]).toBe(1);
      expect(data.keyBreakdown["recovery:* (legacy)"]).toBe(1);
      expect(data.keyBreakdown["completion:* (legacy)"]).toBe(1);
      expect(data.cleanupNeeded).toBe(true);
    });
  });

  // ── POST - cleanup ────────────────────────────────────────────────

  describe("POST - cleanup", () => {
    it("defaults to dry run", async () => {
      seedMockRedis({
        "user:active-user:oauth:oura": JSON.stringify({ accessToken: "tok" }),
        "user:active-user:data": JSON.stringify({}),
        "user:orphaned:data": JSON.stringify({ recovery: {} }),
      });

      const res = await POST(makePostRequest({}, `Bearer ${CRON_SECRET}`));
      const data = await res.json();

      expect(data.dryRun).toBe(true);
      expect(data.orphanedCount).toBeGreaterThan(0);

      // Key should still exist (dry run)
      const redis = getMockRedis();
      const still = await redis.get("user:orphaned:data");
      expect(still).not.toBeNull();
    });

    it("deletes orphaned user keys when dryRun=false", async () => {
      seedMockRedis({
        "user:active-user:oauth:oura": JSON.stringify({ accessToken: "tok" }),
        "user:active-user:data": JSON.stringify({}),
        "user:orphaned:data": JSON.stringify({ recovery: {} }),
        "user:orphaned:phone": "encrypted-phone",
      });

      const res = await POST(makePostRequest({ dryRun: false }, `Bearer ${CRON_SECRET}`));
      const data = await res.json();

      expect(data.dryRun).toBe(false);
      expect(data.orphanedCount).toBe(2); // data + phone

      // Orphaned keys should be gone
      const redis = getMockRedis();
      expect(await redis.get("user:orphaned:data")).toBeNull();
      expect(await redis.get("user:orphaned:phone")).toBeNull();

      // Active user should be untouched
      expect(await redis.get("user:active-user:data")).not.toBeNull();
    });

    it("deletes legacy keys when dryRun=false", async () => {
      seedMockRedis({
        "user:active-user:oauth:oura": JSON.stringify({ accessToken: "tok" }),
        "user:active-user:data": JSON.stringify({}),
        "phone:+15551234567:userId": "old-user",
        "recovery:2026-04-01": JSON.stringify({}),
        "sms:completions": JSON.stringify([]),
      });

      const res = await POST(makePostRequest({ dryRun: false }, `Bearer ${CRON_SECRET}`));
      const data = await res.json();

      expect(data.legacyCount).toBe(3);

      const redis = getMockRedis();
      expect(await redis.get("phone:+15551234567:userId")).toBeNull();
      expect(await redis.get("recovery:2026-04-01")).toBeNull();
      expect(await redis.get("sms:completions")).toBeNull();
    });

    it("preserves active user keys", async () => {
      seedMockRedis({
        "user:active-user:oauth:oura": JSON.stringify({ accessToken: "tok" }),
        "user:active-user:data": JSON.stringify({ recovery: {} }),
        "user:active-user:phone": "encrypted",
        "user:active-user:ntfy-topic": "my-topic",
      });

      const res = await POST(makePostRequest({ dryRun: false }, `Bearer ${CRON_SECRET}`));
      const data = await res.json();

      expect(data.orphanedCount).toBe(0);

      const redis = getMockRedis();
      expect(await redis.get("user:active-user:data")).not.toBeNull();
      expect(await redis.get("user:active-user:phone")).not.toBeNull();
    });
  });
});
