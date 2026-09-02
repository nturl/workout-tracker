import { describe, it, expect, beforeEach } from "vitest";
import "../mocks/clerk";
import { clearMockRedis } from "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { GET } from "@/app/api/health-goals/route";
import { NextRequest } from "next/server";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/health-goals", {
    headers: { "X-Forwarded-For": `test-${Math.random()}` },
  });
}

describe("GET /api/health-goals auth", () => {
  beforeEach(() => {
    clearMockRedis();
    setMockUserId("test-user-123");
  });

  // BUG-12: /api/health-goals happened to already be covered by the
  // "/api/health(.*)" public-route pattern (path-to-regexp appends (.*)
  // straight onto the literal, so it matches any "/api/health*" prefix, not
  // just "/api/health" itself) - but that was incidental, not intentional,
  // so it's now also listed explicitly in middleware.ts for clarity. Either
  // way, the handler's own auth() + 401 guard is what actually protects it.
  it("returns a JSON 401 when not authenticated (BUG-12: not an HTML 404)", async () => {
    setMockUserId(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });
});
