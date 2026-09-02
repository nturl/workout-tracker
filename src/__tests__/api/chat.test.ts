import { describe, it, expect, beforeEach } from "vitest";
import "../mocks/clerk";
import { setMockUserId } from "../mocks/clerk";
import { POST } from "@/app/api/chat/route";
import { NextRequest } from "next/server";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      "X-Forwarded-For": `test-${Math.random()}`,
    },
    body: JSON.stringify({ message: "hello" }),
  });
}

describe("POST /api/chat auth", () => {
  beforeEach(() => {
    setMockUserId("test-user-123");
  });

  // BUG-12: middleware.ts previously left /api/chat to Clerk's
  // auth.protect(), which turns an unauthenticated fetch() into an HTML 404
  // instead of the JSON 401 the handler already returns internally.
  it("returns a JSON 401 when not authenticated (BUG-12: not an HTML 404)", async () => {
    setMockUserId(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });
});
