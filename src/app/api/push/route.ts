import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { checkCsrf, csrfResponse } from "@/lib/rateLimit";
import {
  saveSubscription,
  removeSubscription,
  getPreferences,
  savePreferences,
  sendPush,
  getSubscriptions,
  getPushConfigStatus,
  type PushSubscriptionJSON,
  type PushPreferences,
} from "@/lib/webpush";

interface SubscribeAction {
  action: "subscribe";
  subscription: PushSubscriptionJSON;
  timezone?: string;
}
interface UnsubscribeAction {
  action: "unsubscribe";
  endpoint: string;
}
interface GetPrefsAction {
  action: "get-prefs";
}
interface SetPrefsAction {
  action: "set-prefs";
  prefs: Partial<PushPreferences>;
}
interface TestAction {
  action: "test";
}
interface StatusAction {
  action: "status";
}

type PushAction =
  | SubscribeAction
  | UnsubscribeAction
  | GetPrefsAction
  | SetPrefsAction
  | TestAction
  | StatusAction;

function isValidSubscription(s: unknown): s is PushSubscriptionJSON {
  if (!s || typeof s !== "object") return false;
  const sub = s as Record<string, unknown>;
  if (typeof sub.endpoint !== "string" || !sub.endpoint.startsWith("https://")) return false;
  const keys = sub.keys as Record<string, unknown> | undefined;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return false;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    if (!checkCsrf(req)) return csrfResponse();
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as PushAction;

    switch (body.action) {
      case "subscribe": {
        if (!isValidSubscription(body.subscription)) {
          return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
        }
        await saveSubscription(userId, body.subscription);
        if (body.timezone && typeof body.timezone === "string" && body.timezone.length < 64) {
          await savePreferences(userId, { timezone: body.timezone });
        }
        return NextResponse.json({ success: true });
      }

      case "unsubscribe": {
        if (typeof body.endpoint !== "string") {
          return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
        }
        await removeSubscription(userId, body.endpoint);
        return NextResponse.json({ success: true });
      }

      case "get-prefs": {
        const prefs = await getPreferences(userId);
        const subs = await getSubscriptions(userId);
        return NextResponse.json({ prefs, subscribed: subs.length > 0, deviceCount: subs.length });
      }

      case "set-prefs": {
        if (!body.prefs || typeof body.prefs !== "object") {
          return NextResponse.json({ error: "Missing prefs" }, { status: 400 });
        }
        const saved = await savePreferences(userId, body.prefs);
        return NextResponse.json({ success: true, prefs: saved });
      }

      case "test": {
        const result = await sendPush(userId, {
          title: "Workout Tracker",
          body: "Push notifications are working. You'll get reminders like this.",
          tag: "test",
          url: process.env.NEXT_PUBLIC_APP_URL || "/",
          requireInteraction: false,
        });
        return NextResponse.json({
          success: result.sent > 0,
          sent: result.sent,
          failed: result.failed,
          removed: result.removed,
          errors: result.errors,
        });
      }

      case "status": {
        const subs = await getSubscriptions(userId);
        const config = getPushConfigStatus();
        return NextResponse.json({
          subscribed: subs.length > 0,
          deviceCount: subs.length,
          vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null,
          vapidConfigOk: config.ok,
          vapidConfigError: config.error,
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("Push route error:", { message, stack });
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}
