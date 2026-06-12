import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { deleteTokens } from "@/lib/oauthTokens";
import { rateLimit, rateLimitResponse, checkCsrf, csrfResponse } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return csrfResponse();
  const { success } = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await deleteTokens(userId, "oura");
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    console.error("Oura disconnect error:", error);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
