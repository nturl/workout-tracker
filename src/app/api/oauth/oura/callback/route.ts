import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
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

    // Bind the state to the user who started the flow. No session is allowed:
    // the redirect back can land in a browser without the Clerk cookie (an iOS
    // standalone PWA hands OAuth off to Safari), and the state is single-use,
    // random and 5-min. A session for someone else is rejected.
    const { userId: sessionUserId } = await auth();
    if (sessionUserId && sessionUserId !== userId) {
      return NextResponse.redirect(`${appUrl}/?oura=error&reason=state_mismatch`);
    }

    const tokens = await exchangeCodeForTokens(code);
    await storeTokens(userId, "oura", tokens);
    return NextResponse.redirect(`${appUrl}/?oura=connected`);
  } catch (error) {
    console.error("Oura OAuth callback error:", error);
    return NextResponse.redirect(`${appUrl}/?oura=error&reason=token_exchange`);
  }
}
