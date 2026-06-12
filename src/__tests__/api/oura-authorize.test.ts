import { describe, it, expect, beforeEach } from "vitest";
import "../mocks/clerk";
import "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { GET } from "@/app/api/oauth/oura/authorize/route";
import { NextRequest } from "next/server";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/oauth/oura/authorize", {
    method: "GET",
    headers: { "X-Forwarded-For": `test-${Math.random()}` },
  });
}

describe("GET /api/oauth/oura/authorize", () => {
  beforeEach(() => {
    setMockUserId("test-user-123");
    process.env.OURA_CLIENT_ID = "test-client-id";
    process.env.OURA_CLIENT_SECRET = "test-client-secret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  it("returns 401 without auth", async () => {
    setMockUserId(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 500 when Oura not configured", async () => {
    delete process.env.OURA_CLIENT_ID;
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });

  it("redirects to Oura OAuth URL", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("cloud.ouraring.com/oauth/authorize");
    expect(location).toContain("client_id=test-client-id");
  });

  it("returns 500 when Redis throws", async () => {
    const { getMockRedis } = await import("../mocks/redis");
    const redis = getMockRedis();
    redis.set.mockRejectedValueOnce(new Error("Redis down"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to start OAuth flow");
  });
});
