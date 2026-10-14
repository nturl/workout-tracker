import { getRedis } from "@/lib/redis";
import { withRetry } from "@/lib/retry";

/**
 * Read-modify-write of the whole `user:{id}:data` blob under WATCH/MULTI, retried
 * on conflict. `mutate` gets the freshly read blob and returns the one to store,
 * so callers apply only their own fields instead of writing back a stale copy.
 * Await slow external calls BEFORE calling this.
 */
export async function updateUserData(
  userId: string,
  mutate: (existing: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const redis = getRedis();
  const key = `user:${userId}:data`;
  await withRetry(async () => {
    await redis.watch(key);
    const raw = await redis.get(key);
    const merged = mutate(raw ? JSON.parse(raw) : {});
    const result = await redis.multi().set(key, JSON.stringify(merged)).exec();
    if (!result) throw new Error("Transaction conflict");
  }, { maxRetries: 3, baseDelayMs: 100 });
}
