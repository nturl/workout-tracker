import { describe, it, expect, beforeEach } from "vitest";
import "../mocks/redis";
import { clearMockRedis } from "../mocks/redis";
import { storeTokens, getTokens, deleteTokens, isTokenExpired, type OAuthTokens } from "@/lib/oauthTokens";

const TEST_TOKENS: OAuthTokens = {
  accessToken: "test-access-token-12345",
  refreshToken: "test-refresh-token-67890",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
};

describe("oauthTokens", () => {
  beforeEach(() => {
    clearMockRedis();
    process.env.PHONE_ENCRYPTION_KEY = "test-encryption-key-for-tests";
  });

  it("stores and retrieves tokens", async () => {
    await storeTokens("user-1", "oura", TEST_TOKENS);
    const retrieved = await getTokens("user-1", "oura");
    expect(retrieved).toEqual(TEST_TOKENS);
  });

  it("returns null for non-existent tokens", async () => {
    const result = await getTokens("user-1", "oura");
    expect(result).toBeNull();
  });

  it("deletes tokens", async () => {
    await storeTokens("user-1", "oura", TEST_TOKENS);
    await deleteTokens("user-1", "oura");
    const result = await getTokens("user-1", "oura");
    expect(result).toBeNull();
  });

  it("isolates tokens by provider", async () => {
    await storeTokens("user-1", "oura", TEST_TOKENS);
    const terraResult = await getTokens("user-1", "terra");
    expect(terraResult).toBeNull();
  });

  it("isolates tokens by user", async () => {
    await storeTokens("user-1", "oura", TEST_TOKENS);
    const otherUser = await getTokens("user-2", "oura");
    expect(otherUser).toBeNull();
  });

  it("detects expired tokens", () => {
    const expired = { ...TEST_TOKENS, expiresAt: Math.floor(Date.now() / 1000) - 100 };
    expect(isTokenExpired(expired)).toBe(true);
  });

  it("detects valid tokens", () => {
    const valid = { ...TEST_TOKENS, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    expect(isTokenExpired(valid)).toBe(false);
  });

  it("considers tokens expiring within 5 minutes as expired", () => {
    const almostExpired = { ...TEST_TOKENS, expiresAt: Math.floor(Date.now() / 1000) + 200 };
    expect(isTokenExpired(almostExpired)).toBe(true);
  });
});
