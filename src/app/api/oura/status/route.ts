import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTokens, isTokenExpired } from "@/lib/oauthTokens";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  const { success } = rateLimit(req, { limit: 60, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tokens = await getTokens(userId, "oura");
    if (!tokens) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: true,
      expired: isTokenExpired(tokens),
    });
  } catch (error) {
    console.error("Oura status error:", error);
    return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
  }
}
