import { describe, it, expect, beforeEach } from "vitest";
import "../mocks/clerk";
import { setMockUserId } from "../mocks/clerk";
import { POST } from "@/app/api/extract-metrics/route";
import { NextRequest } from "next/server";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/extract-metrics", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      "X-Forwarded-For": `test-${Math.random()}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/extract-metrics", () => {
  beforeEach(() => {
    setMockUserId("test-user-123");
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("rejects missing fields", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("rejects invalid image format", async () => {
    const res = await POST(makeRequest({
      imageDataUrl: "not-a-data-url",
      source: "eightSleep",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects oversized images", async () => {
    const bigData = "data:image/jpeg;base64," + "A".repeat(7_000_001);
    const res = await POST(makeRequest({
      imageDataUrl: bigData,
      source: "eightSleep",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid source", async () => {
    const res = await POST(makeRequest({
      imageDataUrl: "data:image/jpeg;base64,abc123",
      source: "fitbit",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when ANTHROPIC_API_KEY not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({
      imageDataUrl: "data:image/jpeg;base64,abc123",
      source: "eightSleep",
    }));
    expect(res.status).toBe(500);
  });

  it("returns 403 without CSRF header", async () => {
    const req = new NextRequest("http://localhost:3000/api/extract-metrics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": `test-${Math.random()}`,
      },
      body: JSON.stringify({
        imageDataUrl: "data:image/jpeg;base64,abc123",
        source: "eightSleep",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  // BUG-12: this route relied entirely on Clerk middleware's auth.protect()
  // for auth (no handler-level check), which only works for page navigations
  // - a plain fetch() with no session got rewritten to an HTML 404. Now that
  // /api/extract-metrics is a public route in middleware.ts (so unauthed
  // fetches aren't intercepted), the handler must enforce the session itself.
  it("returns a JSON 401 when not authenticated (BUG-12: not an HTML 404)", async () => {
    setMockUserId(null);
    const res = await POST(makeRequest({
      imageDataUrl: "data:image/jpeg;base64,abc123",
      source: "eightSleep",
    }));
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });
});
