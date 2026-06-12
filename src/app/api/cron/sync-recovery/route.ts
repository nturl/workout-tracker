import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { fetchDailyData } from "@/lib/oura";
import { getTokens } from "@/lib/oauthTokens";

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function syncAllUsers(): Promise<NextResponse> {
  const redis = getRedis();
  const ouraKeys = await redis.keys("user:*:oauth:oura");
  const results: { userId: string; synced: string[]; errors: string[] }[] = [];

  // Sync today AND yesterday - Oura often finalizes last night's data hours later
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const datesToSync = [dateKey(yesterday), dateKey(now)];

  for (const key of ouraKeys) {
    const userId = key.replace("user:", "").replace(":oauth:oura", "");
    const userResult: { userId: string; synced: string[]; errors: string[] } = { userId, synced: [], errors: [] };

    try {
      const tokens = await getTokens(userId, "oura");
      if (!tokens) {
        userResult.errors.push("No tokens");
        results.push(userResult);
        continue;
      }

      const existingRaw = await redis.get(`user:${userId}:data`);
      const existing = existingRaw ? JSON.parse(existingRaw) : {};
      const recovery = existing.recovery || {};

      for (const date of datesToSync) {
        try {
          const ouraData = await fetchDailyData(userId, date);
          if (!ouraData) {
            userResult.errors.push(`${date}: No data`);
            continue;
          }

          const dayEntry = recovery[date] || { date };
          dayEntry.oura = { ...dayEntry.oura, ...ouraData };
          recovery[date] = dayEntry;
          userResult.synced.push(date);
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown";
          userResult.errors.push(`${date}: ${msg}`);
        }
      }

      if (userResult.synced.length > 0) {
        existing.recovery = recovery;
        existing.updatedAt = Date.now();
        existing.ouraLastSynced = new Date().toISOString();
        await redis.set(`user:${userId}:data`, JSON.stringify(existing));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Cron sync failed for ${userId}:`, message);
      userResult.errors.push(message);
    }

    results.push(userResult);
  }

  return NextResponse.json({
    success: true,
    dates: datesToSync,
    users: results.length,
    synced: results.filter((r) => r.synced.length > 0).length,
    results,
  });
}

// GET handler - used by Vercel cron (crons send GET, not POST)
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return syncAllUsers();
}

// POST handler - manual trigger
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return syncAllUsers();
}
