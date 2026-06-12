"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { BiomarkerSnapshot, BiomarkerStatus, CategorySummary, HealthGoal, LabTest, LabsSummary } from "@/types/biomarker";
import { calcGrade, type GradeResult } from "@/lib/biomarkerData";

// ---------------------------------------------------------------------------
// Labs
// ---------------------------------------------------------------------------

export function useLabTests() {
  return useQuery<LabTest[]>({
    queryKey: ["labs"],
    queryFn: async () => {
      const res = await fetch("/api/labs");
      if (!res.ok) throw new Error("Failed to load labs");
      const data = await res.json();
      return data.labs ?? [];
    },
  });
}

export function useLabsSummary() {
  return useQuery<LabsSummary>({
    queryKey: ["labs", "summary"],
    queryFn: async () => {
      const res = await fetch("/api/labs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "summary" }),
      });
      if (!res.ok) throw new Error("Failed to load summary");
      const data = await res.json();
      return data.summary;
    },
  });
}

export function useDeleteLab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (labId: string) => {
      const res = await fetch("/api/labs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", labId }),
      });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labs"] });
      qc.invalidateQueries({ queryKey: ["biomarkers"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Biomarkers
// ---------------------------------------------------------------------------

export function useBiomarkerSnapshots() {
  return useQuery<BiomarkerSnapshot[]>({
    queryKey: ["biomarkers"],
    queryFn: async () => {
      const res = await fetch("/api/biomarkers");
      if (!res.ok) throw new Error("Failed to load biomarkers");
      const data = await res.json();
      return data.biomarkers ?? [];
    },
  });
}

export function useBiomarkerDetail(id: string | null) {
  return useQuery<BiomarkerSnapshot>({
    queryKey: ["biomarkers", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/biomarkers?id=${id}`);
      if (!res.ok) throw new Error("Failed to load biomarker");
      const data = await res.json();
      return data.biomarker;
    },
  });
}

export function useCategorySummaries() {
  return useQuery<CategorySummary[]>({
    queryKey: ["biomarkers", "categories"],
    queryFn: async () => {
      const res = await fetch("/api/biomarkers?view=categories");
      if (!res.ok) throw new Error("Failed to load categories");
      const data = await res.json();
      return data.categories ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Health Insights
// ---------------------------------------------------------------------------

export interface HealthInsight {
  category: string;
  title: string;
  body: string;
  priority: "high" | "medium" | "low";
  type: "positive" | "neutral" | "concern";
}

export interface HealthInsightsData {
  overallScore: number;
  scoreLabel: string;
  summary: string;
  insights: HealthInsight[];
  recommendations: string[];
  trends: { marker: string; direction: string; note: string }[];
  categorySummaries?: Record<string, string>;
}

export function useHealthInsights() {
  return useQuery<{ insights: HealthInsightsData | null; message?: string; dataPoints?: Record<string, number> }>({
    queryKey: ["health-insights"],
    queryFn: async () => {
      const res = await fetch("/api/health-insights");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? `Failed to load insights (${res.status})`);
      }
      return json;
    },
    staleTime: 5 * 60 * 1000, // 5 min - insights don't change often
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Health Goals
// ---------------------------------------------------------------------------

export function useHealthGoals() {
  return useQuery<{ goals: HealthGoal[] | null; message?: string }>({
    queryKey: ["health-goals"],
    queryFn: async () => {
      const res = await fetch("/api/health-goals");
      if (!res.ok) throw new Error("Failed to load goals");
      return res.json();
    },
    staleTime: 10 * 60 * 1000, // 10 min
  });
}

// ---------------------------------------------------------------------------
// Dashboard (composition hook)
// ---------------------------------------------------------------------------

export interface GradedCategory extends CategorySummary {
  grade: GradeResult;
}

export interface LabsDashboard {
  overallScore: number;
  overallGrade: GradeResult;
  statusBreakdown: Record<BiomarkerStatus, number>;
  categories: GradedCategory[];
  flaggedMarkers: BiomarkerSnapshot[];
  allMarkers: BiomarkerSnapshot[];
  insights: HealthInsightsData | null;
  isLoading: boolean;
}

export function useLabsDashboard(): LabsDashboard {
  const { data: snapshots, isLoading: loadingSnaps } = useBiomarkerSnapshots();
  const { data: categories, isLoading: loadingCats } = useCategorySummaries();
  const { data: insightsResult, isLoading: loadingInsights } = useHealthInsights();

  return useMemo(() => {
    const allMarkers = snapshots ?? [];
    const cats = categories ?? [];
    const insights = insightsResult?.insights ?? null;

    // Aggregate status breakdown across all markers
    const statusBreakdown: Record<BiomarkerStatus, number> = {
      optimal: 0,
      normal: 0,
      attention: 0,
      out_of_range: 0,
    };
    for (const s of allMarkers) {
      statusBreakdown[s.latest.status]++;
    }

    const overallGrade = calcGrade(statusBreakdown);

    // Grade each category
    const gradedCategories: GradedCategory[] = cats.map((c) => ({
      ...c,
      grade: calcGrade(c.statusBreakdown),
    }));

    // Markers needing attention (sorted: out_of_range first, then attention)
    const flaggedMarkers = allMarkers
      .filter((s) => s.latest.status === "out_of_range" || s.latest.status === "attention")
      .sort((a, b) => {
        const rank: Record<BiomarkerStatus, number> = { out_of_range: 0, attention: 1, normal: 2, optimal: 3 };
        return rank[a.latest.status] - rank[b.latest.status];
      });

    return {
      overallScore: overallGrade.score,
      overallGrade,
      statusBreakdown,
      categories: gradedCategories,
      flaggedMarkers,
      allMarkers,
      insights,
      isLoading: loadingSnaps || loadingCats || loadingInsights,
    };
  }, [snapshots, categories, insightsResult, loadingSnaps, loadingCats, loadingInsights]);
}

// ---------------------------------------------------------------------------
// Extract from photo
// ---------------------------------------------------------------------------

export function useExtractLabs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { imageDataUrl: string; date?: string; source?: string }) => {
      const res = await fetch("/api/extract-labs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error ?? "Extraction failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labs"] });
      qc.invalidateQueries({ queryKey: ["biomarkers"] });
      qc.invalidateQueries({ queryKey: ["health-goals"] });
      qc.invalidateQueries({ queryKey: ["health-insights"] });
    },
  });
}
