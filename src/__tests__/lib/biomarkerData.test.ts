import { describe, it, expect } from "vitest";
import {
  BIOMARKERS,
  CATEGORY_LABELS,
  findBiomarker,
  getBiomarkerById,
  getMarkersByCategory,
  calcStatus,
  calcTrend,
} from "@/lib/biomarkerData";
import type { BiomarkerReading } from "@/types/biomarker";

describe("biomarkerData", () => {
  describe("BIOMARKERS registry", () => {
    it("has 90+ markers", () => {
      expect(BIOMARKERS.length).toBeGreaterThanOrEqual(85);
    });

    it("every marker has required fields", () => {
      for (const m of BIOMARKERS) {
        expect(m.id).toBeTruthy();
        expect(m.name).toBeTruthy();
        expect(m.unit).toBeTruthy();
        expect(m.category).toBeTruthy();
        expect(m.standard.low).toBeLessThanOrEqual(m.standard.high);
        if (m.optimal) {
          expect(m.optimal.low).toBeLessThanOrEqual(m.optimal.high);
        }
      }
    });

    it("has no duplicate ids", () => {
      const ids = BIOMARKERS.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every category has a label", () => {
      const categories = new Set(BIOMARKERS.map((m) => m.category));
      for (const cat of categories) {
        expect(CATEGORY_LABELS[cat]).toBeTruthy();
      }
    });
  });

  describe("findBiomarker", () => {
    it("finds by id", () => {
      expect(findBiomarker("hemoglobin")?.id).toBe("hemoglobin");
    });

    it("finds by name (case-insensitive)", () => {
      expect(findBiomarker("Hemoglobin")?.id).toBe("hemoglobin");
    });

    it("finds by shortName", () => {
      expect(findBiomarker("Hgb")?.id).toBe("hemoglobin");
    });

    it("finds by alias", () => {
      expect(findBiomarker("SGPT")?.id).toBe("alt");
      expect(findBiomarker("LDL-C")?.id).toBe("ldl");
    });

    it("returns undefined for unknown marker", () => {
      expect(findBiomarker("nonexistent_marker_xyz")).toBeUndefined();
    });
  });

  describe("getBiomarkerById", () => {
    it("returns marker by canonical id", () => {
      const m = getBiomarkerById("glucose");
      expect(m?.name).toBe("Glucose");
      expect(m?.category).toBe("glucose");
    });
  });

  describe("getMarkersByCategory", () => {
    it("returns all CBC markers", () => {
      const cbc = getMarkersByCategory("cbc");
      expect(cbc.length).toBeGreaterThanOrEqual(10);
      expect(cbc.every((m) => m.category === "cbc")).toBe(true);
    });

    it("returns empty for category with no markers", () => {
      const none = getMarkersByCategory("other");
      expect(none).toEqual([]);
    });
  });

  describe("calcStatus", () => {
    const glucose = getBiomarkerById("glucose")!;

    it("returns optimal when in optimal range", () => {
      expect(calcStatus(82, glucose)).toBe("optimal");
    });

    it("returns normal when slightly outside optimal", () => {
      // glucose optimal is 75-90, standard 70-100
      // 72 is within standard, 3 below optimal low. deviation = 3/30 = 10%, borderline
      expect(calcStatus(70, glucose)).toBe("attention");
    });

    it("returns attention when within standard but far from optimal", () => {
      expect(calcStatus(98, glucose)).toBe("attention");
    });

    it("returns out_of_range when below standard", () => {
      expect(calcStatus(50, glucose)).toBe("out_of_range");
    });

    it("returns out_of_range when above standard", () => {
      expect(calcStatus(120, glucose)).toBe("out_of_range");
    });

    it("returns normal for markers without optimal range", () => {
      const pt = getBiomarkerById("pt")!;
      expect(calcStatus(12, pt)).toBe("normal");
    });
  });

  describe("calcTrend", () => {
    it("returns insufficient_data for < 2 readings", () => {
      expect(calcTrend([])).toBe("insufficient_data");
      expect(calcTrend([reading(80, "2024-01-01", "optimal")])).toBe("insufficient_data");
    });

    it("returns stable for minimal change", () => {
      expect(calcTrend([
        reading(80, "2024-01-01", "optimal"),
        reading(81, "2024-06-01", "optimal"),
      ])).toBe("stable");
    });

    it("returns improving when status gets better", () => {
      expect(calcTrend([
        reading(110, "2024-01-01", "out_of_range"),
        reading(85, "2024-06-01", "optimal"),
      ])).toBe("improving");
    });

    it("returns declining when status gets worse", () => {
      expect(calcTrend([
        reading(85, "2024-01-01", "optimal"),
        reading(110, "2024-06-01", "out_of_range"),
      ])).toBe("declining");
    });
  });
});

function reading(value: number, date: string, status: BiomarkerReading["status"]): BiomarkerReading {
  return { value, date, unit: "mg/dL", status };
}
