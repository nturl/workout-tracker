import { describe, it, expect, beforeEach } from "vitest";
import { clearMockRedis, seedMockRedis } from "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { GET, POST } from "@/app/api/recovery/route";
import { NextRequest } from "next/server";

// Mock crypto module
process.env.PHONE_ENCRYPTION_KEY = "test-encryption-key-for-testing";

function makeGetRequest(date?: string): NextRequest {
  const url = date
    ? `http://localhost:3000/api/recovery?date=${date}`
    : "http://localhost:3000/api/recovery";
  return new NextRequest(url, {
    method: "GET",
    headers: { "X-Forwarded-For": `test-${Math.random()}` },
  });
}

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/recovery", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      "X-Forwarded-For": `test-${Math.random()}`,
    },
    body: JSON.stringify(body),
  });
}

describe("GET /api/recovery", () => {
  beforeEach(() => {
    clearMockRedis();
    setMockUserId("test-user-123");
  });

  it("returns null when no recovery data exists", async () => {
    const res = await GET(makeGetRequest("2026-03-31"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toBeNull();
  });

  it("returns stored recovery data", async () => {
    seedMockRedis({
      "user:test-user-123:recovery:2026-03-31": {
        date: "2026-03-31",
        eightSleep: { sleepFitnessScore: 86 },
      },
    });
    const res = await GET(makeGetRequest("2026-03-31"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.eightSleep.sleepFitnessScore).toBe(86);
  });

  it("returns 401 when not authenticated", async () => {
    setMockUserId(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });
});

describe("POST /api/recovery", () => {
  beforeEach(() => {
    clearMockRedis();
    setMockUserId("test-user-123");
  });

  it("saves phone number (set-phone)", async () => {
    const res = await POST(makePostRequest({
      action: "set-phone",
      phone: "5551234567",
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.phone).toBe("+15551234567");
  });

  it("retrieves phone number (get-phone)", async () => {
    // First save it
    await POST(makePostRequest({ action: "set-phone", phone: "5551234567" }));
    // Then retrieve
    const res = await POST(makePostRequest({ action: "get-phone" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.phone).toBe("+15551234567");
  });

  it("returns empty completions (get-completions)", async () => {
    const res = await POST(makePostRequest({ action: "get-completions" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.completions).toEqual([]);
  });

  it("rejects unknown action", async () => {
    const res = await POST(makePostRequest({ action: "delete-everything" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    setMockUserId(null);
    const res = await POST(makePostRequest({ action: "get-phone" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 without CSRF header", async () => {
    const req = new NextRequest("http://localhost:3000/api/recovery", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": `test-${Math.random()}`,
      },
      body: JSON.stringify({ action: "get-phone" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
