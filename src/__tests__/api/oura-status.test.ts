import { describe, it, expect, beforeEach, vi } from "vitest";
import "../mocks/clerk";
import "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { NextRequest } from "next/server";

vi.mock("@/lib/oauthTokens", () => ({
  getTokens: vi.fn(),
  isTokenExpired: vi.fn(() => false),
}));

import { GET } from "@/app/api/oura/status/route";
import { getTokens, isTokenExpired } from "@/lib/oauthTokens";

const mockedGetTokens = getTokens as ReturnType<typeof vi.fn>;
const mockedIsTokenExpired = isTokenExpired as ReturnType<typeof vi.fn>;

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/oura/status", {
    method: "GET",
    headers: { "X-Forwarded-For": `test-${Math.random()}` },
  });
}

describe("GET /api/oura/status", () => {
  beforeEach(() => {
    setMockUserId("test-user-123");
    mockedGetTokens.mockReset();
    mockedIsTokenExpired.mockReset().mockReturnValue(false);
  });

  it("returns 401 without auth", async () => {
    setMockUserId(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns connected: true when tokens exist", async () => {
    mockedGetTokens.mockResolvedValueOnce({
      accessToken: "abc",
      refreshToken: "def",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.connected).toBe(true);
    expect(data.expired).toBe(false);
  });

  it("returns connected: false when no tokens", async () => {
    mockedGetTokens.mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.connected).toBe(false);
  });

  it("returns 500 when getTokens throws", async () => {
    mockedGetTokens.mockRejectedValueOnce(new Error("Redis down"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to check status");
  });
});
