/**
 * Redis CRUD helpers for lab tests and biomarker readings.
 *
 * Keys:
 *   user:{userId}:labs       -> LabTest[]
 *   user:{userId}:biomarkers -> Record<string, BiomarkerReading[]>
 */

import { getRedis } from "./redis";
import { calcStatus } from "./biomarkerData";
import type {
  LabTest,
  BiomarkerReading,
  LabImportPayload,
  LabsSummary,
  BiomarkerStatus,
} from "@/types/biomarker";
import { getBiomarkerById } from "./biomarkerData";

function labsKey(userId: string) { return `user:${userId}:labs`; }
function markersKey(userId: string) { return `user:${userId}:biomarkers`; }

// ---------------------------------------------------------------------------
// Lab Tests
// ---------------------------------------------------------------------------

export async function getLabTests(userId: string): Promise<LabTest[]> {
  const redis = getRedis();
  const raw = await redis.get(labsKey(userId));
  if (!raw) return [];
  try { return JSON.parse(raw) as LabTest[]; } catch { return []; }
}

export async function getLabTest(userId: string, labId: string): Promise<LabTest | undefined> {
  const labs = await getLabTests(userId);
  return labs.find((l) => l.id === labId);
}

export async function saveLabTest(userId: string, lab: LabTest): Promise<void> {
  const redis = getRedis();
  const existing = await getLabTests(userId);
  const idx = existing.findIndex((l) => l.id === lab.id);
  if (idx >= 0) {
    existing[idx] = lab;
  } else {
    existing.push(lab);
  }
  // Sort by date descending (newest first)
  existing.sort((a, b) => b.date.localeCompare(a.date));
  await redis.set(labsKey(userId), JSON.stringify(existing));
}

export async function deleteLabTest(userId: string, labId: string): Promise<boolean> {
  const redis = getRedis();
  const existing = await getLabTests(userId);
  const filtered = existing.filter((l) => l.id !== labId);
  if (filtered.length === existing.length) return false;

  if (filtered.length === 0) {
    await redis.del(labsKey(userId));
  } else {
    await redis.set(labsKey(userId), JSON.stringify(filtered));
  }

  // Also remove readings tied to this lab test
  const allReadings = await getAllReadings(userId);
  let changed = false;
  for (const [biomarkerId, readings] of Object.entries(allReadings)) {
    const before = readings.length;
    allReadings[biomarkerId] = readings.filter((r) => r.labTestId !== labId);
    if (allReadings[biomarkerId].length !== before) changed = true;
    if (allReadings[biomarkerId].length === 0) delete allReadings[biomarkerId];
  }
  if (changed) {
    if (Object.keys(allReadings).length === 0) {
      await redis.del(markersKey(userId));
    } else {
      await redis.set(markersKey(userId), JSON.stringify(allReadings));
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Biomarker Readings
// ---------------------------------------------------------------------------

export async function getAllReadings(userId: string): Promise<Record<string, BiomarkerReading[]>> {
  const redis = getRedis();
  const raw = await redis.get(markersKey(userId));
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, BiomarkerReading[]>; } catch { return {}; }
}

export async function getReadings(userId: string, biomarkerId: string): Promise<BiomarkerReading[]> {
  const all = await getAllReadings(userId);
  return all[biomarkerId] ?? [];
}

export async function saveReadings(
  userId: string,
  biomarkerId: string,
  readings: BiomarkerReading[],
): Promise<void> {
  const redis = getRedis();
  const all = await getAllReadings(userId);
  const existing = all[biomarkerId] ?? [];

  // Merge: dedupe by date+labTestId
  const merged = [...existing];
  for (const r of readings) {
    const idx = merged.findIndex(
      (e) => e.date === r.date && e.labTestId === r.labTestId,
    );
    if (idx >= 0) {
      merged[idx] = r;
    } else {
      merged.push(r);
    }
  }

  // Sort by date ascending (oldest first for charting)
  merged.sort((a, b) => a.date.localeCompare(b.date));
  all[biomarkerId] = merged;
  await redis.set(markersKey(userId), JSON.stringify(all));
}

// ---------------------------------------------------------------------------
// Import a full lab test with markers
// ---------------------------------------------------------------------------

export async function importLab(userId: string, payload: LabImportPayload): Promise<LabTest> {
  const labId = `lab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const lab: LabTest = {
    id: labId,
    date: payload.date,
    source: payload.source,
    name: payload.name,
    importMethod: payload.importMethod,
    createdAt: new Date().toISOString(),
    markerCount: payload.markers.length,
    notes: payload.notes,
  };

  await saveLabTest(userId, lab);

  // Save each marker reading
  for (const marker of payload.markers) {
    const meta = getBiomarkerById(marker.biomarkerId);
    const status: BiomarkerStatus = meta
      ? calcStatus(marker.value, meta)
      : "normal";

    const reading: BiomarkerReading = {
      value: marker.value,
      unit: marker.unit,
      date: payload.date,
      labTestId: labId,
      status,
      flag: marker.flag,
      refRangeRaw: marker.refRangeRaw,
    };

    await saveReadings(userId, marker.biomarkerId, [reading]);
  }

  return lab;
}

// ---------------------------------------------------------------------------
// Summary / aggregation
// ---------------------------------------------------------------------------

export async function getLabsSummary(userId: string): Promise<LabsSummary> {
  const labs = await getLabTests(userId);
  const allReadings = await getAllReadings(userId);

  const totalMarkers = Object.values(allReadings).reduce(
    (sum, readings) => sum + readings.length,
    0,
  );

  const statusBreakdown: Record<BiomarkerStatus, number> = {
    optimal: 0,
    normal: 0,
    attention: 0,
    out_of_range: 0,
  };

  // Count latest reading per biomarker
  for (const readings of Object.values(allReadings)) {
    if (readings.length === 0) continue;
    const latest = readings[readings.length - 1]; // sorted ascending
    statusBreakdown[latest.status]++;
  }

  return {
    totalTests: labs.length,
    totalMarkers,
    latestTest: labs[0], // sorted descending
    statusBreakdown,
  };
}
