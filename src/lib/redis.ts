import Redis from "ioredis";

const getRedisUrl = () => {
  const url = process.env.KV_REDIS_URL || process.env.KV_REST_API_URL;
  if (!url) throw new Error("No Redis URL configured (KV_REDIS_URL or KV_REST_API_URL)");
  return url;
};

// Reuse connection across invocations in the same container
let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redis;
}
