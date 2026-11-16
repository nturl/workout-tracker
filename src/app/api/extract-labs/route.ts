import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, rateLimitResponse, checkCsrf, csrfResponse } from "@/lib/rateLimit";
import { getRedis } from "@/lib/redis";
import { extractLabSchema } from "@/lib/validators";
import { BIOMARKERS, findBiomarker, getBiomarkerById, toCatalogValue } from "@/lib/biomarkerData";
import { importLab } from "@/lib/biomarkerStore";
import type { MarkerInput } from "@/types/biomarker";

export const maxDuration = 60;

const CATALOG = BIOMARKERS.map((m) => `${m.id}: ${m.name} (${m.unit})`).join("\n");

const LAB_EXTRACT_PROMPT = `You are a medical lab report parser. Extract ALL biomarker values from this lab report image.

For each marker found, return:
- "name": the exact name as printed on the report
- "id": the id of the matching catalog marker below, or null when none fits. Never force a fit. Tell apart percentage and absolute differential counts (e.g. neutrophils_pct vs neutrophils_abs) and total vs free/direct forms (e.g. testosterone_total vs testosterone_free, bilirubin_total vs bilirubin_direct).
- "value": numeric value (a number). If the result is not a plain number (e.g. "<0.3", "Negative"), return it as a string exactly as printed
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
    { "name": "<string>", "id": "<catalog id or null>", "value": <number>, "unit": "<string>", "flag": "<string or null>", "refRange": "<string or null>" }
  ]
}

Catalog (id: name (unit)):\n${CATALOG}

Be thorough - extract EVERY numeric result visible on the report. Do not skip any markers.`;

interface ExtractedMarker {
  name: string;
  id?: string | null;
  value: number | string;
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
      max_tokens: 8000,
      messages: [{ role: "user", content }],
    });

    if (result.stop_reason === "max_tokens") {
      return NextResponse.json({ error: "This report has too many results to read in one pass. Try uploading a single page or panel." }, { status: 422 });
    }

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
    const skipped: { name: string; reason: string }[] = [];

    for (const em of cappedMarkers) {
      if (typeof em.value !== "number" || !isFinite(em.value)) {
        skipped.push({ name: em.name, reason: "not a number" });
        continue;
      }

      const meta = (typeof em.id === "string" ? getBiomarkerById(em.id) : undefined) ?? findBiomarker(em.name);
      if (!meta) {
        skipped.push({ name: em.name, reason: "not tracked" });
        continue;
      }

      const unit = em.unit ?? "";
      const value = toCatalogValue(meta, em.value, unit);
      if (value === null) {
        skipped.push({ name: em.name, reason: `unit ${unit || "(none)"} not supported` });
        continue;
      }

      matched.push({
        biomarkerId: meta.id,
        value,
        unit: meta.unit,
        flag: em.flag ?? undefined,
        refRangeRaw: em.refRange ?? undefined,
        originalName: em.name,
        matched: true,
      });
    }

    // Determine date and source
    const todayNY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    const reportDate = extraction.reportDate && /^\d{4}-\d{2}-\d{2}$/.test(extraction.reportDate) ? extraction.reportDate : null;
    const labDate = date ?? reportDate ?? todayNY;
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
      skipped,
      stats: {
        total: cappedMarkers.length,
        matched: matched.length,
        skipped: skipped.length,
      },
    });
  } catch (error) {
    console.error("Extract labs error:", error);
    const message = error instanceof Error ? error.message : "Failed to extract lab data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
