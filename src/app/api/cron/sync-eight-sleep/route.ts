import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { parseEightSleepSMS } from "@/lib/twilioParser";

interface ImportEntry {
  date: string;
  text: string;
}

async function importEightSleepData(entries: ImportEntry[]): Promise<NextResponse> {
  const redis = getRedis();
  const results: { date: string; status: string; metrics?: Record<string, unknown> }[] = [];

  // Find the active user - prefer the one with Oura connected (indicates real user)
  const ouraKeys = await redis.keys("user:*:oauth:oura");
  let userId: string;
  if (ouraKeys.length > 0) {
    userId = ouraKeys[0].replace("user:", "").replace(":oauth:oura", "");
  } else {
    const userKeys = await redis.keys("user:*:data");
    if (userKeys.length === 0) {
      return NextResponse.json({ error: "No users found" }, { status: 400 });
    }
    userId = userKeys[0].replace("user:", "").replace(":data", "");
  }
  const existingRaw = await redis.get(`user:${userId}:data`);
  const existing = existingRaw ? JSON.parse(existingRaw) : {};
  const recovery = existing.recovery || {};

  for (const entry of entries) {
    const parsed = parseEightSleepSMS(entry.text);
    if (!parsed) {
      results.push({ date: entry.date, status: "no_metrics_found" });
      continue;
    }

    const dayEntry = recovery[entry.date] || { date: entry.date };
    dayEntry.eightSleep = {
      ...dayEntry.eightSleep,
      ...parsed,
      autoImported: true,
      importedAt: new Date().toISOString(),
    };
    recovery[entry.date] = dayEntry;
    results.push({ date: entry.date, status: "imported", metrics: parsed as unknown as Record<string, unknown> });
  }

  const importedCount = results.filter((r) => r.status === "imported").length;
  if (importedCount > 0) {
    existing.recovery = recovery;
    existing.updatedAt = Date.now();
    existing.eightSleepLastSynced = new Date().toISOString();
    await redis.set(`user:${userId}:data`, JSON.stringify(existing));
  }

  return NextResponse.json({
    success: true,
    imported: importedCount,
    total: entries.length,
    results,
  });
}

// POST handler - accepts array of {date, text} entries
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const entries = body.entries as ImportEntry[];
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: "entries array required" }, { status: 400 });
    }

    return importEightSleepData(entries);
  } catch (error) {
    console.error("Eight Sleep import error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// GET handler - staleness check (used by Vercel cron to monitor Eight Sleep sync health)
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = getRedis();

  // Find the active user - prefer the one with Oura connected
  const ouraKeys = await redis.keys("user:*:oauth:oura");
  let userId: string;
  if (ouraKeys.length > 0) {
    userId = ouraKeys[0].replace("user:", "").replace(":oauth:oura", "");
  } else {
    const userKeys = await redis.keys("user:*:data");
    if (userKeys.length === 0) {
      return NextResponse.json({ status: "no_users", stale: false });
    }
    userId = userKeys[0].replace("user:", "").replace(":data", "");
  }

  const raw = await redis.get(`user:${userId}:data`);
  const data = raw ? JSON.parse(raw) : {};
  const lastSynced = data.eightSleepLastSynced || null;
  const staleMs = lastSynced ? Date.now() - new Date(lastSynced).getTime() : null;
  const stale = !lastSynced || (staleMs !== null && staleMs > 48 * 60 * 60 * 1000); // stale if >48h

  return NextResponse.json({
    status: "Eight Sleep import endpoint active",
    lastSynced,
    stale,
    staleHours: staleMs !== null ? Math.round(staleMs / 3600_000) : null,
  });
}
