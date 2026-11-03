import { NextResponse, type NextRequest } from "next/server";

// This is a one-person app, but Clerk sign-up is open on its instance, so a
// signed-in session alone proves nothing: a stranger could make an account
// and run the AI routes on the Anthropic key (or the Twilio test SMS).
// ALLOWED_USER_IDS is a comma-separated list of Clerk user ids (user_...).
// Unset or empty means no signed-in user is allowed (fail closed).
export function isAllowedUser(userId: string, raw: string | undefined = process.env.ALLOWED_USER_IDS): boolean {
  if (!raw) return false;
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(userId);
}

// Returns a 403 for a signed-in user who is not on the allowlist, or null to
// let the request through. Signed-out requests (cron, Twilio webhook, the
// sign-in page) are left to the existing auth handling.
export function denyIfNotAllowed(
  userId: string | null,
  req: NextRequest,
  raw: string | undefined = process.env.ALLOWED_USER_IDS,
): NextResponse | null {
  if (!userId || isAllowedUser(userId, raw)) return null;
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return new NextResponse("This app is private.", { status: 403 });
}
