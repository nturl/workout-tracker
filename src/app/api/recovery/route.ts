import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { auth } from "@clerk/nextjs/server";
import { recoveryActionSchema } from "@/lib/validators";
import { encryptPhone, decryptPhone, hashPhone, isEncrypted } from "@/lib/crypto";
import { checkCsrf, csrfResponse } from "@/lib/rateLimit";
import { sendNotification, generateTopic } from "@/lib/ntfy";

// GET: Fetch recovery data (user-scoped)
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const d = new Date();
    const date = searchParams.get("date") || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const redis = getRedis();
    const raw = await redis.get(`user:${userId}:recovery:${date}`);
    const entry = raw ? JSON.parse(raw) : null;

    // Also check legacy global key for backward compatibility
    if (!entry) {
      const legacyRaw = await redis.get(`recovery:${date}`);
      const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
      return NextResponse.json({ data: legacy });
    }

    return NextResponse.json({ data: entry });
  } catch (error) {
    console.error("Recovery fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch recovery data" }, { status: 500 });
  }
}

// POST: Handle notification setup and phone/topic management (user-scoped)
export async function POST(req: NextRequest) {
  try {
    if (!checkCsrf(req)) return csrfResponse();
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const parsed = recoveryActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const redis = getRedis();
    const action = parsed.data;

    // --- ntfy push notification actions ---

    if (action.action === "set-ntfy-topic") {
      await redis.set(`user:${userId}:ntfy-topic`, action.topic);
      return NextResponse.json({ success: true, topic: action.topic });
    }

    if (action.action === "get-ntfy-topic") {
      let topic = await redis.get(`user:${userId}:ntfy-topic`);
      if (!topic) {
        // Auto-generate a topic for the user
        topic = generateTopic(userId);
        await redis.set(`user:${userId}:ntfy-topic`, topic);
      }
      return NextResponse.json({ topic });
    }

    if (action.action === "test-ntfy") {
      const topic = await redis.get(`user:${userId}:ntfy-topic`);
      if (!topic) {
        return NextResponse.json({ error: "No notification topic configured" }, { status: 400 });
      }

      const result = await sendNotification(topic, "Boundless is connected! You'll get daily workout reminders here.", {
        title: "Workout Tracker Connected!",
        priority: 3,
        tags: ["white_check_mark", "athletic_shoe"],
      });

      if (!result.success) {
        console.error("test-ntfy: failed", result.error);
        return NextResponse.json({ error: "Failed to send notification", details: result.error }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: "Test notification sent!" });
    }

    // --- Legacy SMS/phone actions (kept for backward compat) ---

    if (action.action === "set-phone") {
      const phone = action.phone.replace(/\D/g, "");
      const formatted = phone.length === 10 ? `+1${phone}` : `+${phone}`;

      // Clean up old phone hash before storing new one
      const oldEncrypted = await redis.get(`user:${userId}:phone`);
      if (oldEncrypted && isEncrypted(oldEncrypted)) {
        try {
          const oldPhone = decryptPhone(oldEncrypted);
          const oldHash = hashPhone(oldPhone);
          await redis.del(`phone-hash:${oldHash}:userId`);
        } catch {
          // Old phone couldn't be decrypted, skip cleanup
        }
      }

      // Encrypt phone for storage, hash for reverse lookup
      const encrypted = encryptPhone(formatted);
      const hashed = hashPhone(formatted);
      await redis.set(`user:${userId}:phone`, encrypted);
      await redis.set(`phone-hash:${hashed}:userId`, userId);

      // Clean up old plaintext reverse mapping if it exists
      await redis.del(`phone:${formatted}:userId`);

      return NextResponse.json({ success: true, phone: formatted });
    }

    if (action.action === "get-phone") {
      let phone = await redis.get(`user:${userId}:phone`);
      if (phone && isEncrypted(phone)) {
        phone = decryptPhone(phone);
      } else if (phone) {
        // Auto-migrate plaintext to encrypted
        const encrypted = encryptPhone(phone);
        const hashed = hashPhone(phone);
        await redis.set(`user:${userId}:phone`, encrypted);
        await redis.set(`phone-hash:${hashed}:userId`, userId);
        await redis.del(`phone:${phone}:userId`);
      }
      if (!phone) phone = await redis.get("sms:user-phone");
      return NextResponse.json({ phone });
    }

    if (action.action === "get-completions") {
      const raw = await redis.get(`user:${userId}:sms-completions`);
      const completions = raw ? JSON.parse(raw) : [];
      return NextResponse.json({ completions });
    }

    if (action.action === "test-sms") {
      let userPhone = await redis.get(`user:${userId}:phone`);
      if (userPhone && isEncrypted(userPhone)) {
        userPhone = decryptPhone(userPhone);
      }
      if (!userPhone) userPhone = await redis.get("sms:user-phone");
      if (!userPhone) {
        return NextResponse.json({ error: "No phone configured" }, { status: 400 });
      }

      const twilioSid = process.env.TWILIO_ACCOUNT_SID?.trim();
      const twilioAuth = process.env.TWILIO_AUTH_TOKEN?.trim();
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER?.trim();

      if (!twilioSid || !twilioAuth || !twilioPhone) {
        return NextResponse.json({ error: "Twilio not configured on server" }, { status: 500 });
      }

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
      const response = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Authorization": "Basic " + Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: userPhone.startsWith("+") ? userPhone : `+1${userPhone.replace(/\D/g, "")}`,
          From: twilioPhone,
          Body: "Workout Tracker connected! You'll get daily reminders here.\n\nReply DONE after workouts, or forward your Eight Sleep texts for auto-tracking.\n\nReply HELP for all commands.",
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let details;
        try { details = JSON.parse(errText); } catch { details = errText; }
        return NextResponse.json({ error: "Twilio send failed", details }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: "Test SMS sent!" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Recovery API error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    if (message.includes("PHONE_ENCRYPTION_KEY")) {
      return NextResponse.json({ error: "Server encryption not configured. Contact admin." }, { status: 500 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
