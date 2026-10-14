import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/oauthTokens", () => ({
  getTokens: vi.fn(async () => ({ accessToken: "a", refreshToken: "r", expiresAt: 9_999_999_999 })),
  storeTokens: vi.fn(),
  isTokenExpired: vi.fn(() => false),
}));

import { fetchDailyData } from "@/lib/oura";

describe("fetchDailyData", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("omits a null score instead of storing null (Oura scores are nullable before scoring)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        data: url.includes("daily_readiness") ? [{ score: null }] : url.includes("daily_sleep") ? [{ score: null }] : [],
      }),
    })));
    const out = await fetchDailyData("u1", "2026-10-14");
    expect(out).toBeDefined();
    expect("readinessScore" in out!).toBe(false);
    expect("sleepScore" in out!).toBe(false);
  });
});
