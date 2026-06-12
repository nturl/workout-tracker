import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { parseEightSleepSMS, parseWorkoutDone } from "@/lib/twilioParser";
import twilio from "twilio";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { hashPhone } from "@/lib/crypto";

// Validate Twilio webhook signature
function validateTwilioRequest(req: NextRequest, body: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false; // Reject if no auth token configured

  const signature = req.headers.get("x-twilio-signature");
  if (!signature) return false;

  // Parse form body into params object
  const params: Record<string, string> = {};
  new URLSearchParams(body).forEach((value, key) => {
    params[key] = value;
  });

  const url = req.url;
  return twilio.validateRequest(authToken, signature, url, params);
}

function twimlResponse(message: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${message}</Message>
</Response>`;
  return new NextResponse(xml, { headers: { "Content-Type": "text/xml" } });
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function kvGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  const raw = await redis.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const redis = getRedis();
  await redis.set(key, JSON.stringify(value));
}

// Find userId by phone number (check hashed key first, then legacy plaintext)
async function findUserByPhone(phone: string): Promise<string | null> {
  const normalized = phone.replace(/\D/g, "");
  const formatted = normalized.length === 10 ? `+1${normalized}` : `+${normalized}`;
  const redis = getRedis();
  const hashed = hashPhone(formatted);
  const userId = await redis.get(`phone-hash:${hashed}:userId`);
  if (userId) return userId;
  // Fallback to legacy plaintext mapping
  return await redis.get(`phone:${formatted}:userId`);
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  try {
    const rawBody = await req.text();

    // Validate Twilio signature in production
    if (process.env.NODE_ENV === "production") {
      if (!validateTwilioRequest(req, rawBody)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const formData = new URLSearchParams(rawBody);
    const body = formData.get("Body") || "";
    const from = formData.get("From") || "";

    // Find the user associated with this phone number
    const userId = await findUserByPhone(from);

    // Try parsing as Eight Sleep data
    const eightSleepData = parseEightSleepSMS(body);
    if (eightSleepData) {
      const today = todayKey();
      const recoveryKey = userId ? `user:${userId}:recovery:${today}` : `recovery:${today}`;
      const existingEntry = await kvGet<Record<string, unknown>>(recoveryKey) || {};

      const updatedEntry = {
        ...existingEntry,
        date: today,
        eightSleep: {
          ...(existingEntry.eightSleep as Record<string, unknown> || {}),
          ...eightSleepData,
          autoImported: true,
          importedAt: new Date().toISOString(),
        },
      };

      await kvSet(recoveryKey, updatedEntry);

      const parts: string[] = [];
      if (eightSleepData.sleepFitnessScore) parts.push(`Score: ${eightSleepData.sleepFitnessScore}`);
      if (eightSleepData.hrv) parts.push(`HRV: ${eightSleepData.hrv}ms`);
      if (eightSleepData.rhr) parts.push(`RHR: ${eightSleepData.rhr}`);

      const emoji = (eightSleepData.sleepFitnessScore || 0) >= 85 ? "\u{1F7E2}" :
                    (eightSleepData.sleepFitnessScore || 0) >= 70 ? "\u{1F7E1}" : "\u{1F534}";

      return twimlResponse(`${emoji} Eight Sleep data logged!\n${parts.join(" | ")}\n\nOpen your tracker to see recovery recommendations.`);
    }

    // Try parsing as "DONE" command
    const doneCmd = parseWorkoutDone(body);
    if (doneCmd) {
      const today = todayKey();
      const dayName = doneCmd.dayName || DAYS[new Date().getDay()];

      const completionKey = userId ? `user:${userId}:completion:${today}:${dayName}` : `completion:${today}:${dayName}`;
      await kvSet(completionKey, {
        completedAt: new Date().toISOString(),
        notes: doneCmd.notes,
        viaSMS: true,
      });

      const listKey = userId ? `user:${userId}:sms-completions` : "sms:completions";
      const smsCompletions = await kvGet<Array<Record<string, unknown>>>(listKey) || [];
      smsCompletions.push({
        date: today,
        dayName,
        notes: doneCmd.notes,
        completedAt: new Date().toISOString(),
      });
      if (smsCompletions.length > 30) smsCompletions.splice(0, smsCompletions.length - 30);
      await kvSet(listKey, smsCompletions);

      return twimlResponse(`\u{1F4AA} ${dayName}'s workout marked as done!${doneCmd.notes ? `\nNotes: ${doneCmd.notes}` : ""}\n\nKeep it up! \u{1F525}`);
    }

    if (body.trim().toLowerCase() === "help" || body.trim() === "?") {
      return twimlResponse(
        `Workout Tracker Commands:\n\n` +
        `DONE \u2014 Log today's workout as complete\n` +
        `DONE Monday \u2014 Log a specific day\n` +
        `DONE felt great \u2014 Add notes\n` +
        `STATUS \u2014 Get your weekly progress\n\n` +
        `Eight Sleep texts are auto-parsed!`
      );
    }

    if (body.trim().toLowerCase() === "status") {
      const listKey = userId ? `user:${userId}:sms-completions` : "sms:completions";
      const completions = await kvGet<Array<Record<string, unknown>>>(listKey) || [];
      const thisWeek = completions.filter(
        (c) => c.date && new Date(c.date as string) >= new Date(Date.now() - 7 * 86400000)
      );

      let msg = `\u{1F4CA} Weekly Status\nWorkouts logged via SMS: ${thisWeek.length}`;
      msg += `\n\nOpen your tracker for full details.`;
      return twimlResponse(msg);
    }

    return twimlResponse(
      `I didn't understand that. Reply HELP for available commands, or forward your Eight Sleep text here to auto-log it.`
    );
  } catch (error) {
    console.error("Twilio webhook error:", error);
    return twimlResponse("Something went wrong. Please try again.");
  }
}

export async function GET() {
  return NextResponse.json({ status: "Twilio webhook active" });
}
