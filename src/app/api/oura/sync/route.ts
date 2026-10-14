import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { updateUserData } from "@/lib/userData";
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

    const syncedDates: string[] = [];
    const results: Record<string, unknown> = {};

    for (const date of datesToSync) {
      try {
        const ouraData = await fetchDailyData(userId, date);
        if (!ouraData) continue;

        syncedDates.push(date);
        results[date] = ouraData;
      } catch (err) {
        console.error(`Oura sync error for ${date}:`, err);
      }
    }

    if (syncedDates.length > 0) {
      // Re-read and merge only the Oura fields now, so a push that landed while
      // we awaited Oura is not overwritten.
      await updateUserData(userId, (existing) => {
        const recovery = (existing.recovery || {}) as Record<string, { date: string; oura?: object }>;
        for (const date of syncedDates) {
          const dayEntry = recovery[date] || { date };
          dayEntry.oura = { ...dayEntry.oura, ...(results[date] as object) };
          recovery[date] = dayEntry;
        }
        return { ...existing, recovery, updatedAt: Date.now() };
      });
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
