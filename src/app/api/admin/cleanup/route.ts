import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

function authorize(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

function extractUserId(key: string, prefix: string, suffix: string): string {
  return key.replace(prefix, "").replace(suffix, "");
}

// POST /api/admin/cleanup - Clean up orphaned Redis keys
// Removes user:*:data keys without an associated oauth:oura key,
// and cleans up legacy plaintext phone/recovery/completion/sms keys.
export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false; // default to dry run for safety

  const redis = getRedis();
  const results: { action: string; key: string; status: string }[] = [];

  async function collectKeys(pattern: string, action: string) {
    const keys = await redis.keys(pattern);
    for (const key of keys) {
      if (!dryRun) await redis.del(key);
      results.push({ action, key, status: dryRun ? "dry_run" : "deleted" });
    }
  }

  // Find active users (those with Oura connected)
  const ouraKeys = await redis.keys("user:*:oauth:oura");
  const activeUserIds = new Set(
    ouraKeys.map((k) => extractUserId(k, "user:", ":oauth:oura"))
  );

  // Find and clean orphaned users (have data but no Oura connection)
  const dataKeys = await redis.keys("user:*:data");
  const orphanedUserIds = dataKeys
    .map((k) => extractUserId(k, "user:", ":data"))
    .filter((id) => !activeUserIds.has(id));

  for (const userId of orphanedUserIds) {
    await collectKeys(`user:${userId}:*`, "delete_orphaned_user_key");
  }

  // Clean legacy key patterns (migrated to user-scoped equivalents)
  await collectKeys("phone:+*:userId", "delete_legacy_phone_key");
  await collectKeys("recovery:*", "delete_legacy_recovery_key");
  await collectKeys("completion:*", "delete_legacy_completion_key");
  await collectKeys("sms:*", "delete_legacy_sms_key");

  return NextResponse.json({
    dryRun,
    activeUserIds: [...activeUserIds],
    orphanedCount: results.filter((r) => r.action === "delete_orphaned_user_key").length,
    legacyCount: results.filter((r) => r.action !== "delete_orphaned_user_key").length,
    total: results.length,
    results,
  });
}

// GET /api/admin/cleanup - Report on Redis key health (no mutations)
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = getRedis();

  const [ouraKeys, dataKeys, phoneKeys, legacyPhoneKeys, legacyRecoveryKeys, legacyCompletionKeys, legacySmsKeys] =
    await Promise.all([
      redis.keys("user:*:oauth:oura"),
      redis.keys("user:*:data"),
      redis.keys("user:*:phone"),
      redis.keys("phone:+*:userId"),
      redis.keys("recovery:*"),
      redis.keys("completion:*"),
      redis.keys("sms:*"),
    ]);

  const activeUserIds = ouraKeys.map((k) => extractUserId(k, "user:", ":oauth:oura"));
  const allUserIds = dataKeys.map((k) => extractUserId(k, "user:", ":data"));
  const orphanedUserIds = allUserIds.filter((id) => !activeUserIds.includes(id));

  return NextResponse.json({
    activeUsers: activeUserIds,
    orphanedUsers: orphanedUserIds,
    keyBreakdown: {
      "user:*:data": dataKeys.length,
      "user:*:oauth:oura": ouraKeys.length,
      "user:*:phone": phoneKeys.length,
      "phone:+*:userId (legacy)": legacyPhoneKeys.length,
      "recovery:* (legacy)": legacyRecoveryKeys.length,
      "completion:* (legacy)": legacyCompletionKeys.length,
      "sms:* (legacy)": legacySmsKeys.length,
    },
    cleanupNeeded: orphanedUserIds.length > 0 || legacyPhoneKeys.length > 0 || legacyRecoveryKeys.length > 0,
  });
}
