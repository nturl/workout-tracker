import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, rateLimitResponse, checkCsrf, csrfResponse } from "@/lib/rateLimit";
import { getRedis } from "@/lib/redis";
import { extractLabSchema } from "@/lib/validators";
import { BIOMARKERS, findBiomarker } from "@/lib/biomarkerData";
import { importLab } from "@/lib/biomarkerStore";
import type { MarkerInput } from "@/types/biomarker";

export const maxDuration = 60;

const MARKER_IDS = BIOMARKERS.map((m) => m.id).join(", ");

const LAB_EXTRACT_PROMPT = `You are a medical lab report parser. Extract ALL biomarker values from this lab report image.

For each marker found, return:
- "name": the exact name as printed on the report
- "value": numeric value (number, not string)
- "unit": the unit of measurement
- "flag": any flag like "HIGH", "LOW", "H", "L", "HH", "LL", or null
- "refRange": the reference range string as printed (e.g. "70-100") or null

Also extract:
- "labName": the laboratory or facility name if visible
- "reportDate": the date of the report in YYYY-MM-DD format if visible
- "panelName": the test panel name (e.g. "CBC with Differential", "Comprehensive Metabolic Panel")

Return ONLY valid JSON in this exact format:
{
  "labName": "<string or null>",
  "reportDate": "<YYYY-MM-DD or null>",
  "panelName": "<string or null>",
  "markers": [
    { "name": "<string>", "value": <number>, "unit": "<string>", "flag": "<string or null>", "refRange": "<string or null>" }
  ]
}

Known biomarker IDs for matching: ${MARKER_IDS}

Be thorough - extract EVERY numeric result visible on the report. Do not skip any markers.`;

interface ExtractedMarker {
  name: string;
  value: number;
  unit: string;
  flag?: string | null;
  refRange?: string | null;
}

interface ExtractionResult {
  labName?: string | null;
  reportDate?: string | null;
  panelName?: string | null;
  markers: ExtractedMarker[];
}

export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return csrfResponse();
  const { success } = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const body = await req.json();
    const parsed = extractLabSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }

    const { imageDataUrl, date, source } = parsed.data;

    const match = imageDataUrl.match(/^data:(image\/[\w+]+|application\/pdf);base64,(.+)/);
    if (!match) {
      return NextResponse.json({ error: "Invalid file data URL" }, { status: 400 });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Build content blocks - PDFs use "document" type, images use "image" type
    let content: Anthropic.MessageCreateParams["messages"][0]["content"];

    if (mimeType === "application/pdf") {
      content = [
        {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: base64Data,
          },
        },
        { type: "text" as const, text: LAB_EXTRACT_PROMPT },
      ];
    } else {
      content = [
        {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: base64Data,
          },
        },
        { type: "text" as const, text: LAB_EXTRACT_PROMPT },
      ];
    }

    const result = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    });

    const text = result.content[0].type === "text" ? result.content[0].text : "";
    if (!text) {
      return NextResponse.json({ error: "No response from AI" }, { status: 422 });
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse lab data from image" }, { status: 422 });
    }

    let extraction: ExtractionResult;
    try {
      extraction = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 422 });
    }

    if (!extraction.markers || !Array.isArray(extraction.markers) || extraction.markers.length === 0) {
      return NextResponse.json({ error: "No markers found in image" }, { status: 422 });
    }

    // Cap markers to prevent abuse from malformed AI output
    const cappedMarkers = extraction.markers.slice(0, 200);

    // Match extracted markers to our biomarker database
    const matched: (MarkerInput & { originalName: string; matched: boolean })[] = [];
    const unmatched: ExtractedMarker[] = [];

    for (const em of cappedMarkers) {
      if (typeof em.value !== "number" || !isFinite(em.value)) continue;

      const meta = findBiomarker(em.name);
      if (meta) {
        matched.push({
          biomarkerId: meta.id,
          value: em.value,
          unit: em.unit || meta.unit,
          flag: em.flag ?? undefined,
          refRangeRaw: em.refRange ?? undefined,
          originalName: em.name,
          matched: true,
        });
      } else {
        unmatched.push(em);
      }
    }

    // Determine date and source
    const labDate = date ?? extraction.reportDate ?? new Date().toISOString().slice(0, 10);
    const labSource = source ?? extraction.labName ?? "Unknown Lab";
    const panelName = extraction.panelName ?? "Lab Results";

    // If we have matched markers, auto-import
    let lab = null;
    if (matched.length > 0) {
      lab = await importLab(userId, {
        date: labDate,
        source: labSource,
        name: panelName,
        importMethod: "photo",
        markers: matched.map(({ biomarkerId, value, unit, flag, refRangeRaw }) => ({
          biomarkerId, value, unit, flag, refRangeRaw,
        })),
      });

      // Invalidate cached health goals so they regenerate with new data
      const redis = getRedis();
      await redis.del(`user:${userId}:health-goals`);
    }

    return NextResponse.json({
      success: true,
      lab,
      extraction: {
        labName: extraction.labName,
        reportDate: extraction.reportDate,
        panelName: extraction.panelName,
      },
      matched: matched.map((m) => ({
        biomarkerId: m.biomarkerId,
        originalName: m.originalName,
        value: m.value,
        unit: m.unit,
        flag: m.flag,
      })),
      unmatched,
      stats: {
        total: extraction.markers.length,
        matched: matched.length,
        unmatched: unmatched.length,
      },
    });
  } catch (error) {
    console.error("Extract labs error:", error);
    const message = error instanceof Error ? error.message : "Failed to extract lab data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
