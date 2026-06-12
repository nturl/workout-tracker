import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/redis";
import { getOuraAuthUrl } from "@/lib/oura";
import { randomBytes } from "crypto";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { success } = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OURA_CLIENT_ID || !process.env.OURA_CLIENT_SECRET) {
    return NextResponse.json({ error: "Oura OAuth not configured" }, { status: 500 });
  }

  try {
    // Generate CSRF state token, store in Redis with 5-min TTL
    const state = randomBytes(32).toString("hex");
    const redis = getRedis();
    await redis.set(`oauth:state:${state}`, userId, "EX", 300);

    const url = getOuraAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("OAuth authorize error:", error);
    return NextResponse.json({ error: "Failed to start OAuth flow" }, { status: 500 });
  }
}
