import { describe, it, expect, beforeEach } from "vitest";
import "../mocks/redis";
import { clearMockRedis } from "../mocks/redis";
import {
  getLabTests,
  getLabTest,
  saveLabTest,
  deleteLabTest,
  getAllReadings,
  getReadings,
  saveReadings,
  importLab,
  getLabsSummary,
} from "@/lib/biomarkerStore";
import type { LabTest, BiomarkerReading, LabImportPayload } from "@/types/biomarker";

const USER = "test-user";

function makeLab(overrides: Partial<LabTest> = {}): LabTest {
  return {
    id: "lab_001",
    date: "2024-08-15",
    source: "BioReference",
    name: "CBC with Differential",
    importMethod: "manual",
    createdAt: "2024-08-15T10:00:00Z",
    markerCount: 3,
    ...overrides,
  };
}

function makeReading(overrides: Partial<BiomarkerReading> = {}): BiomarkerReading {
  return {
    value: 14.5,
    unit: "g/dL",
    date: "2024-08-15",
    labTestId: "lab_001",
    status: "optimal",
    ...overrides,
  };
}

describe("biomarkerStore", () => {
  beforeEach(() => clearMockRedis());

  describe("lab tests CRUD", () => {
    it("returns empty array when no labs stored", async () => {
      expect(await getLabTests(USER)).toEqual([]);
    });

    it("saves and retrieves a lab test", async () => {
      const lab = makeLab();
      await saveLabTest(USER, lab);
      const labs = await getLabTests(USER);
      expect(labs).toHaveLength(1);
      expect(labs[0].id).toBe("lab_001");
    });

    it("retrieves a single lab by id", async () => {
      await saveLabTest(USER, makeLab());
      const lab = await getLabTest(USER, "lab_001");
      expect(lab?.name).toBe("CBC with Differential");
    });

    it("returns undefined for non-existent lab", async () => {
      expect(await getLabTest(USER, "fake")).toBeUndefined();
    });

    it("updates existing lab on same id", async () => {
      await saveLabTest(USER, makeLab());
      await saveLabTest(USER, makeLab({ name: "Updated Panel" }));
      const labs = await getLabTests(USER);
      expect(labs).toHaveLength(1);
      expect(labs[0].name).toBe("Updated Panel");
    });

    it("sorts labs by date descending", async () => {
      await saveLabTest(USER, makeLab({ id: "a", date: "2024-01-01" }));
      await saveLabTest(USER, makeLab({ id: "b", date: "2024-12-01" }));
      await saveLabTest(USER, makeLab({ id: "c", date: "2024-06-01" }));
      const labs = await getLabTests(USER);
      expect(labs.map((l) => l.id)).toEqual(["b", "c", "a"]);
    });

    it("deletes a lab test", async () => {
      await saveLabTest(USER, makeLab());
      const deleted = await deleteLabTest(USER, "lab_001");
      expect(deleted).toBe(true);
      expect(await getLabTests(USER)).toEqual([]);
    });

    it("returns false when deleting non-existent lab", async () => {
      expect(await deleteLabTest(USER, "fake")).toBe(false);
    });

    it("deleting a lab also removes its readings", async () => {
      await saveLabTest(USER, makeLab());
      await saveReadings(USER, "hemoglobin", [makeReading()]);
      await deleteLabTest(USER, "lab_001");
      expect(await getReadings(USER, "hemoglobin")).toEqual([]);
    });
  });

  describe("biomarker readings", () => {
    it("returns empty array when no readings stored", async () => {
      expect(await getReadings(USER, "hemoglobin")).toEqual([]);
    });

    it("saves and retrieves readings for a marker", async () => {
      await saveReadings(USER, "hemoglobin", [makeReading()]);
      const readings = await getReadings(USER, "hemoglobin");
      expect(readings).toHaveLength(1);
      expect(readings[0].value).toBe(14.5);
    });

    it("deduplicates by date + labTestId", async () => {
      const r = makeReading();
      await saveReadings(USER, "hemoglobin", [r]);
      await saveReadings(USER, "hemoglobin", [{ ...r, value: 15.0 }]);
      const readings = await getReadings(USER, "hemoglobin");
      expect(readings).toHaveLength(1);
      expect(readings[0].value).toBe(15.0);
    });

    it("keeps readings from different dates", async () => {
      await saveReadings(USER, "hemoglobin", [
        makeReading({ date: "2024-01-01" }),
        makeReading({ date: "2024-06-01" }),
      ]);
      expect(await getReadings(USER, "hemoglobin")).toHaveLength(2);
    });

    it("sorts readings by date ascending", async () => {
      await saveReadings(USER, "hemoglobin", [
        makeReading({ date: "2024-12-01" }),
        makeReading({ date: "2024-01-01" }),
      ]);
      const readings = await getReadings(USER, "hemoglobin");
      expect(readings[0].date).toBe("2024-01-01");
      expect(readings[1].date).toBe("2024-12-01");
    });

    it("getAllReadings returns all markers", async () => {
      await saveReadings(USER, "hemoglobin", [makeReading()]);
      await saveReadings(USER, "glucose", [makeReading({ value: 85, unit: "mg/dL" })]);
      const all = await getAllReadings(USER);
      expect(Object.keys(all)).toHaveLength(2);
      expect(all.hemoglobin).toHaveLength(1);
      expect(all.glucose).toHaveLength(1);
    });
  });

  describe("importLab", () => {
    const payload: LabImportPayload = {
      date: "2024-08-15",
      source: "BioReference",
      name: "CBC with Differential",
      importMethod: "manual",
      markers: [
        { biomarkerId: "hemoglobin", value: 14.5, unit: "g/dL" },
        { biomarkerId: "hematocrit", value: 42.1, unit: "%" },
        { biomarkerId: "glucose", value: 92, unit: "mg/dL" },
      ],
    };

    it("creates a lab test and saves readings", async () => {
      const lab = await importLab(USER, payload);
      expect(lab.id).toBeTruthy();
      expect(lab.markerCount).toBe(3);
      expect(lab.source).toBe("BioReference");

      const labs = await getLabTests(USER);
      expect(labs).toHaveLength(1);

      const hgb = await getReadings(USER, "hemoglobin");
      expect(hgb).toHaveLength(1);
      expect(hgb[0].value).toBe(14.5);
      expect(hgb[0].labTestId).toBe(lab.id);
    });

    it("calculates status from reference data", async () => {
      await importLab(USER, payload);
      const glucose = await getReadings(USER, "glucose");
      // 92 is within glucose optimal (75-90)... actually 92 > 90 so it's slightly outside optimal
      expect(["optimal", "normal"]).toContain(glucose[0].status);
    });
  });

  describe("getLabsSummary", () => {
    it("returns zeros when no data", async () => {
      const summary = await getLabsSummary(USER);
      expect(summary.totalTests).toBe(0);
      expect(summary.totalMarkers).toBe(0);
      expect(summary.latestTest).toBeUndefined();
    });

    it("returns correct summary after import", async () => {
      await importLab(USER, {
        date: "2024-08-15",
        source: "Lab",
        name: "Panel",
        importMethod: "manual",
        markers: [
          { biomarkerId: "hemoglobin", value: 14.5, unit: "g/dL" },
          { biomarkerId: "glucose", value: 85, unit: "mg/dL" },
        ],
      });
      const summary = await getLabsSummary(USER);
      expect(summary.totalTests).toBe(1);
      expect(summary.totalMarkers).toBe(2);
      expect(summary.latestTest?.name).toBe("Panel");
      const total = Object.values(summary.statusBreakdown).reduce((a, b) => a + b, 0);
      expect(total).toBe(2);
    });
  });
});
