import { describe, it, expect } from "vitest";
import { getBiomarkerById, toCatalogValue } from "@/lib/biomarkerData";

const conv = (id: string, value: number, unit: string) => toCatalogValue(getBiomarkerById(id)!, value, unit);

describe("toCatalogValue: equivalent units pass through unchanged", () => {
  it.each([
    ["glucose", 90, "mg/dL"],
    ["glucose", 90, "MG/DL"],
    ["glucose", 90, ""],
    ["wbc", 6, "Thousand/uL"],
    ["wbc", 6, "10*3/uL"],
    ["rbc", 4.8, "Million/uL"],
    ["tsh", 2.1, "mIU/L"],
    ["ferritin", 80, "ug/L"],
    ["hba1c", 5.5, "% of total Hgb"],
    ["alt", 30, "IU/L"],
    ["sodium", 140, "mmol/L"],
    ["potassium", 4.2, "mmol/L"],
    ["chloride", 100, "mmol/L"],
    ["co2", 25, "mmol/L"],
    ["anion_gap", 10, "mmol/L"],
    ["wbc", 6, "x10E3/uL"],
    ["wbc", 6, "K/uL"],
    ["wbc", 6, "Thou/uL"],
    ["wbc", 6, "10^3/uL"],
    ["wbc", 6, "x10^3/µL"],
    ["rbc", 4.8, "x10E6/uL"],
    ["rbc", 4.8, "10^6/uL"],
    ["egfr", 95, "mL/min/1.73"],
    ["egfr", 95, "mL/min/1.73m2"],
    ["hematocrit", 44, "%"],
    ["chol_hdl_ratio", 3.2, ""],
    ["hematocrit", 44, ""],
  ])("%s %s %s", (id, v, unit) => {
    expect(conv(id, v, unit)).toBe(v);
  });
});

describe("toCatalogValue: conversions", () => {
  it.each([
    ["glucose", 5.0, "mmol/L", 90.08],
    ["total_cholesterol", 5.0, "mmol/L", 193.35],
    ["ldl", 3.0, "mmol/L", 116.01],
    ["hdl", 1.5, "mmol/L", 58.005],
    ["vldl", 0.5, "mmol/L", 19.335],
    ["triglycerides", 1.5, "mmol/L", 132.855],
    ["creatinine", 88.4, "umol/L", 1],
    ["creatinine", 88.4, "µmol/L", 1],
    ["bun", 5, "mmol/L", 14.005],
    ["uric_acid", 297.4, "umol/L", 5],
    ["calcium", 2.5, "mmol/L", 10.02],
    ["bilirubin_total", 17.1, "umol/L", 1],
    ["bilirubin_direct", 3.42, "umol/L", 0.2],
    ["hemoglobin", 150, "g/L", 15],
    ["mchc", 340, "g/L", 34],
    ["albumin", 45, "g/L", 4.5],
    ["total_protein", 70, "g/L", 7],
    ["globulin", 28, "g/L", 2.8],
    ["vitamin_d", 125, "nmol/L", 50.08],
    ["vitamin_b12", 300, "pmol/L", 406.5],
    ["folate", 22.66, "nmol/L", 10],
    ["testosterone_total", 20, "nmol/L", 576.8],
    ["estradiol", 110.13, "pmol/L", 30],
    ["cortisol", 275.9, "nmol/L", 10],
    ["iron", 20, "umol/L", 111.7],
    ["tibc", 50, "umol/L", 279.25],
    ["ferritin", 80, "ug/L", 80],
    ["free_t4", 12.87, "pmol/L", 1],
    ["hba1c", 37, "mmol/mol", 5.535],
  ])("%s %s %s -> %s", (id, v, unit, expected) => {
    expect(conv(id, v, unit)).toBeCloseTo(expected, 2);
  });

  it("rounds to 3 decimals", () => {
    expect(conv("glucose", 5.123, "mmol/L")).toBe(92.296);
  });
});

describe("toCatalogValue: anything else is null", () => {
  it.each([
    ["glucose", 5, "mmol/mol"],
    ["sodium", 140, "mg/dL"],
    ["tsh", 2, "mg/L"],
    ["chol_hdl_ratio", 3, "%"],
    ["hematocrit", 0.44, "L/L"],
    ["wbc", 6000, "/uL"],
  ])("%s %s %s", (id, v, unit) => {
    expect(conv(id, v, unit)).toBeNull();
  });
});
