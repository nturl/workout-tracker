/**
 * Static biomarker reference database.
 *
 * ~90 markers across 18 categories, informed by real lab data from
 * multiple sources (BioReference, Quest, Taiwan health checks).
 * Each marker has a standard lab range and an optional research-backed
 * optimal range.
 */

import type { BiomarkerMeta, BiomarkerCategory, BiomarkerReading, BiomarkerStatus } from "@/types/biomarker";

// ---------------------------------------------------------------------------
// Category labels
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<BiomarkerCategory, string> = {
  cbc: "Complete Blood Count",
  metabolic: "Metabolic Panel",
  lipids: "Lipid Panel",
  liver: "Liver Function",
  kidney: "Kidney Function",
  thyroid: "Thyroid",
  hormones: "Hormones",
  iron: "Iron Studies",
  vitamins: "Vitamins",
  electrolytes: "Electrolytes",
  coagulation: "Coagulation",
  inflammation: "Inflammation",
  cardiac: "Cardiac",
  tumor_markers: "Tumor Markers",
  immune: "Immune",
  glucose: "Glucose / Diabetes",
  minerals: "Minerals",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Marker definitions
// ---------------------------------------------------------------------------

export const BIOMARKERS: BiomarkerMeta[] = [
  // ---- CBC ----
  { id: "wbc", name: "White Blood Cell Count", shortName: "WBC", unit: "x10^3/uL", category: "cbc", standard: { low: 4.5, high: 11.0 }, optimal: { low: 5.0, high: 8.0 }, aliases: ["Leukocytes"] },
  { id: "rbc", name: "Red Blood Cell Count", shortName: "RBC", unit: "x10^6/uL", category: "cbc", standard: { low: 4.5, high: 5.5 }, optimal: { low: 4.5, high: 5.2 }, aliases: ["Erythrocytes"] },
  { id: "hemoglobin", name: "Hemoglobin", shortName: "Hgb", unit: "g/dL", category: "cbc", standard: { low: 13.5, high: 17.5 }, optimal: { low: 14.0, high: 16.0 }, aliases: ["Hb", "HGB"] },
  { id: "hematocrit", name: "Hematocrit", shortName: "Hct", unit: "%", category: "cbc", standard: { low: 38.0, high: 50.0 }, optimal: { low: 40.0, high: 46.0 }, aliases: ["HCT", "Packed Cell Volume"] },
  { id: "mcv", name: "Mean Corpuscular Volume", shortName: "MCV", unit: "fL", category: "cbc", standard: { low: 80.0, high: 100.0 }, optimal: { low: 82.0, high: 95.0 } },
  { id: "mch", name: "Mean Corpuscular Hemoglobin", shortName: "MCH", unit: "pg", category: "cbc", standard: { low: 27.0, high: 33.0 }, optimal: { low: 28.0, high: 32.0 } },
  { id: "mchc", name: "Mean Corpuscular Hgb Concentration", shortName: "MCHC", unit: "g/dL", category: "cbc", standard: { low: 32.0, high: 36.0 }, optimal: { low: 33.0, high: 35.5 } },
  { id: "rdw", name: "Red Cell Distribution Width", shortName: "RDW", unit: "%", category: "cbc", standard: { low: 11.5, high: 14.5 }, optimal: { low: 11.5, high: 13.0 }, aliases: ["RDW-CV"] },
  { id: "platelets", name: "Platelet Count", shortName: "PLT", unit: "x10^3/uL", category: "cbc", standard: { low: 150, high: 400 }, optimal: { low: 175, high: 300 }, aliases: ["Thrombocytes"] },
  { id: "mpv", name: "Mean Platelet Volume", shortName: "MPV", unit: "fL", category: "cbc", standard: { low: 7.5, high: 12.5 }, optimal: { low: 8.0, high: 11.0 } },

  // ---- CBC Differential ----
  { id: "neutrophils_pct", name: "Neutrophils %", unit: "%", category: "cbc", standard: { low: 40, high: 70 }, optimal: { low: 45, high: 65 }, aliases: ["Segs", "Segmented Neutrophils"] },
  { id: "neutrophils_abs", name: "Neutrophils Absolute", unit: "x10^3/uL", category: "cbc", standard: { low: 1.8, high: 7.7 }, optimal: { low: 2.0, high: 6.0 } },
  { id: "lymphocytes_pct", name: "Lymphocytes %", unit: "%", category: "cbc", standard: { low: 20, high: 40 }, optimal: { low: 25, high: 38 } },
  { id: "lymphocytes_abs", name: "Lymphocytes Absolute", unit: "x10^3/uL", category: "cbc", standard: { low: 1.0, high: 4.8 }, optimal: { low: 1.2, high: 3.5 } },
  { id: "monocytes_pct", name: "Monocytes %", unit: "%", category: "cbc", standard: { low: 2, high: 8 }, optimal: { low: 3, high: 7 } },
  { id: "monocytes_abs", name: "Monocytes Absolute", unit: "x10^3/uL", category: "cbc", standard: { low: 0.2, high: 0.8 }, optimal: { low: 0.2, high: 0.7 } },
  { id: "eosinophils_pct", name: "Eosinophils %", unit: "%", category: "cbc", standard: { low: 0, high: 5 }, optimal: { low: 0, high: 3 } },
  { id: "eosinophils_abs", name: "Eosinophils Absolute", unit: "x10^3/uL", category: "cbc", standard: { low: 0, high: 0.5 }, optimal: { low: 0, high: 0.3 } },
  { id: "basophils_pct", name: "Basophils %", unit: "%", category: "cbc", standard: { low: 0, high: 1 }, optimal: { low: 0, high: 1 } },
  { id: "basophils_abs", name: "Basophils Absolute", unit: "x10^3/uL", category: "cbc", standard: { low: 0, high: 0.1 }, optimal: { low: 0, high: 0.1 } },
  { id: "reactive_lymphocytes", name: "Reactive Lymphocytes", unit: "%", category: "cbc", standard: { low: 0, high: 6 }, description: "Elevated in viral infections, autoimmune conditions" },
  { id: "nrbc", name: "Nucleated Red Blood Cells", shortName: "NRBC", unit: "/100 WBC", category: "cbc", standard: { low: 0, high: 0 }, description: "Should be 0 in healthy adults" },

  // ---- Metabolic / Glucose ----
  { id: "glucose", name: "Glucose", unit: "mg/dL", category: "glucose", standard: { low: 70, high: 100 }, optimal: { low: 75, high: 90 }, aliases: ["Fasting Glucose", "Blood Sugar"] },
  { id: "hba1c", name: "Hemoglobin A1c", shortName: "HbA1c", unit: "%", category: "glucose", standard: { low: 4.0, high: 5.6 }, optimal: { low: 4.5, high: 5.2 }, aliases: ["Glycated Hemoglobin", "A1C"] },
  { id: "insulin", name: "Insulin", unit: "uIU/mL", category: "glucose", standard: { low: 2.6, high: 24.9 }, optimal: { low: 3.0, high: 8.0 }, aliases: ["Fasting Insulin"] },

  // ---- Lipids ----
  { id: "total_cholesterol", name: "Total Cholesterol", unit: "mg/dL", category: "lipids", standard: { low: 0, high: 200 }, optimal: { low: 150, high: 190 }, aliases: ["Cholesterol"] },
  { id: "ldl", name: "LDL Cholesterol", shortName: "LDL", unit: "mg/dL", category: "lipids", standard: { low: 0, high: 100 }, optimal: { low: 0, high: 80 }, aliases: ["LDL-C", "Low-Density Lipoprotein"] },
  { id: "hdl", name: "HDL Cholesterol", shortName: "HDL", unit: "mg/dL", category: "lipids", standard: { low: 40, high: 200 }, optimal: { low: 55, high: 90 }, aliases: ["HDL-C", "High-Density Lipoprotein"] },
  { id: "triglycerides", name: "Triglycerides", shortName: "TG", unit: "mg/dL", category: "lipids", standard: { low: 0, high: 150 }, optimal: { low: 0, high: 80 }, aliases: ["TGs"] },
  { id: "vldl", name: "VLDL Cholesterol", shortName: "VLDL", unit: "mg/dL", category: "lipids", standard: { low: 5, high: 40 }, optimal: { low: 5, high: 20 } },
  { id: "chol_hdl_ratio", name: "Cholesterol/HDL Ratio", unit: "ratio", category: "lipids", standard: { low: 0, high: 5.0 }, optimal: { low: 0, high: 3.5 } },
  { id: "ldl_hdl_ratio", name: "LDL/HDL Ratio", unit: "ratio", category: "lipids", standard: { low: 0, high: 3.5 }, optimal: { low: 0, high: 2.5 } },

  // ---- Liver Function ----
  { id: "alt", name: "Alanine Aminotransferase", shortName: "ALT", unit: "U/L", category: "liver", standard: { low: 7, high: 56 }, optimal: { low: 10, high: 30 }, aliases: ["SGPT", "GPT"] },
  { id: "ast", name: "Aspartate Aminotransferase", shortName: "AST", unit: "U/L", category: "liver", standard: { low: 10, high: 40 }, optimal: { low: 10, high: 26 }, aliases: ["SGOT", "GOT"] },
  { id: "alp", name: "Alkaline Phosphatase", shortName: "ALP", unit: "U/L", category: "liver", standard: { low: 44, high: 147 }, optimal: { low: 50, high: 100 } },
  { id: "ggt", name: "Gamma-Glutamyl Transferase", shortName: "GGT", unit: "U/L", category: "liver", standard: { low: 0, high: 65 }, optimal: { low: 10, high: 30 }, aliases: ["Gamma GT"] },
  { id: "bilirubin_total", name: "Total Bilirubin", unit: "mg/dL", category: "liver", standard: { low: 0.1, high: 1.2 }, optimal: { low: 0.2, high: 1.0 } },
  { id: "bilirubin_direct", name: "Direct Bilirubin", unit: "mg/dL", category: "liver", standard: { low: 0, high: 0.3 }, optimal: { low: 0, high: 0.2 } },
  { id: "albumin", name: "Albumin", unit: "g/dL", category: "liver", standard: { low: 3.5, high: 5.5 }, optimal: { low: 4.2, high: 5.0 } },
  { id: "total_protein", name: "Total Protein", unit: "g/dL", category: "liver", standard: { low: 6.0, high: 8.3 }, optimal: { low: 6.5, high: 7.8 } },
  { id: "globulin", name: "Globulin", unit: "g/dL", category: "liver", standard: { low: 2.0, high: 3.5 }, optimal: { low: 2.2, high: 3.2 } },
  { id: "ag_ratio", name: "Albumin/Globulin Ratio", shortName: "A/G", unit: "ratio", category: "liver", standard: { low: 1.0, high: 2.5 }, optimal: { low: 1.2, high: 2.0 } },

  // ---- Kidney Function ----
  { id: "bun", name: "Blood Urea Nitrogen", shortName: "BUN", unit: "mg/dL", category: "kidney", standard: { low: 7, high: 20 }, optimal: { low: 10, high: 18 }, aliases: ["Urea Nitrogen"] },
  { id: "creatinine", name: "Creatinine", unit: "mg/dL", category: "kidney", standard: { low: 0.7, high: 1.3 }, optimal: { low: 0.8, high: 1.1 } },
  { id: "bun_creatinine_ratio", name: "BUN/Creatinine Ratio", unit: "ratio", category: "kidney", standard: { low: 10, high: 20 }, optimal: { low: 12, high: 18 } },
  { id: "egfr", name: "Estimated GFR", shortName: "eGFR", unit: "mL/min/1.73m2", category: "kidney", standard: { low: 90, high: 200 }, optimal: { low: 100, high: 200 }, description: "Higher is better; <60 indicates kidney disease" },
  { id: "uric_acid", name: "Uric Acid", unit: "mg/dL", category: "kidney", standard: { low: 3.5, high: 7.2 }, optimal: { low: 3.5, high: 5.5 } },

  // ---- Electrolytes ----
  { id: "sodium", name: "Sodium", shortName: "Na", unit: "mEq/L", category: "electrolytes", standard: { low: 136, high: 145 }, optimal: { low: 138, high: 142 } },
  { id: "potassium", name: "Potassium", shortName: "K", unit: "mEq/L", category: "electrolytes", standard: { low: 3.5, high: 5.0 }, optimal: { low: 4.0, high: 4.8 } },
  { id: "chloride", name: "Chloride", shortName: "Cl", unit: "mEq/L", category: "electrolytes", standard: { low: 98, high: 106 }, optimal: { low: 100, high: 104 } },
  { id: "co2", name: "Carbon Dioxide", shortName: "CO2", unit: "mEq/L", category: "electrolytes", standard: { low: 21, high: 32 }, optimal: { low: 23, high: 29 }, aliases: ["Bicarbonate", "HCO3"] },
  { id: "calcium", name: "Calcium", shortName: "Ca", unit: "mg/dL", category: "electrolytes", standard: { low: 8.6, high: 10.2 }, optimal: { low: 9.2, high: 10.0 } },
  { id: "phosphorus", name: "Phosphorus", unit: "mg/dL", category: "electrolytes", standard: { low: 2.5, high: 4.5 }, optimal: { low: 3.0, high: 4.0 } },
  { id: "magnesium", name: "Magnesium", shortName: "Mg", unit: "mg/dL", category: "electrolytes", standard: { low: 1.7, high: 2.2 }, optimal: { low: 2.0, high: 2.2 } },
  { id: "anion_gap", name: "Anion Gap", unit: "mEq/L", category: "electrolytes", standard: { low: 3, high: 12 }, optimal: { low: 6, high: 11 } },

  // ---- Thyroid ----
  { id: "tsh", name: "Thyroid Stimulating Hormone", shortName: "TSH", unit: "uIU/mL", category: "thyroid", standard: { low: 0.45, high: 4.5 }, optimal: { low: 1.0, high: 2.5 } },
  { id: "free_t4", name: "Free Thyroxine", shortName: "Free T4", unit: "ng/dL", category: "thyroid", standard: { low: 0.8, high: 1.8 }, optimal: { low: 1.0, high: 1.5 }, aliases: ["FT4"] },
  { id: "free_t3", name: "Free Triiodothyronine", shortName: "Free T3", unit: "pg/mL", category: "thyroid", standard: { low: 2.0, high: 4.4 }, optimal: { low: 3.0, high: 4.0 }, aliases: ["FT3"] },

  // ---- Hormones ----
  { id: "testosterone_total", name: "Total Testosterone", unit: "ng/dL", category: "hormones", standard: { low: 264, high: 916 }, optimal: { low: 500, high: 900 }, aliases: ["Testosterone"] },
  { id: "testosterone_free", name: "Free Testosterone", unit: "pg/mL", category: "hormones", standard: { low: 8.7, high: 25.1 }, optimal: { low: 15, high: 25 } },
  { id: "dhea_s", name: "DHEA-Sulfate", shortName: "DHEA-S", unit: "ug/dL", category: "hormones", standard: { low: 138, high: 475 }, optimal: { low: 200, high: 400 } },
  { id: "cortisol", name: "Cortisol", unit: "ug/dL", category: "hormones", standard: { low: 6.2, high: 19.4 }, optimal: { low: 8, high: 15 }, description: "AM cortisol" },
  { id: "estradiol", name: "Estradiol", shortName: "E2", unit: "pg/mL", category: "hormones", standard: { low: 11, high: 44 }, optimal: { low: 20, high: 35 }, description: "Male reference range" },
  { id: "shbg", name: "Sex Hormone Binding Globulin", shortName: "SHBG", unit: "nmol/L", category: "hormones", standard: { low: 10, high: 57 }, optimal: { low: 20, high: 50 } },
  { id: "psa", name: "Prostate Specific Antigen", shortName: "PSA", unit: "ng/mL", category: "hormones", standard: { low: 0, high: 4.0 }, optimal: { low: 0, high: 1.5 } },

  // ---- Iron Studies ----
  { id: "iron", name: "Iron", shortName: "Fe", unit: "ug/dL", category: "iron", standard: { low: 60, high: 170 }, optimal: { low: 80, high: 150 } },
  { id: "ferritin", name: "Ferritin", unit: "ng/mL", category: "iron", standard: { low: 30, high: 400 }, optimal: { low: 50, high: 200 } },
  { id: "tibc", name: "Total Iron Binding Capacity", shortName: "TIBC", unit: "ug/dL", category: "iron", standard: { low: 250, high: 400 }, optimal: { low: 270, high: 370 } },
  { id: "transferrin_sat", name: "Transferrin Saturation", unit: "%", category: "iron", standard: { low: 20, high: 50 }, optimal: { low: 25, high: 40 }, aliases: ["Iron Saturation", "TSAT"] },

  // ---- Vitamins ----
  { id: "vitamin_d", name: "Vitamin D, 25-Hydroxy", shortName: "Vit D", unit: "ng/mL", category: "vitamins", standard: { low: 30, high: 100 }, optimal: { low: 50, high: 80 }, aliases: ["25-OH Vitamin D", "Calcidiol"] },
  { id: "vitamin_b12", name: "Vitamin B12", unit: "pg/mL", category: "vitamins", standard: { low: 200, high: 900 }, optimal: { low: 500, high: 800 }, aliases: ["Cobalamin"] },
  { id: "folate", name: "Folate", unit: "ng/mL", category: "vitamins", standard: { low: 3.0, high: 20.0 }, optimal: { low: 10, high: 20 }, aliases: ["Folic Acid"] },

  // ---- Inflammation ----
  { id: "crp", name: "C-Reactive Protein", shortName: "CRP", unit: "mg/L", category: "inflammation", standard: { low: 0, high: 3.0 }, optimal: { low: 0, high: 1.0 }, aliases: ["hs-CRP", "High-Sensitivity CRP"] },
  { id: "esr", name: "Erythrocyte Sedimentation Rate", shortName: "ESR", unit: "mm/hr", category: "inflammation", standard: { low: 0, high: 15 }, optimal: { low: 0, high: 5 }, aliases: ["Sed Rate"] },
  { id: "homocysteine", name: "Homocysteine", unit: "umol/L", category: "inflammation", standard: { low: 5, high: 15 }, optimal: { low: 6, high: 9 } },

  // ---- Coagulation ----
  { id: "pt", name: "Prothrombin Time", shortName: "PT", unit: "seconds", category: "coagulation", standard: { low: 11, high: 13.5 } },
  { id: "inr", name: "International Normalized Ratio", shortName: "INR", unit: "ratio", category: "coagulation", standard: { low: 0.8, high: 1.1 }, description: "Target 2.0-3.0 if on warfarin" },
  { id: "ptt", name: "Partial Thromboplastin Time", shortName: "PTT", unit: "seconds", category: "coagulation", standard: { low: 25, high: 35 }, aliases: ["aPTT"] },

  // ---- Cardiac ----
  { id: "bnp", name: "B-type Natriuretic Peptide", shortName: "BNP", unit: "pg/mL", category: "cardiac", standard: { low: 0, high: 100 }, optimal: { low: 0, high: 50 } },
  { id: "troponin", name: "Troponin I", unit: "ng/mL", category: "cardiac", standard: { low: 0, high: 0.04 }, description: "Should be near zero; elevation suggests cardiac injury" },

  // ---- Tumor Markers ----
  { id: "dr70", name: "DR-70 (FDP)", unit: "ug/mL", category: "tumor_markers", standard: { low: 0, high: 0.4 }, description: "Fibrin degradation product; screens for tumor activity" },
  { id: "cea", name: "Carcinoembryonic Antigen", shortName: "CEA", unit: "ng/mL", category: "tumor_markers", standard: { low: 0, high: 3.0 }, optimal: { low: 0, high: 2.5 } },
  { id: "afp", name: "Alpha-Fetoprotein", shortName: "AFP", unit: "ng/mL", category: "tumor_markers", standard: { low: 0, high: 10 } },

  // ---- Immune ----
  { id: "igg", name: "Immunoglobulin G", shortName: "IgG", unit: "mg/dL", category: "immune", standard: { low: 700, high: 1600 } },
  { id: "iga", name: "Immunoglobulin A", shortName: "IgA", unit: "mg/dL", category: "immune", standard: { low: 70, high: 400 } },
  { id: "igm", name: "Immunoglobulin M", shortName: "IgM", unit: "mg/dL", category: "immune", standard: { low: 40, high: 230 } },

  // ---- Minerals ----
  { id: "zinc", name: "Zinc", unit: "ug/dL", category: "minerals", standard: { low: 60, high: 120 }, optimal: { low: 80, high: 110 } },
  { id: "copper", name: "Copper", unit: "ug/dL", category: "minerals", standard: { low: 72, high: 166 }, optimal: { low: 80, high: 130 } },
  { id: "selenium", name: "Selenium", unit: "ug/L", category: "minerals", standard: { low: 70, high: 150 }, optimal: { low: 100, high: 140 } },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const byId = new Map<string, BiomarkerMeta>();
const byAlias = new Map<string, BiomarkerMeta>();

function ensureIndexed() {
  if (byId.size > 0) return;
  for (const m of BIOMARKERS) {
    byId.set(m.id, m);
    byId.set(m.name.toLowerCase(), m);
    if (m.shortName) byId.set(m.shortName.toLowerCase(), m);
    for (const a of m.aliases ?? []) {
      byAlias.set(a.toLowerCase(), m);
    }
  }
}

/** Find a marker by id, name, shortName, or alias (case-insensitive). */
export function findBiomarker(query: string): BiomarkerMeta | undefined {
  ensureIndexed();
  const q = query.toLowerCase().trim();
  return byId.get(q) ?? byAlias.get(q);
}

/** Get a marker by its canonical id. */
export function getBiomarkerById(id: string): BiomarkerMeta | undefined {
  ensureIndexed();
  return byId.get(id);
}

/** Get all markers in a category. */
export function getMarkersByCategory(category: BiomarkerCategory): BiomarkerMeta[] {
  return BIOMARKERS.filter((m) => m.category === category);
}

// ---------------------------------------------------------------------------
// Status calculation
// ---------------------------------------------------------------------------

/**
 * Determine the status tier for a reading given its marker metadata.
 * Priority: optimal (green) > standard/normal (blue) > attention (yellow) > out_of_range (red)
 */
export function calcStatus(value: number, meta: BiomarkerMeta): BiomarkerStatus {
  // Out of standard range entirely
  if (value < meta.standard.low || value > meta.standard.high) {
    return "out_of_range";
  }

  // Within standard but no optimal defined - normal
  if (!meta.optimal) {
    return "normal";
  }

  // Within optimal
  if (value >= meta.optimal.low && value <= meta.optimal.high) {
    return "optimal";
  }

  // Within standard but outside optimal - needs attention
  // However, if the value is only slightly outside optimal, call it normal
  const standardSpan = meta.standard.high - meta.standard.low;
  const lowDelta = meta.optimal.low - value;
  const highDelta = value - meta.optimal.high;
  const deviation = Math.max(lowDelta, highDelta);
  const deviationPct = standardSpan > 0 ? deviation / standardSpan : 0;

  // If less than 10% deviation from optimal within standard range, still "normal"
  if (deviationPct < 0.1) {
    return "normal";
  }

  return "attention";
}

/**
 * Determine trend direction from a series of readings (oldest first).
 * Requires at least 2 data points. Pass biomarkerId for optimal-midpoint comparison.
 */
export function calcTrend(readings: BiomarkerReading[], biomarkerId?: string): "improving" | "stable" | "declining" | "insufficient_data" {
  if (readings.length < 2) return "insufficient_data";

  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Handle zero baseline - any movement from 0 is significant
  const changePct = first.value !== 0
    ? Math.abs(last.value - first.value) / Math.abs(first.value)
    : last.value !== 0 ? 1 : 0;

  // Less than 5% change is stable
  if (changePct < 0.05) return "stable";

  // Determine if movement is toward or away from optimal/normal
  const statusFirst = first.status;
  const statusLast = last.status;

  const statusRank: Record<BiomarkerStatus, number> = {
    optimal: 0,
    normal: 1,
    attention: 2,
    out_of_range: 3,
  };

  if (statusRank[statusLast] < statusRank[statusFirst]) return "improving";
  if (statusRank[statusLast] > statusRank[statusFirst]) return "declining";

  // Same status tier but value changed - use direction relative to optimal midpoint
  const meta = biomarkerId ? getBiomarkerById(biomarkerId) : undefined;
  if (meta?.optimal) {
    const optMid = (meta.optimal.low + meta.optimal.high) / 2;
    const distFirst = Math.abs(first.value - optMid);
    const distLast = Math.abs(last.value - optMid);
    if (distLast < distFirst) return "improving";
    if (distLast > distFirst) return "declining";
  }

  return "stable";
}

// ---------------------------------------------------------------------------
// Grade calculation
// ---------------------------------------------------------------------------

export type LetterGrade = "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "D";

export interface GradeResult {
  letter: LetterGrade;
  score: number; // 0-100
  color: string;
}

const GRADE_THRESHOLDS: { min: number; letter: LetterGrade; color: string }[] = [
  { min: 93, letter: "A",  color: "#22c55e" },
  { min: 85, letter: "A-", color: "#4ade80" },
  { min: 78, letter: "B+", color: "#86efac" },
  { min: 70, letter: "B",  color: "#3b82f6" },
  { min: 62, letter: "B-", color: "#60a5fa" },
  { min: 53, letter: "C+", color: "#eab308" },
  { min: 40, letter: "C",  color: "#f59e0b" },
  { min: 0,  letter: "D",  color: "#ef4444" },
];

const STATUS_WEIGHT: Record<BiomarkerStatus, number> = {
  optimal: 100,
  normal: 75,
  attention: 40,
  out_of_range: 0,
};

/**
 * Calculate a letter grade from a status breakdown.
 * Weighted average: optimal=100, normal=75, attention=40, out_of_range=0.
 */
export function calcGrade(breakdown: Record<BiomarkerStatus, number>): GradeResult {
  const total = breakdown.optimal + breakdown.normal + breakdown.attention + breakdown.out_of_range;
  if (total === 0) return { letter: "B", score: 70, color: "#3b82f6" };

  const score = Math.round(
    (breakdown.optimal * STATUS_WEIGHT.optimal +
      breakdown.normal * STATUS_WEIGHT.normal +
      breakdown.attention * STATUS_WEIGHT.attention +
      breakdown.out_of_range * STATUS_WEIGHT.out_of_range) /
      total,
  );

  const grade = GRADE_THRESHOLDS.find((g) => score >= g.min) ?? GRADE_THRESHOLDS[GRADE_THRESHOLDS.length - 1];
  return { letter: grade.letter, score, color: grade.color };
}
