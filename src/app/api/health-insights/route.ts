import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/redis";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { getAllReadings, getLabTests } from "@/lib/biomarkerStore";
import { getBiomarkerById, calcTrend } from "@/lib/biomarkerData";
import type { BiomarkerStatus } from "@/types/biomarker";

export const maxDuration = 60;

function buildHealthContext(
  biomarkerSummary: Record<string, { name: string; value: number; unit: string; status: BiomarkerStatus; trend: string; history: { date: string; value: number }[] }>,
  recoveryData: Record<string, unknown>,
  workoutData: Record<string, unknown> | null,
): string {
  const markerLines: string[] = [];
  const flagged: string[] = [];

  for (const data of Object.values(biomarkerSummary)) {
    const line = `${data.name}: ${data.value} ${data.unit} [${data.status}] trend: ${data.trend}`;
    markerLines.push(line);
    if (data.status === "attention" || data.status === "out_of_range") {
      const historyStr = data.history.map((h) => `${h.date}: ${h.value}`).join(", ");
      flagged.push(`${data.name} (${data.status}): current ${data.value} ${data.unit}, history: ${historyStr}`);
    }
  }

  const recoveryEntries = Object.entries(recoveryData);
  const recentRecovery = recoveryEntries.slice(-7);
  const recoveryLines = recentRecovery.map(([date, entry]) => {
    const e = entry as Record<string, unknown>;
    const parts: string[] = [`Date: ${date}`];
    if (e.oura) {
      const o = e.oura as Record<string, unknown>;
      if (o.readinessScore) parts.push(`Oura Readiness: ${o.readinessScore}`);
      if (o.hrv) parts.push(`HRV: ${o.hrv}ms`);
      if (o.rhr) parts.push(`RHR: ${o.rhr}bpm`);
      if (o.totalSleep) parts.push(`Sleep: ${o.totalSleep}`);
    }
    if (e.eightSleep) {
      const es = e.eightSleep as Record<string, unknown>;
      if (es.sleepFitnessScore) parts.push(`Eight Sleep Score: ${es.sleepFitnessScore}`);
      if (es.hrv) parts.push(`HRV: ${es.hrv}ms`);
    }
    return parts.join(", ");
  });

  const level = workoutData?.level ?? "unknown";
  const completions = workoutData?.completions as Record<string, boolean> | undefined ?? {};
  const completedCount = Object.values(completions).filter(Boolean).length;

  return `USER HEALTH DATA:

BIOMARKERS (${markerLines.length} tracked):
${markerLines.join("\n")}

${flagged.length > 0 ? `FLAGGED MARKERS REQUIRING ATTENTION:\n${flagged.join("\n")}` : "No markers flagged."}

RECENT RECOVERY (last 7 days):
${recoveryLines.length > 0 ? recoveryLines.join("\n") : "No recovery data."}

WORKOUT PROFILE:
Level: ${level}
Total sessions completed: ${completedCount}`;
}

const INSIGHTS_PROMPT = `You are a health intelligence engine. Analyze biomarker, recovery, and workout data.

CRITICAL: Output ONLY a JSON object matching the schema below. No markdown, no \`\`\`json fences, no preamble, no trailing text. Start with { and end with }.

Schema:
{
  "overallScore": number 0-100,
  "scoreLabel": "Excellent" | "Good" | "Fair" | "Needs Attention",
  "summary": "2 short sentences",
  "insights": [
    { "category": string, "title": string, "body": "1-2 sentences with specific values", "priority": "high" | "medium" | "low", "type": "positive" | "neutral" | "concern" }
  ],
  "recommendations": [string],
  "trends": [
    { "marker": string, "direction": "improving" | "stable" | "declining", "note": "brief" }
  ],
  "categorySummaries": {
    "<category_key>": "1 sentence"
  }
}

Rules:
- 3-5 insights. 3-5 recommendations. 3-6 trends.
- Cite actual numbers from the data. Prioritize out_of_range and attention markers. Frame as "discuss with doctor" - never diagnose.
- Keep response under 800 tokens.

SMART BREVITY formatting:
- "summary": 2 short punchy sentences. No medical jargon unless essential.
- "insights.title": 3-5 words, concrete. e.g. "Anemia indicators", "Cortisol spike".
- "insights.body": 1-2 sentences. Lead with the number, then the implication.
- "recommendations": each item is one sentence, max ~15 words. Start with an imperative verb (Schedule / Discuss / Request / Try / Maintain). Format: "Action; why it matters." Lead clause is the action.
- "trends.marker": the marker name, 1-3 words max (e.g. "Hemoglobin", not "Hemoglobin/Hematocrit/RBC"). Pick ONE marker per trend.
- "trends.note": one tight clause, max ~10 words. Reference the delta or pattern.
- "categorySummaries": one sentence per category, under 15 words.`;

export async function GET(req: NextRequest) {
  const { success } = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "AI not configured" }, { status: 500 });
    }

    // Gather all data
    const redis = getRedis();
    const [allReadings, labs, workoutRaw] = await Promise.all([
      getAllReadings(userId),
      getLabTests(userId),
      redis.get(`user:${userId}:data`),
    ]);
    const workoutData = workoutRaw ? JSON.parse(workoutRaw) : null;
    const recoveryData = (workoutData?.recovery ?? {}) as Record<string, unknown>;

    // Build biomarker summary
    const biomarkerSummary: Record<string, { name: string; value: number; unit: string; status: BiomarkerStatus; trend: string; history: { date: string; value: number }[] }> = {};

    for (const [biomarkerId, readings] of Object.entries(allReadings)) {
      if (readings.length === 0) continue;
      const meta = getBiomarkerById(biomarkerId);
      if (!meta) continue;
      const latest = readings[readings.length - 1];
      biomarkerSummary[biomarkerId] = {
        name: meta.shortName ?? meta.name,
        value: latest.value,
        unit: latest.unit,
        status: latest.status,
        trend: calcTrend(readings, biomarkerId),
        history: readings.map((r) => ({ date: r.date, value: r.value })),
      };
    }

    const hasData = Object.keys(biomarkerSummary).length > 0 || Object.keys(recoveryData).length > 0;
    if (!hasData) {
      return NextResponse.json({
        insights: null,
        message: "Import lab data or log recovery metrics to get AI health insights.",
      });
    }

    const healthContext = buildHealthContext(biomarkerSummary, recoveryData, workoutData);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const result = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      system: INSIGHTS_PROMPT,
      messages: [
        { role: "user", content: healthContext },
        { role: "assistant", content: "{" },
      ],
    });
    const raw = result.content[0].type === "text" ? result.content[0].text : "";

    if (!raw) {
      return NextResponse.json({ error: "Empty response from AI" }, { status: 422 });
    }

    // Prefill was "{" so the response is the rest of the JSON
    const text = "{" + raw;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Insights parse failed. Raw:", text.slice(0, 500));
      return NextResponse.json({ error: "Insights response was malformed. Try refreshing." }, { status: 422 });
    }

    let insights;
    try {
      insights = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Insights JSON parse error:", e);
      return NextResponse.json({ error: "Insights response was malformed. Try refreshing." }, { status: 422 });
    }

    return NextResponse.json({
      insights,
      dataPoints: {
        biomarkers: Object.keys(biomarkerSummary).length,
        labTests: labs.length,
        recoveryDays: Object.keys(recoveryData).length,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Health insights error:", error, msg);
    return NextResponse.json({ error: "Health Intelligence is unavailable right now. Try again in a moment." }, { status: 500 });
  }
}
