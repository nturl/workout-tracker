import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { exchangeCodeForTokens } from "@/lib/oura";
import { storeTokens } from "@/lib/oauthTokens";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  if (error) {
    return NextResponse.redirect(`${appUrl}/?oura=error&reason=${error}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/?oura=error&reason=missing_params`);
  }

  try {
    // Validate state token from Redis
    const redis = getRedis();
    const userId = await redis.get(`oauth:state:${state}`);
    if (!userId) {
      return NextResponse.redirect(`${appUrl}/?oura=error&reason=invalid_state`);
    }

    // Delete state token (single-use)
    await redis.del(`oauth:state:${state}`);

    const tokens = await exchangeCodeForTokens(code);
    await storeTokens(userId, "oura", tokens);
    return NextResponse.redirect(`${appUrl}/?oura=connected`);
  } catch (error) {
    console.error("Oura OAuth callback error:", error);
    return NextResponse.redirect(`${appUrl}/?oura=error&reason=token_exchange`);
  }
}
