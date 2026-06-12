import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, rateLimitResponse, checkCsrf, csrfResponse } from "@/lib/rateLimit";
import { extractMetricsSchema } from "@/lib/validators";

export const maxDuration = 60;

const EIGHT_SLEEP_PROMPT = `Extract metrics from this Eight Sleep app screenshot. Return ONLY valid JSON with these fields (use null for any not visible):
{
  "sleepFitnessScore": <number 0-100>,
  "hrv": <number in ms>,
  "rhr": <number in bpm>,
  "deepSleepPct": <number 0-100>,
  "remSleepPct": <number 0-100>,
  "timeSlept": "<string like 7h 32m>"
}`;

const OURA_PROMPT = `Extract metrics from this Oura Ring app screenshot. Return ONLY valid JSON with these fields (use null for any not visible):
{
  "readinessScore": <number 0-100>,
  "sleepScore": <number 0-100>,
  "totalSleep": "<string like 8h 21m>",
  "efficiency": <number 0-100>,
  "restfulness": "<Optimal|Good|Pay attention or null>",
  "remSleep": "<string like 2h 46m>",
  "remSleepPct": <number 0-100>,
  "deepSleep": "<string like 1h 32m>",
  "deepSleepPct": <number 0-100>,
  "lightSleep": "<string like 3h 45m>",
  "lightSleepPct": <number 0-100>,
  "awakeTime": "<string like 0h 32m>",
  "timeInBed": "<string like 9h 10m>",
  "latency": <number in minutes>,
  "timing": "<Optimal|Good|Pay attention or null>",
  "hrv": <number in ms>,
  "rhr": <number in bpm>,
  "averageHR": <number in bpm>,
  "bodyTemp": <number in Celsius like -0.5>,
  "respiratoryRate": <number in breaths/min like 15.2>,
  "spo2": <number 0-100>
}`;

export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return csrfResponse();
  const { success } = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  try {
    // Validate input before checking server config: a bad request is 400
    // regardless of whether the API key is present.
    const body = await req.json();
    const parsed = extractMetricsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const { imageDataUrl, source } = parsed.data;

    // Extract base64 data and media type from data URL
    const match = imageDataUrl.match(/^data:(image\/[\w+]+);base64,(.+)/);
    if (!match) {
      return NextResponse.json({ error: "Invalid image data URL format" }, { status: 400 });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    const prompt = source === "eightSleep" ? EIGHT_SLEEP_PROMPT : OURA_PROMPT;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const result = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: base64Data,
            },
          },
          { type: "text", text: prompt },
        ],
      }],
    });

    const text = result.content[0].type === "text" ? result.content[0].text : "";

    if (!text) {
      return NextResponse.json({ error: "No text response from AI" }, { status: 422 });
    }

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse metrics from image" }, { status: 422 });
    }

    let metrics: Record<string, unknown>;
    try {
      metrics = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 422 });
    }

    // Strip null values
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(metrics)) {
      if (v !== null && v !== undefined) cleaned[k] = v;
    }

    return NextResponse.json({ metrics: cleaned, source });
  } catch (error) {
    console.error("Extract metrics error:", error);
    const message = error instanceof Error ? error.message : "Failed to extract metrics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
