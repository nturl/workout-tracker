import { describe, it, expect, beforeEach } from "vitest";
import "../mocks/clerk";
import "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { POST } from "@/app/api/oura/disconnect/route";
import { NextRequest } from "next/server";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/oura/disconnect", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      "X-Forwarded-For": `test-${Math.random()}`,
    },
  });
}

describe("POST /api/oura/disconnect", () => {
  beforeEach(() => {
    setMockUserId("test-user-123");
  });

  it("returns 401 without auth", async () => {
    setMockUserId(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 without CSRF header", async () => {
    const req = new NextRequest("http://localhost:3000/api/oura/disconnect", {
      method: "POST",
      headers: { "X-Forwarded-For": `test-${Math.random()}` },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("disconnects successfully", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.disconnected).toBe(true);
  });

  it("returns 500 when deleteTokens throws", async () => {
    const { getMockRedis } = await import("../mocks/redis");
    const redis = getMockRedis();
    redis.del.mockRejectedValueOnce(new Error("Redis down"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to disconnect");
  });
});
