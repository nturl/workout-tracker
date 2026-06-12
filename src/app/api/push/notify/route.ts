/**
 * Authenticated endpoint for the client to trigger self-push on meaningful
 * events: session complete, week complete, streak milestone, "don't break it"
 * nudges. The server owns the copy so we can tune messages without shipping
 * new client code.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { checkCsrf, csrfResponse } from "@/lib/rateLimit";
import { sendPush, getPreferences, type PushPayload } from "@/lib/webpush";

type NotifyEvent =
  | { kind: "session-complete"; sessionTitle: string }
  | { kind: "week-complete"; weekLabel?: string }
  | { kind: "streak-milestone"; days: number }
  | { kind: "streak-nudge"; streak: number };

function buildPayload(event: NotifyEvent): { payload: PushPayload; category: "completions" | "streakAlerts" } {
  const url = process.env.NEXT_PUBLIC_APP_URL || "/";
  switch (event.kind) {
    case "session-complete":
      return {
        category: "completions",
        payload: {
          title: "✓ Session complete",
          body: `${event.sessionTitle} logged. Nice work.`,
          tag: `session-${Date.now()}`,
          url,
        },
      };
    case "week-complete":
      return {
        category: "completions",
        payload: {
          title: "🏆 Week complete",
          body: `Every session done${event.weekLabel ? ` for ${event.weekLabel}` : ""}. Huge.`,
          tag: `week-${event.weekLabel || Date.now()}`,
          url,
          requireInteraction: true,
        },
      };
    case "streak-milestone":
      return {
        category: "streakAlerts",
        payload: {
          title: `🔥 ${event.days}-day streak`,
          body: `${event.days} days in a row. Keep it going.`,
          tag: `streak-${event.days}`,
          url,
          requireInteraction: true,
        },
      };
    case "streak-nudge":
      return {
        category: "streakAlerts",
        payload: {
          title: `🔥 Don't break it`,
          body: `Your ${event.streak}-day streak needs today's session.`,
          tag: "streak-nudge",
          url,
        },
      };
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!checkCsrf(req)) return csrfResponse();
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as NotifyEvent;
    if (!body || typeof body !== "object" || !("kind" in body)) {
      return NextResponse.json({ error: "Missing kind" }, { status: 400 });
    }

    const { payload, category } = buildPayload(body);
    const prefs = await getPreferences(userId);
    if (category === "completions" && !prefs.completions) {
      return NextResponse.json({ success: true, skipped: "completions disabled" });
    }
    if (category === "streakAlerts" && !prefs.streakAlerts) {
      return NextResponse.json({ success: true, skipped: "streakAlerts disabled" });
    }

    const result = await sendPush(userId, payload);
    return NextResponse.json({ success: result.sent > 0, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("Push notify error:", { message, stack });
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}
