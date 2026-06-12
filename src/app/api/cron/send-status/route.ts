import { NextRequest, NextResponse } from "next/server";
import { sendPush, listSubscribedUsers, getPreferences, getPushConfigStatus } from "@/lib/webpush";
import {
  buildStatusPayload,
  localTimeParts,
  dateKeyInTimezone,
  DAY_NAMES,
  minutesSinceReminder,
  type Checkpoint,
} from "@/lib/reminderMessage";

// Local-time targets for the two daily check-ins.
const CHECKPOINT_TIMES: Record<Checkpoint, string> = {
  afternoon: "14:00",
  evening: "18:00",
};

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
 * 15-min cron companion to send-reminder. For each subscribed user it looks up
 * their timezone-local time and sends an activity status check-in when the tick
 * falls within 15 minutes at/after 14:00 (afternoon) or 18:00 (evening) local.
 * Gated by the user's `completions` push preference.
 */
async function sendStatusUpdates(
  options: { dryRun?: boolean; forceCheckpoint?: Checkpoint; forceDay?: string } = {},
): Promise<NextResponse> {
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

    for (const userId of userIds) {
      try {
        const prefs = await getPreferences(userId);
        if (!prefs.completions) {
          result.details.push({ userId: userId.slice(0, 8), reason: "completion alerts off" });
          continue;
        }

        const { day, hhmm } = localTimeParts(prefs.timezone, now);
        const dayName = (options.forceDay as typeof day) || day;
        if (!DAY_NAMES.includes(dayName)) {
          result.details.push({ userId: userId.slice(0, 8), reason: `invalid day ${dayName}` });
          continue;
        }

        const checkpoints: Checkpoint[] = options.forceCheckpoint
          ? [options.forceCheckpoint]
          : (Object.keys(CHECKPOINT_TIMES) as Checkpoint[]).filter((cp) => {
              const delta = minutesSinceReminder(CHECKPOINT_TIMES[cp], hhmm);
              return delta >= 0 && delta < 15;
            });

        if (checkpoints.length === 0) {
          result.details.push({ userId: userId.slice(0, 8), reason: `no check-in window (local ${hhmm})` });
          continue;
        }

        const dateKey = dateKeyInTimezone(prefs.timezone, now);

        for (const checkpoint of checkpoints) {
          result.eligible++;
          const payload = await buildStatusPayload({ userId, dayName, dateKey, checkpoint });

          if (options.dryRun) {
            result.details.push({ userId: userId.slice(0, 8), reason: `would send: ${payload.title} — ${payload.body}` });
            continue;
          }

          const sendResult = await sendPush(userId, payload);
          result.sent += sendResult.sent;
          result.failed += sendResult.failed;
          if (sendResult.errors.length > 0) result.errors.push(...sendResult.errors);
          result.details.push({ userId: userId.slice(0, 8), reason: `${checkpoint}: sent=${sendResult.sent}, removed=${sendResult.removed}` });
        }
      } catch (err) {
        result.errors.push(`${userId.slice(0, 8)}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    result.success = result.sent > 0 || options.dryRun === true;
    return NextResponse.json(result);
  } catch (error) {
    console.error("Send status error:", error);
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
  return sendStatusUpdates();
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
      status: "Status check-in endpoint active (web push)",
      subscribedUsers: users.length,
      cronSecretConfigured: !!cronSecret,
      vapidConfigOk: vapidConfig.ok,
      vapidConfigError: vapidConfig.error,
      checkpoints: CHECKPOINT_TIMES,
    });
  }

  // ?test=1 - dry run (no auth, doesn't send). Optional ?checkpoint= and ?day= to force.
  if (url.searchParams.get("test") === "1") {
    const forceDay = url.searchParams.get("day") || undefined;
    const cp = url.searchParams.get("checkpoint");
    const forceCheckpoint = cp === "afternoon" || cp === "evening" ? cp : undefined;
    return sendStatusUpdates({ dryRun: true, forceCheckpoint, forceDay });
  }

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authenticated manual trigger: ?checkpoint=afternoon|evening forces an
  // immediate real send, bypassing the time window. Plain GET (the cron) stays
  // window-gated.
  const cp = url.searchParams.get("checkpoint");
  const forceCheckpoint = cp === "afternoon" || cp === "evening" ? cp : undefined;
  const forceDay = url.searchParams.get("day") || undefined;
  return sendStatusUpdates({ forceCheckpoint, forceDay });
}
