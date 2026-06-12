import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/redis";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { getAllReadings, getLabTests } from "@/lib/biomarkerStore";
import { getBiomarkerById, calcTrend, BIOMARKERS } from "@/lib/biomarkerData";

export const maxDuration = 60;

const MARKER_IDS = BIOMARKERS.map((m) => m.id).join(", ");

const GOALS_PROMPT = `You are a health intelligence engine. Analyze the user's biomarker data and generate a prioritized health protocol - a set of numbered goals to improve their health.

Return ONLY valid JSON as an array of goals in this exact format:
[
  {
    "id": "<unique kebab-case id like 'optimize-iron-levels'>",
    "number": <1-based index>,
    "totalGoals": <total number of goals>,
    "title": "<concise goal title>",
    "summary": "<1-2 sentence personalized summary of this goal>",
    "priority": "<high|medium|low>",
    "healthImpact": "<brief impact description like 'Energy, Cognitive Function'>",
    "recoveryTime": "<estimated time like '4-8 weeks'>",
    "whatThisMeans": "<2-3 sentence explanation of what this pattern means for their health>",
    "potentialCauses": "<2-3 sentence explanation of common causes>",
    "biomarkersToImprove": ["<biomarkerId1>", "<biomarkerId2>"],
    "actions": [
      { "number": 1, "title": "<action title>", "details": "<specific actionable details>" }
    ],
    "askAiQuestions": ["<relevant follow-up question 1>", "<relevant follow-up question 2>"]
  }
]

Guidelines:
- Generate 3-5 goals, prioritized by health impact.
- Focus on markers that are out_of_range or attention status first.
- Group related biomarkers into single goals when they share a root cause.
- biomarkersToImprove MUST use IDs from this list: ${MARKER_IDS}
- Each goal should have 3-5 specific, actionable recommendations.
- Include 2-3 contextual AI follow-up questions per goal.
- Be specific - reference actual numbers from the data.
- Never diagnose conditions - frame as areas to discuss with a doctor.
- Recovery times should be realistic estimates.
- If all markers are optimal, generate maintenance/optimization goals instead.`;

export async function GET(req: NextRequest) {
  const { success } = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "AI not configured" }, { status: 500 });
    }

    // Check cache first
    const redis = getRedis();
    const cacheKey = `user:${userId}:health-goals`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      const goals = JSON.parse(cached);
      return NextResponse.json({ goals });
    }

    // Gather biomarker data
    const [allReadings, labs] = await Promise.all([
      getAllReadings(userId),
      getLabTests(userId),
    ]);

    // Build biomarker summary for the prompt
    const markerLines: string[] = [];
    const flagged: string[] = [];

    for (const [biomarkerId, readings] of Object.entries(allReadings)) {
      if (readings.length === 0) continue;
      const meta = getBiomarkerById(biomarkerId);
      if (!meta) continue;
      const latest = readings[readings.length - 1];
      const trend = calcTrend(readings, biomarkerId);
      const line = `${meta.shortName ?? meta.name} (${biomarkerId}): ${latest.value} ${latest.unit} [${latest.status}] trend: ${trend}`;
      markerLines.push(line);

      if (latest.status === "attention" || latest.status === "out_of_range") {
        const target = meta.optimal ?? meta.standard;
        const isLow = latest.value < target.low;
        const delta = isLow ? target.low - latest.value : latest.value - target.high;
        const direction = isLow ? "below" : "above";
        const historyStr = readings.slice(-5).map((r) => `${r.date}: ${r.value}`).join(", ");
        flagged.push(
          `${meta.shortName ?? meta.name} (${biomarkerId}): ${latest.value} ${latest.unit} [${latest.status}] - ${delta.toFixed(1)} ${direction} ${meta.optimal ? "optimal" : "standard"} range. History: ${historyStr}`,
        );
      }
    }

    if (markerLines.length === 0) {
      return NextResponse.json({ goals: null, message: "Import lab data to generate health goals." });
    }

    const healthContext = `USER BIOMARKER DATA (${markerLines.length} markers from ${labs.length} lab tests):

ALL MARKERS:
${markerLines.join("\n")}

${flagged.length > 0 ? `FLAGGED MARKERS REQUIRING ATTENTION:\n${flagged.join("\n")}` : "All markers are within normal/optimal range."}`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const result = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: GOALS_PROMPT,
      messages: [{ role: "user", content: healthContext }],
    });
    const text = result.content[0].type === "text" ? result.content[0].text : "";

    if (!text) {
      return NextResponse.json({ error: "No response from AI" }, { status: 422 });
    }

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse goals" }, { status: 422 });
    }

    const goals = JSON.parse(jsonMatch[0]);

    // Cache for 24 hours (invalidated on new lab import)
    await redis.set(cacheKey, JSON.stringify(goals), "EX", 86400);

    return NextResponse.json({ goals });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Health goals error:", error);
    return NextResponse.json({ error: `Goals error: ${msg}` }, { status: 500 });
  }
}
