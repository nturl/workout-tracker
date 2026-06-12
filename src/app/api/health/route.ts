import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export async function GET() {
  const checks: Record<string, string> = {};
  let healthy = true;

  // Redis check
  try {
    const redis = getRedis();
    await redis.ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "error";
    healthy = false;
  }

  // Notification config check
  checks.notifications = process.env.CRON_SECRET ? "configured" : "not_configured";

  // Clerk config check
  checks.clerk = process.env.CLERK_SECRET_KEY ? "configured" : "not_configured";

  // AI scanning check
  checks.googleAI = process.env.GOOGLE_AI_API_KEY ? "configured" : "not_configured";

  return NextResponse.json({
    status: healthy ? "healthy" : "degraded",
    version: "8.0.0",
    uptime: process.uptime(),
    checks,
    timestamp: new Date().toISOString(),
  }, { status: healthy ? 200 : 503 });
}
