import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/redis";
import { rateLimit, rateLimitResponse, checkCsrf, csrfResponse } from "@/lib/rateLimit";
import { getAllReadings } from "@/lib/biomarkerStore";
import { getBiomarkerById, CATEGORY_LABELS } from "@/lib/biomarkerData";
import { weekKey, getWeekProgress } from "@/lib/helpers";
import { z } from "zod";

export const maxDuration = 60;

const biomarkerContextSchema = z.object({
  biomarkerId: z.string(),
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  status: z.string(),
  optimalRange: z.string().optional(),
  standardRange: z.string().optional(),
}).optional();

const goalContextSchema = z.object({
  title: z.string(),
  summary: z.string(),
  biomarkers: z.array(z.string()),
}).optional();

const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(historyMessageSchema).max(20).optional(),
  biomarkerContext: biomarkerContextSchema,
  goalContext: goalContextSchema,
});

const TZ = "America/New_York";

// Today's date and weekday in the user's timezone (the server runs in UTC).
function todayInNewYork(now: Date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long",
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    // Local-time Date carrying the New York calendar day, for weekKey()
    localDate: new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  };
}

// Drop base64 screenshots (Recovery tab uploads) before the entry goes in a prompt.
function stripScreenshots(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripScreenshots);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => k !== "screenshotDataUrl")
        .map(([k, v]) => [k, stripScreenshots(v)]),
    );
  }
  return value;
}

function buildSystemPrompt(userData: Record<string, unknown> | null): string {
  const level = userData?.level || "beginner";
  const completions = userData?.completions || {};
  const recovery = userData?.recovery || {};

  const today = todayInNewYork();

  // This week's completions (completion keys are `${weekKey}:${day}:${slug}`)
  const thisWeek = weekKey(today.localDate);
  const { done: completedCount, total: totalSessions } = getWeekProgress(
    completions as Record<string, boolean>,
    thisWeek,
  );

  // Get latest recovery data (keys are dates; insertion order is not date order)
  const recoveryMap = recovery as Record<string, unknown>;
  const recoveryDates = Object.keys(recoveryMap).sort();
  const latestKey = recoveryDates[recoveryDates.length - 1];
  const latestRecovery = latestKey ? recoveryMap[latestKey] : null;

  return `You are a friendly, knowledgeable workout coach for the Workout Tracker app. Your name is Coach.

The user follows a structured 7-day training program:
- Sunday/Thursday: Super-Slow Strength (progressive overload); Sunday 5:00-5:45 PM ET, Thursday 7:45-8:30 AM ET
- Monday: Conditioning (Functional Fitness 7-min circuit + Mitochondrial intervals), 7:45-8:30 AM ET
- Tuesday: Recovery (Detox + Brain Training), 7:45-8:30 AM ET
- Wednesday: Sauna/Cold + Tabata (VO2 Max bi-weekly), 7:45-8:30 AM ET
- Friday: Outdoor Adventure / optional Tabata, no set time
- Saturday: Social Sport + Brain Training, no set time
- Every day starts with Egoscue E-cises (posture). Meditation is tracked as a daily habit, not a session.

Today is ${today.weekday}, ${today.iso} (America/New_York).
User's current level: ${level}
Sessions completed this week: ${completedCount}/${totalSessions}
${latestRecovery ? `Latest recovery data (${latestKey}): ${JSON.stringify(stripScreenshots(latestRecovery))}` : "No recovery data logged yet."}

Response style - SMART BREVITY:
- Lead with the single most important point (a bold headline sentence).
- Keep total length 3-6 short sentences unless the user asks for more.
- Use short bullets with a bold lead-in when listing (e.g. "**Sleep:** 7+ hours"). 2-4 bullets max.
- Write like you're texting a friend who's smart and busy. No fluff, no hedging, no disclaimers.
- Cite the user's actual numbers when relevant. Never invent data.
- No markdown headers (no ##). Bold (**word**) is fine for emphasis.
- End with one concrete next step when useful. Skip "let me know if..." style closers.

Tone:
- Encouraging but honest. No guilt-tripping about missed sessions.
- Specific to the user's program when relevant.
- If they ask about a biomarker, explain briefly then pivot to what they can do about it.`;
}

/**
 * Build a compact health snapshot from the user's latest lab readings + recovery data.
 * Sent on every chat request so Coach has baseline context regardless of how the chat was opened.
 */
function buildHealthSnapshot(
  allReadings: Record<string, import("@/types/biomarker").BiomarkerReading[]>,
  userData: Record<string, unknown> | null,
): string | null {
  const markerIds = Object.keys(allReadings);
  if (markerIds.length === 0) return null;

  // Group flagged markers by category, capture latest value
  const flagged: Array<{ name: string; value: number; unit: string; status: string; category: string }> = [];
  const byCategory: Record<string, number> = {};

  for (const id of markerIds) {
    const readings = allReadings[id];
    if (!readings?.length) continue;
    const meta = getBiomarkerById(id);
    if (!meta) continue;
    const latest = readings[readings.length - 1];
    byCategory[meta.category] = (byCategory[meta.category] ?? 0) + 1;
    if (latest.status === "out_of_range" || latest.status === "attention") {
      flagged.push({
        name: meta.shortName ?? meta.name,
        value: latest.value,
        unit: latest.unit,
        status: latest.status,
        category: CATEGORY_LABELS[meta.category] ?? meta.category,
      });
    }
  }

  // Latest recovery snapshot
  const recovery = (userData?.recovery ?? {}) as Record<string, unknown>;
  const recoveryDates = Object.keys(recovery).sort();
  const latestRecoveryKey = recoveryDates[recoveryDates.length - 1];
  const latestRecovery = latestRecoveryKey ? recovery[latestRecoveryKey] : null;

  const lines: string[] = [];
  lines.push(`USER HEALTH CONTEXT (reference when answering):`);
  lines.push(`- ${markerIds.length} biomarkers tracked across ${Object.keys(byCategory).length} categories.`);

  if (flagged.length > 0) {
    const flaggedLines = flagged
      .slice(0, 12)
      .map((m) => `  - ${m.name}: ${m.value} ${m.unit} (${m.status}, ${m.category})`)
      .join("\n");
    lines.push(`- Flagged markers needing attention:\n${flaggedLines}`);
  } else {
    lines.push(`- All markers are within normal or optimal range.`);
  }

  if (latestRecovery && typeof latestRecovery === "object") {
    const r = latestRecovery as Record<string, unknown>;
    const parts: string[] = [];
    const oura = r.oura as Record<string, unknown> | undefined;
    const es = r.eightSleep as Record<string, unknown> | undefined;
    if (oura?.readinessScore) parts.push(`Oura readiness ${oura.readinessScore}`);
    if (oura?.hrv) parts.push(`HRV ${oura.hrv}ms`);
    if (oura?.rhr) parts.push(`RHR ${oura.rhr}bpm`);
    if (es?.sleepFitnessScore) parts.push(`Eight Sleep ${es.sleepFitnessScore}`);
    if (parts.length) {
      lines.push(`- Latest recovery (${latestRecoveryKey}): ${parts.join(", ")}.`);
    }
  }

  lines.push(
    `\nUse this data silently. Only cite specific numbers when the user's question touches them. Never dump the full list.`,
  );

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return csrfResponse();
  const { success } = rateLimit(req, { limit: 20, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }

    // Fetch user's workout data + biomarker snapshot in parallel
    const redis = getRedis();
    const [raw, allReadings] = await Promise.all([
      redis.get(`user:${userId}:data`),
      getAllReadings(userId).catch(() => ({} as Record<string, import("@/types/biomarker").BiomarkerReading[]>)),
    ]);
    const userData = raw ? JSON.parse(raw) : null;

    let systemPrompt = buildSystemPrompt(userData);

    // Always inject a compact health snapshot so Coach has context for any question
    const healthSnapshot = buildHealthSnapshot(allReadings, userData);
    if (healthSnapshot) {
      systemPrompt += `\n\n${healthSnapshot}`;
    }

    // Inject biomarker context if present
    const bc = parsed.data.biomarkerContext;
    if (bc) {
      systemPrompt += `\n\nThe user is asking about a specific biomarker from their lab results:
- Biomarker: ${bc.name} (${bc.biomarkerId})
- Latest value: ${bc.value} ${bc.unit}
- Status: ${bc.status}
${bc.optimalRange ? `- Optimal range: ${bc.optimalRange} ${bc.unit}` : ""}
${bc.standardRange ? `- Standard range: ${bc.standardRange} ${bc.unit}` : ""}

Provide personalized, actionable advice based on their specific reading. Reference their actual value and what it means for their health. Be specific about lifestyle changes, supplements, or follow-up tests that could help.`;
    }

    // Inject goal context if present
    const gc = parsed.data.goalContext;
    if (gc) {
      systemPrompt += `\n\nThe user is asking about a health protocol goal from their personalized health analysis:
- Goal: ${gc.title}
- Summary: ${gc.summary}
- Related biomarkers: ${gc.biomarkers.join(", ")}

Provide detailed, personalized advice about this specific health goal. Be specific about actionable steps, supplements, lifestyle changes, or follow-up tests. Reference the related biomarkers and explain how they connect to this goal.`;
    }

    // Build conversation: prior history + current user message
    const history = parsed.data.history ?? [];
    const conversation = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: parsed.data.message },
    ];

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const result = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: conversation,
    });

    const text = result.content[0].type === "text" ? result.content[0].text : "";

    return NextResponse.json({ reply: text || "I couldn't generate a response." });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Chat error:", error);
    console.error("Full error:", msg);
    return NextResponse.json({ error: "Coach is unavailable right now. Try again in a moment." }, { status: 500 });
  }
}
