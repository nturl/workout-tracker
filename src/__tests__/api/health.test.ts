import { describe, it, expect, beforeEach, vi } from "vitest";
import "../mocks/redis";
import { clearMockRedis, getMockRedis } from "../mocks/redis";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    clearMockRedis();
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("CLERK_SECRET_KEY", "clerk-key");
    vi.stubEnv("GOOGLE_AI_API_KEY", "gemini-key");
  });

  it("returns healthy when Redis is up", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("healthy");
    expect(data.checks.redis).toBe("ok");
    expect(data.version).toBe("8.0.0");
    expect(data.timestamp).toBeTruthy();
  });

  it("returns degraded (503) when Redis ping fails", async () => {
    const redis = getMockRedis();
    redis.ping.mockRejectedValueOnce(new Error("Connection refused"));

    const res = await GET();
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe("degraded");
    expect(data.checks.redis).toBe("error");
  });

  it("reports notification config status", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.checks.notifications).toBe("configured");
  });

  it("reports clerk config status", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.checks.clerk).toBe("configured");
  });

  it("reports AI config status", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.checks.googleAI).toBe("configured");
  });
});
