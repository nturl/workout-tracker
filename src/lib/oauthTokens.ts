import { getRedis } from "@/lib/redis";
import { encrypt, decrypt } from "@/lib/crypto";

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in seconds
}

function redisKey(userId: string, provider: string): string {
  return `user:${userId}:oauth:${provider}`;
}

export async function storeTokens(
  userId: string,
  provider: string,
  tokens: OAuthTokens
): Promise<void> {
  const redis = getRedis();
  const encrypted = encrypt(JSON.stringify(tokens));
  await redis.set(redisKey(userId, provider), encrypted);
}

export async function getTokens(
  userId: string,
  provider: string
): Promise<OAuthTokens | null> {
  const redis = getRedis();
  const raw = await redis.get(redisKey(userId, provider));
  if (!raw) return null;
  try {
    return JSON.parse(decrypt(raw)) as OAuthTokens;
  } catch {
    return null;
  }
}

export async function deleteTokens(
  userId: string,
  provider: string
): Promise<void> {
  const redis = getRedis();
  await redis.del(redisKey(userId, provider));
}

export function isTokenExpired(tokens: OAuthTokens): boolean {
  // Consider expired 5 minutes before actual expiry
  return Date.now() / 1000 > tokens.expiresAt - 300;
}
