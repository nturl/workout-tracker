import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { auth } from "@clerk/nextjs/server";
import { syncBodySchema } from "@/lib/validators";
import { rateLimit, rateLimitResponse, checkCsrf, csrfResponse } from "@/lib/rateLimit";
import { withRetry } from "@/lib/retry";

export async function GET(req: NextRequest) {
  const { success } = rateLimit(req, { limit: 120, windowMs: 60_000 });
  if (!success) return rateLimitResponse();
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const redis = getRedis();
    const raw = await redis.get(`user:${userId}:data`);
    const data = raw ? JSON.parse(raw) : null;
    // V14: private cache for 60s to backstop client staleTime
    return NextResponse.json({ data }, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("Sync GET error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return csrfResponse();
  const { success } = rateLimit(req, { limit: 60, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const parsed = syncBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
    }

    const { completions, logs, level, recovery, habits } = parsed.data;

    const data: Record<string, unknown> = {};
    if (completions !== undefined) data.completions = completions;
    if (logs !== undefined) data.logs = logs;
    if (level !== undefined) data.level = level;
    if (recovery !== undefined) data.recovery = recovery;
    if (habits !== undefined) data.habits = habits;

    const redis = getRedis();
    const key = `user:${userId}:data`;

    // Deep-merge helper for nested objects (recovery dates, logs, completions)
    function deepMerge(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
      const result = { ...existing };
      for (const [k, v] of Object.entries(incoming)) {
        if (v && typeof v === "object" && !Array.isArray(v) && existing[k] && typeof existing[k] === "object" && !Array.isArray(existing[k])) {
          result[k] = deepMerge(existing[k] as Record<string, unknown>, v as Record<string, unknown>);
        } else {
          result[k] = v;
        }
      }
      return result;
    }

    // Use WATCH/MULTI for optimistic locking with retry on race conditions
    await withRetry(async () => {
      await redis.watch(key);
      const existingRaw = await redis.get(key);
      const existing = existingRaw ? JSON.parse(existingRaw) : {};
      const merged = { ...deepMerge(existing, data), updatedAt: Date.now() };

      const result = await redis.multi().set(key, JSON.stringify(merged)).exec();
      if (!result) {
        throw new Error("Transaction conflict");
      }
    }, { maxRetries: 3, baseDelayMs: 100 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sync POST error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
