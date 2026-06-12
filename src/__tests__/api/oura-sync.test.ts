import { describe, it, expect, beforeEach } from "vitest";
import "../mocks/clerk";
import "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { clearMockRedis } from "../mocks/redis";
import { POST } from "@/app/api/oura/sync/route";
import { NextRequest } from "next/server";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/oura/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      "X-Forwarded-For": `test-${Math.random()}`,
    },
  });
}

describe("POST /api/oura/sync", () => {
  beforeEach(() => {
    setMockUserId("test-user-123");
    clearMockRedis();
  });

  it("returns 401 without auth", async () => {
    setMockUserId(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 without CSRF header", async () => {
    const req = new NextRequest("http://localhost:3000/api/oura/sync", {
      method: "POST",
      headers: { "X-Forwarded-For": `test-${Math.random()}` },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when Oura not connected", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Oura not connected");
  });
});
