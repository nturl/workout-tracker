import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/redis";
import { fetchDailyData } from "@/lib/oura";
import { getTokens } from "@/lib/oauthTokens";
import { rateLimit, rateLimitResponse, checkCsrf, csrfResponse } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return csrfResponse();
  const { success } = rateLimit(req, { limit: 60, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokens = await getTokens(userId, "oura");
  if (!tokens) {
    return NextResponse.json({ error: "Oura not connected" }, { status: 400 });
  }

  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    function dateKey(d: Date): string {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    const datesToSync = [dateKey(yesterday), dateKey(now)];
    const redis = getRedis();
    const existingRaw = await redis.get(`user:${userId}:data`);
    const existing = existingRaw ? JSON.parse(existingRaw) : {};
    const recovery = existing.recovery || {};

    const syncedDates: string[] = [];
    const results: Record<string, unknown> = {};

    for (const date of datesToSync) {
      try {
        const ouraData = await fetchDailyData(userId, date);
        if (!ouraData) continue;

        const dayEntry = recovery[date] || { date };
        dayEntry.oura = { ...dayEntry.oura, ...ouraData };
        recovery[date] = dayEntry;
        syncedDates.push(date);
        results[date] = ouraData;
      } catch (err) {
        console.error(`Oura sync error for ${date}:`, err);
      }
    }

    if (syncedDates.length > 0) {
      existing.recovery = recovery;
      existing.updatedAt = Date.now();
      await redis.set(`user:${userId}:data`, JSON.stringify(existing));
    }

    return NextResponse.json({
      synced: syncedDates.length > 0,
      dates: syncedDates,
      results,
    });
  } catch (error) {
    console.error("Oura sync error:", error);
    const message = error instanceof Error ? error.message : "Oura sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
