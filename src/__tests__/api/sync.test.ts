import { describe, it, expect, beforeEach } from "vitest";
import { clearMockRedis, seedMockRedis } from "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { GET, POST } from "@/app/api/sync/route";
import { NextRequest } from "next/server";

function makeRequest(method: string, body?: Record<string, unknown>): NextRequest {
  const url = "http://localhost:3000/api/sync";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Forwarded-For": `test-${Math.random()}`,
  };
  if (method === "POST") {
    headers["X-Requested-With"] = "fetch";
  }
  return new NextRequest(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("GET /api/sync", () => {
  beforeEach(() => {
    clearMockRedis();
    setMockUserId("test-user-123");
  });

  it("returns null when no data exists", async () => {
    const res = await GET(makeRequest("GET"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toBeNull();
  });

  it("returns stored data", async () => {
    seedMockRedis({
      "user:test-user-123:data": { completions: { "test-key": true }, level: "beginner" },
    });
    const res = await GET(makeRequest("GET"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.completions["test-key"]).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    setMockUserId(null);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/sync", () => {
  beforeEach(() => {
    clearMockRedis();
    setMockUserId("test-user-123");
  });

  it("saves valid sync data", async () => {
    const res = await POST(makeRequest("POST", {
      completions: { "test-key": true },
      level: "intermediate",
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("rejects invalid data", async () => {
    const res = await POST(makeRequest("POST", {
      level: "expert",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    setMockUserId(null);
    const res = await POST(makeRequest("POST", { level: "beginner" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 without CSRF header", async () => {
    const req = new NextRequest("http://localhost:3000/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": `test-${Math.random()}`,
      },
      body: JSON.stringify({ level: "beginner" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("accepts a delta push with tombstones", async () => {
    const res = await POST(makeRequest("POST", {
      syncMode: "delta",
      completions: { "test-key": true },
      tombstones: { habits: { meditation: ["2026-09-01"] }, completions: ["gone"] },
    }));
    expect(res.status).toBe(200);
  });

  it("rejects a malformed tombstone list", async () => {
    const res = await POST(makeRequest("POST", {
      syncMode: "delta",
      tombstones: { recovery: ["not-a-date"] },
    }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown syncMode", async () => {
    const res = await POST(makeRequest("POST", { syncMode: "full", level: "beginner" }));
    expect(res.status).toBe(400);
  });
});
