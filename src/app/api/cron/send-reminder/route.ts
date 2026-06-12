import { NextRequest, NextResponse } from "next/server";
import { sendPush, listSubscribedUsers, getPreferences, getPushConfigStatus } from "@/lib/webpush";
import {
  buildReminderPayload,
  localTimeParts,
  dateKeyInTimezone,
  DAY_NAMES,
  minutesSinceReminder,
} from "@/lib/reminderMessage";

interface SendResult {
  success: boolean;
  considered: number;
  eligible: number;
  sent: number;
  failed: number;
  errors: string[];
  details: Array<{ userId: string; reason: string }>;
}

/**
 * 15-min cron. Iterates all subscribed users, looks up their timezone-local
 * time + day, and sends a reminder if the current cron tick falls within 15
 * minutes AT OR AFTER their configured reminder time for today.
 *
 * The cron fires at :00, :15, :30, :45 UTC (see vercel.json). A user
 * configured for 07:07 local receives their push during the 07:15 tick.
 * Max worst-case delay is 14 minutes.
 */

async function sendReminders(options: { dryRun?: boolean; forceDay?: string } = {}): Promise<NextResponse> {
  const result: SendResult = {
    success: false,
    considered: 0,
    eligible: 0,
    sent: 0,
    failed: 0,
    errors: [],
    details: [],
  };

  try {
    const userIds = await listSubscribedUsers();
    result.considered = userIds.length;

    if (userIds.length === 0) {
      return NextResponse.json({ ...result, note: "No subscribed users" });
    }

    const now = new Date();
    const nowHour = now.getUTCHours();

    for (const userId of userIds) {
      try {
        const prefs = await getPreferences(userId);
        if (!prefs.reminders) {
          result.details.push({ userId: userId.slice(0, 8), reason: "reminders off" });
          continue;
        }

        const { day, hhmm } = localTimeParts(prefs.timezone, now);
        const dayName = (options.forceDay as typeof day) || day;
        const reminderTime = prefs.times[dayName] || "07:00";

        // Fire when this cron tick is 0-14 min after the configured time.
        const delta = minutesSinceReminder(reminderTime, hhmm);
        if (!(delta >= 0 && delta < 15) && !options.forceDay) {
          result.details.push({ userId: userId.slice(0, 8), reason: `not in 15-min window (local ${hhmm}, target ${reminderTime}, delta=${delta})` });
          continue;
        }

        result.eligible++;

        if (!DAY_NAMES.includes(dayName)) {
          result.details.push({ userId: userId.slice(0, 8), reason: `invalid day ${dayName}` });
          continue;
        }

        const dateKey = dateKeyInTimezone(prefs.timezone, now);
        const payload = await buildReminderPayload({ userId, dayName, dateKey });

        if (options.dryRun) {
          result.details.push({ userId: userId.slice(0, 8), reason: `would send: ${payload.title} — ${payload.body}` });
          continue;
        }

        const sendResult = await sendPush(userId, payload);
        result.sent += sendResult.sent;
        result.failed += sendResult.failed;
        if (sendResult.errors.length > 0) result.errors.push(...sendResult.errors);
        result.details.push({ userId: userId.slice(0, 8), reason: `sent=${sendResult.sent}, removed=${sendResult.removed}` });
      } catch (err) {
        result.errors.push(`${userId.slice(0, 8)}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    result.success = result.sent > 0 || options.dryRun === true;
    return NextResponse.json({ ...result, hourUTC: nowHour });
  } catch (error) {
    console.error("Send reminder error:", error);
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ ...result, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return sendReminders();
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const url = new URL(req.url);

  // ?debug=1 - config status, no auth
  if (url.searchParams.get("debug") === "1") {
    const users = await listSubscribedUsers();
    const vapidConfig = getPushConfigStatus();
    return NextResponse.json({
      status: "Reminder endpoint active (web push)",
      subscribedUsers: users.length,
      cronSecretConfigured: !!cronSecret,
      vapidKeysPresent: !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      vapidConfigOk: vapidConfig.ok,
      vapidConfigError: vapidConfig.error,
    });
  }

  // ?test=1 - dry run (no auth, doesn't send)
  if (url.searchParams.get("test") === "1") {
    const forceDay = url.searchParams.get("day") || undefined;
    return sendReminders({ dryRun: true, forceDay });
  }

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return sendReminders();
}
