import { getRedis } from "@/lib/redis";
import { withRetry } from "@/lib/retry";

/**
 * Read-modify-write of the whole `user:{id}:data` blob under WATCH/MULTI, retried
 * on conflict. `mutate` gets the freshly read blob and returns the one to store,
 * so callers apply only their own fields instead of writing back a stale copy.
 * Await slow external calls BEFORE calling this.
 *
 * WATCH is per connection and EXEC clears every watch on it, but getRedis()
 * hands out one shared connection. Two overlapping calls in the same instance
 * could therefore run A:WATCH+GET, B:WATCH+GET, A:EXEC (clears B's watch),
 * B:EXEC (unwatched, built from the pre-A blob) and lose A's keys. Calls for
 * one key are chained in-process so they never interleave; WATCH/MULTI still
 * guards against writers in other instances.
 */
const queues = new Map<string, Promise<unknown>>();

export function updateUserData(
  userId: string,
  mutate: (existing: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const key = `user:${userId}:data`;
  const run = (queues.get(key) ?? Promise.resolve()).then(() => applyUpdate(key, mutate));
  // Keep the chain alive past a failure, and drop the entry once it drains.
  const tail = run.catch(() => {}).then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  queues.set(key, tail);
  return run;
}

async function applyUpdate(
  key: string,
  mutate: (existing: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const redis = getRedis();
  await withRetry(async () => {
    await redis.watch(key);
    const raw = await redis.get(key);
    const merged = mutate(raw ? JSON.parse(raw) : {});
    const result = await redis.multi().set(key, JSON.stringify(merged)).exec();
    if (!result) throw new Error("Transaction conflict");
  }, { maxRetries: 3, baseDelayMs: 100 });
}
