/**
 * Biomarker & Lab Test types for health tracking.
 *
 * Storage model in Redis:
 *   user:{userId}:labs       -> LabTest[]
 *   user:{userId}:biomarkers -> Record<string, BiomarkerReading[]>
 */

// ---------------------------------------------------------------------------
// Categories - organ-system groupings for the dashboard
// ---------------------------------------------------------------------------

export type BiomarkerCategory =
  | "cbc"
  | "metabolic"
  | "lipids"
  | "liver"
  | "kidney"
  | "thyroid"
  | "hormones"
  | "iron"
  | "vitamins"
  | "electrolytes"
  | "coagulation"
  | "inflammation"
  | "cardiac"
  | "tumor_markers"
  | "immune"
  | "glucose"
  | "minerals"
  | "other";

// ---------------------------------------------------------------------------
// Status tiers
// ---------------------------------------------------------------------------

export type BiomarkerStatus = "optimal" | "normal" | "attention" | "out_of_range";

export const STATUS_CONFIG: Record<BiomarkerStatus, { label: string; color: string }> = {
  optimal: { label: "Optimal", color: "#22c55e" },
  normal: { label: "Normal", color: "#3b82f6" },
  attention: { label: "Needs Attention", color: "#eab308" },
  out_of_range: { label: "Out of Range", color: "#ef4444" },
};

// ---------------------------------------------------------------------------
// Reference ranges
// ---------------------------------------------------------------------------

export interface ReferenceRange {
  low: number;
  high: number;
}

export interface BiomarkerMeta {
  id: string;
  name: string;
  shortName?: string;
  unit: string;
  category: BiomarkerCategory;
  /** Standard lab reference range */
  standard: ReferenceRange;
  /** Research-backed optimal range (tighter than standard) */
  optimal?: ReferenceRange;
  description?: string;
  /** Common aliases across different lab vendors */
  aliases?: string[];
}

// ---------------------------------------------------------------------------
// Readings & Lab Tests
// ---------------------------------------------------------------------------

export interface BiomarkerReading {
  value: number;
  unit: string;
  date: string; // ISO date YYYY-MM-DD
  labTestId?: string;
  status: BiomarkerStatus;
  /** Flag text from the lab report (e.g. "HIGH", "LOW", "H", "L") */
  flag?: string;
  /** Lab-provided reference range string (preserved from original report) */
  refRangeRaw?: string;
}

export interface LabTest {
  id: string;
  date: string; // ISO date YYYY-MM-DD
  source: string; // e.g. "Quest Diagnostics", "BioReference", "Taiwan Health Check"
  name: string; // e.g. "Comprehensive Metabolic Panel", "CBC with Differential"
  importMethod: "manual" | "photo" | "pdf";
  createdAt: string; // ISO datetime
  /** Number of markers extracted */
  markerCount: number;
  notes?: string;
}

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

export interface LabImportPayload {
  date: string;
  source: string;
  name: string;
  importMethod: "manual" | "photo" | "pdf";
  markers: MarkerInput[];
  notes?: string;
}

export interface MarkerInput {
  biomarkerId: string;
  value: number;
  unit: string;
  flag?: string;
  refRangeRaw?: string;
}

// ---------------------------------------------------------------------------
// Dashboard / aggregated views
// ---------------------------------------------------------------------------

export interface BiomarkerSnapshot {
  biomarkerId: string;
  meta: BiomarkerMeta;
  latest: BiomarkerReading;
  history: BiomarkerReading[];
  trend: "improving" | "stable" | "declining" | "insufficient_data";
}

export interface LabsSummary {
  totalTests: number;
  totalMarkers: number;
  latestTest?: LabTest;
  statusBreakdown: Record<BiomarkerStatus, number>;
}

export interface CategorySummary {
  category: BiomarkerCategory;
  label: string;
  markerCount: number;
  statusBreakdown: Record<BiomarkerStatus, number>;
  /** Worst status among markers in this category */
  worstStatus: BiomarkerStatus;
}

// ---------------------------------------------------------------------------
// Health Goals (goal-based protocol from AI)
// ---------------------------------------------------------------------------

export interface GoalAction {
  number: number;
  title: string;
  details: string;
}

export interface HealthGoal {
  id: string;
  number: number;
  totalGoals: number;
  title: string;
  summary: string;
  priority: "high" | "medium" | "low";
  healthImpact: string;
  recoveryTime: string;
  whatThisMeans: string;
  potentialCauses: string;
  biomarkersToImprove: string[];
  actions: GoalAction[];
  askAiQuestions: string[];
}
