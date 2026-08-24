"use client";

import type { RecoveryEntry, RecoveryData } from "@/types/workout";

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type DataEntry = { value: number | null; source: "oura" | "eightSleep" | null };

function extractMetric(
  days: string[],
  data: RecoveryData,
  ouraField: (e: NonNullable<RecoveryEntry["oura"]>) => number | undefined,
  eightSleepField: (e: NonNullable<RecoveryEntry["eightSleep"]>) => number | undefined,
): DataEntry[] {
  return days.map((date) => {
    const entry = data[date];
    if (!entry) return { value: null, source: null };
    const ouraVal = entry.oura ? ouraField(entry.oura) : undefined;
    if (ouraVal != null) return { value: ouraVal, source: "oura" as const };
    const esVal = entry.eightSleep ? eightSleepField(entry.eightSleep) : undefined;
    if (esVal != null) return { value: esVal, source: "eightSleep" as const };
    return { value: null, source: null };
  });
}

function TrendChart({ label, unit, entries, heightFn, colorFn }: {
  label: string;
  unit?: string;
  entries: DataEntry[];
  heightFn: (v: number) => string;
  colorFn: (v: number) => string;
}) {
  const values = entries.map((e) => e.value);
  if (!values.some((v) => v !== null)) return null;
  const latest = values.filter((v): v is number => v !== null).slice(-1)[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-content-secondary">{label}</span>
        <span className="text-xs tabular-nums text-content-muted">
          {latest ?? "---"}{unit ?? ""}
        </span>
      </div>
      <div className="flex items-end gap-[2px] h-12">
        {entries.map((entry, i) => {
          const v = entry.value;
          return (
            <div key={i} className="flex-1 rounded-t-sm transition-all" style={{
              height: v ? heightFn(v) : "4px",
              backgroundColor: v ? colorFn(v) : "var(--bg-elevated)",
              opacity: v ? 1 : 0.3,
              borderBottom: entry.source === "eightSleep" && v ? "2px solid #6366f1" : undefined,
            }} />
          );
        })}
      </div>
    </div>
  );
}

export function RecoveryHistory({ data }: { data: RecoveryData }) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return localDateKey(d);
  });

  const scoreEntries = extractMetric(days, data, (o) => o.readinessScore, (e) => e.sleepFitnessScore);
  const hrvEntries = extractMetric(days, data, (o) => o.hrv, (e) => e.hrv);
  const rhrEntries = extractMetric(days, data, (o) => o.rhr, (e) => e.rhr);

  const allEntries = [scoreEntries, hrvEntries, rhrEntries];
  const hasAnyData = allEntries.some((entries) => entries.some((e) => e.value !== null));
  if (!hasAnyData) return null;

  const maxHrv = Math.max(...hrvEntries.map((e) => e.value).filter((v): v is number => v !== null), 80);
  const rhrValues = rhrEntries.map((e) => e.value).filter((v): v is number => v !== null);
  const maxRhr = Math.max(...rhrValues, 70);
  const minRhr = Math.min(...rhrValues, 40);

  const allSources = new Set(allEntries.flat().map((e) => e.source).filter(Boolean));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-content-secondary">
          14-Day Trends
        </p>
        {allSources.size > 0 && (
          <div className="flex items-center gap-2">
            {allSources.has("oura") && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium bg-surface-elevated text-content-muted">
                Oura
              </span>
            )}
            {allSources.has("eightSleep") && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium bg-surface-elevated text-content-muted">
                Eight Sleep
              </span>
            )}
          </div>
        )}
      </div>
      <div className="space-y-4">
        <TrendChart
          label="Recovery Score" entries={scoreEntries}
          heightFn={(v) => `${(v / 100) * 100}%`}
          colorFn={(v) => v >= 85 ? "var(--accent)" : v >= 70 ? "var(--warning)" : "var(--danger)"}
        />
        <TrendChart
          label="HRV" unit="ms" entries={hrvEntries}
          heightFn={(v) => `${(v / maxHrv) * 100}%`}
          colorFn={(v) => v >= 60 ? "var(--accent)" : v >= 40 ? "var(--warning)" : "var(--danger)"}
        />
        <TrendChart
          label="RHR" unit="bpm" entries={rhrEntries}
          heightFn={(v) => `${((v - minRhr + 5) / (maxRhr - minRhr + 10)) * 100}%`}
          colorFn={(v) => v <= 50 ? "var(--accent)" : v <= 65 ? "var(--warning)" : "var(--danger)"}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[11px] text-content-muted">14d ago</span>
        <div className="flex items-center gap-2">
          {allSources.size > 1 && (
            <span className="text-[11px] flex items-center gap-1 text-content-muted">
              <span className="inline-block w-2 h-[2px] rounded" style={{ background: "#6366f1" }} /> Eight Sleep
            </span>
          )}
          <span className="text-[11px] text-content-muted">Today</span>
        </div>
      </div>
    </div>
  );
}
