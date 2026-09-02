import { describe, it, expect, beforeEach } from "vitest";
import "../mocks/clerk";
import { clearMockRedis } from "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { GET, POST } from "@/app/api/labs/route";
import { NextRequest } from "next/server";

function makeGetRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/labs", {
    headers: { "X-Forwarded-For": `test-${Math.random()}` },
  });
}

function makePostRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/labs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      "X-Forwarded-For": `test-${Math.random()}`,
    },
    body: JSON.stringify({ action: "list" }),
  });
}

describe("GET /api/labs auth", () => {
  beforeEach(() => {
    clearMockRedis();
    setMockUserId("test-user-123");
  });

  // BUG-12: middleware.ts previously left /api/labs to Clerk's
  // auth.protect(), which turns an unauthenticated fetch() into an HTML 404
  // instead of the JSON 401 the handler already returns internally.
  it("returns a JSON 401 when not authenticated (BUG-12: not an HTML 404)", async () => {
    setMockUserId(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });
});

describe("POST /api/labs auth", () => {
  beforeEach(() => {
    clearMockRedis();
    setMockUserId("test-user-123");
  });

  it("returns a JSON 401 when not authenticated (BUG-12: not an HTML 404)", async () => {
    setMockUserId(null);
    const res = await POST(makePostRequest());
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });
});
