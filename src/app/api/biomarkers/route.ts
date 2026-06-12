import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { getAllReadings, getReadings } from "@/lib/biomarkerStore";
import {
  CATEGORY_LABELS,
  getBiomarkerById,
  getMarkersByCategory,
  calcTrend,
} from "@/lib/biomarkerData";
import type { BiomarkerCategory, BiomarkerSnapshot, CategorySummary, BiomarkerStatus } from "@/types/biomarker";

export async function GET(req: NextRequest) {
  const { success } = rateLimit(req, { limit: 120, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const category = searchParams.get("category");
    const view = searchParams.get("view"); // "summary" | "snapshots" | "categories"

    // Single biomarker detail
    if (id) {
      const meta = getBiomarkerById(id);
      if (!meta) return NextResponse.json({ error: "Unknown biomarker" }, { status: 404 });
      const history = await getReadings(userId, id);
      const snapshot: BiomarkerSnapshot = {
        biomarkerId: id,
        meta,
        latest: history[history.length - 1],
        history,
        trend: calcTrend(history, id),
      };
      return NextResponse.json({ biomarker: snapshot });
    }

    // Category view
    if (category) {
      const markers = getMarkersByCategory(category as BiomarkerCategory);
      const allReadings = await getAllReadings(userId);
      const snapshots: BiomarkerSnapshot[] = [];

      for (const meta of markers) {
        const history = allReadings[meta.id] ?? [];
        if (history.length === 0) continue;
        snapshots.push({
          biomarkerId: meta.id,
          meta,
          latest: history[history.length - 1],
          history,
          trend: calcTrend(history, meta.id),
        });
      }

      return NextResponse.json({
        category,
        label: CATEGORY_LABELS[category as BiomarkerCategory] ?? category,
        markers: snapshots,
      });
    }

    // Category summaries overview
    if (view === "categories") {
      const allReadings = await getAllReadings(userId);
      const categories: CategorySummary[] = [];

      for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
        const markers = getMarkersByCategory(cat as BiomarkerCategory);
        const statusBreakdown: Record<BiomarkerStatus, number> = {
          optimal: 0, normal: 0, attention: 0, out_of_range: 0,
        };
        let markerCount = 0;

        for (const meta of markers) {
          const history = allReadings[meta.id];
          if (!history || history.length === 0) continue;
          markerCount++;
          const latest = history[history.length - 1];
          statusBreakdown[latest.status]++;
        }

        if (markerCount === 0) continue;

        const worstStatus: BiomarkerStatus =
          statusBreakdown.out_of_range > 0 ? "out_of_range" :
          statusBreakdown.attention > 0 ? "attention" :
          statusBreakdown.normal > 0 ? "normal" : "optimal";

        categories.push({
          category: cat as BiomarkerCategory,
          label,
          markerCount,
          statusBreakdown,
          worstStatus,
        });
      }

      return NextResponse.json({ categories });
    }

    // Default: all snapshots (markers that have readings)
    const allReadings = await getAllReadings(userId);
    const snapshots: BiomarkerSnapshot[] = [];

    for (const [biomarkerId, history] of Object.entries(allReadings)) {
      if (history.length === 0) continue;
      const meta = getBiomarkerById(biomarkerId);
      if (!meta) continue;
      snapshots.push({
        biomarkerId,
        meta,
        latest: history[history.length - 1],
        history,
        trend: calcTrend(history),
      });
    }

    return NextResponse.json({ biomarkers: snapshots });
  } catch (error) {
    console.error("Biomarkers GET error:", error);
    return NextResponse.json({ error: "Failed to load biomarkers" }, { status: 500 });
  }
}
