import { describe, it, expect, beforeEach, vi } from "vitest";
import "../mocks/redis";
import { clearMockRedis, seedMockRedis } from "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";

const storeTokens = vi.fn(async () => {});
vi.mock("@/lib/oura", () => ({ exchangeCodeForTokens: vi.fn(async () => ({ access_token: "a", refresh_token: "r", expires_in: 3600 })) }));
vi.mock("@/lib/oauthTokens", () => ({ storeTokens: (...args: unknown[]) => storeTokens(...(args as [])) }));

import { GET } from "@/app/api/oauth/oura/callback/route";
import { NextRequest } from "next/server";

describe("GET /api/oauth/oura/callback", () => {
  beforeEach(() => {
    clearMockRedis();
    storeTokens.mockClear();
    setMockUserId("user-123");
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.OURA_CLIENT_ID = "test-client-id";
    process.env.OURA_CLIENT_SECRET = "test-secret";
    // Suppress expected console.error from token exchange failures
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("redirects with error when error param present", async () => {
    const req = new NextRequest("http://localhost:3000/api/oauth/oura/callback?error=access_denied");
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("oura=error&reason=access_denied");
  });

  it("redirects with error when code missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/oauth/oura/callback?state=abc");
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("reason=missing_params");
  });

  it("redirects with error when state invalid", async () => {
    const req = new NextRequest("http://localhost:3000/api/oauth/oura/callback?code=abc&state=invalid");
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("reason=invalid_state");
  });

  it("validates state from Redis", async () => {
    seedMockRedis({ "oauth:state:valid-state": "user-123" });
    const req = new NextRequest("http://localhost:3000/api/oauth/oura/callback?code=abc&state=valid-state");
    // This will fail at token exchange since we're not mocking fetch, but validates state logic
    const res = await GET(req);
    // Should attempt token exchange (and fail) rather than invalid_state
    const location = res.headers.get("location") || "";
    expect(location).not.toContain("reason=invalid_state");
  });

  // State must be bound to the user who started the flow (login CSRF / token swap).
  it("rejects a state minted for a different signed-in user", async () => {
    seedMockRedis({ "oauth:state:s1": "victim-user" });
    setMockUserId("user-123");
    const res = await GET(new NextRequest("http://localhost:3000/api/oauth/oura/callback?code=abc&state=s1"));
    expect(res.headers.get("location")).toContain("reason=state_mismatch");
    expect(storeTokens).not.toHaveBeenCalled();
  });

  it("stores tokens when the signed-in user matches the state", async () => {
    seedMockRedis({ "oauth:state:s1": "user-123" });
    const res = await GET(new NextRequest("http://localhost:3000/api/oauth/oura/callback?code=abc&state=s1"));
    expect(res.headers.get("location")).toContain("oura=connected");
    expect(storeTokens).toHaveBeenCalledWith("user-123", "oura", expect.anything());
  });

  it("still completes with no session at callback (e.g. PWA hands off to Safari)", async () => {
    seedMockRedis({ "oauth:state:s1": "user-123" });
    setMockUserId(null);
    const res = await GET(new NextRequest("http://localhost:3000/api/oauth/oura/callback?code=abc&state=s1"));
    expect(res.headers.get("location")).toContain("oura=connected");
    expect(storeTokens).toHaveBeenCalledWith("user-123", "oura", expect.anything());
  });
});
