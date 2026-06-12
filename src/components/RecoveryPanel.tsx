"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useWorkoutStore } from "@/hooks/useWorkoutStore";
import { useOuraSync, useOuraStatus } from "@/hooks/useConnectedAccounts";
import { useQueryClient } from "@tanstack/react-query";
import { getRecoveryLevel, todayKey } from "@/lib/helpers";
import type { RecoveryEntry } from "@/types/workout";

import { formatTimeAgo } from "@/components/recovery/formatTimeAgo";
import { ScreenshotUpload } from "@/components/recovery/ScreenshotUpload";
import { MetricInput, TextMetricInput, SelectMetricInput } from "@/components/recovery/MetricInputs";
import { RecoveryHistory } from "@/components/recovery/RecoveryHistory";
import { DateSelector, useDateOptions } from "@/components/recovery/DateSelector";
import { ExportButton } from "@/components/recovery/ExportButton";

export default function RecoveryPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const data = useWorkoutStore((s) => s.recoveryData);
  const mergeRecoveryData = useWorkoutStore((s) => s.mergeRecoveryData);
  const ouraLastSynced = useWorkoutStore((s) => s.ouraLastSynced);
  const eightSleepLastSynced = useWorkoutStore((s) => s.eightSleepLastSynced);
  const [selectedDate, setSelectedDate] = useState(todayKey());

  // Refresh server data + auto-sync Oura when panel opens.
  // V14: rate-limited to once per 5 min to match staleTime and cut bandwidth.
  const queryClient = useQueryClient();
  const ouraStatus = useOuraStatus();
  const ouraSync = useOuraSync();
  const lastSyncRef = useRef(0);
  useEffect(() => {
    if (!isOpen) return;
    if (Date.now() - lastSyncRef.current < 300_000) return;
    lastSyncRef.current = Date.now();
    queryClient.invalidateQueries({ queryKey: ["sync-data"] });
    // Also trigger Oura sync if connected
    if (ouraStatus.data?.connected) {
      ouraSync.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, ouraStatus.data?.connected]);

  const entry: RecoveryEntry = data[selectedDate] || { date: selectedDate };

  const updateEntry = useCallback((updater: (prev: RecoveryEntry) => RecoveryEntry) => {
    const currentData = useWorkoutStore.getState().recoveryData;
    const current = currentData[selectedDate] || { date: selectedDate };
    const updated = updater(current);
    mergeRecoveryData({ [selectedDate]: updated });
  }, [selectedDate, mergeRecoveryData]);

  const updateEightSleep = useCallback((field: string, value: unknown) => {
    updateEntry((prev) => ({
      ...prev,
      eightSleep: { ...prev.eightSleep, [field]: value },
    }));
  }, [updateEntry]);

  const updateOura = useCallback((field: string, value: unknown) => {
    updateEntry((prev) => ({
      ...prev,
      oura: { ...prev.oura, [field]: value },
    }));
  }, [updateEntry]);

  const handleEightSleepMetrics = useCallback((metrics: Record<string, unknown>) => {
    updateEntry((prev) => ({
      ...prev,
      eightSleep: {
        ...prev.eightSleep,
        ...(metrics.sleepFitnessScore != null && { sleepFitnessScore: metrics.sleepFitnessScore as number }),
        ...(metrics.hrv != null && { hrv: metrics.hrv as number }),
        ...(metrics.rhr != null && { rhr: metrics.rhr as number }),
        ...(metrics.deepSleepPct != null && { deepSleepPct: metrics.deepSleepPct as number }),
        ...(metrics.remSleepPct != null && { remSleepPct: metrics.remSleepPct as number }),
        ...(metrics.timeSlept != null && { timeSlept: metrics.timeSlept as string }),
      },
    }));
  }, [updateEntry]);

  const handleOuraMetrics = useCallback((metrics: Record<string, unknown>) => {
    updateEntry((prev) => ({
      ...prev,
      oura: {
        ...prev.oura,
        ...(metrics.readinessScore != null && { readinessScore: metrics.readinessScore as number }),
        ...(metrics.sleepScore != null && { sleepScore: metrics.sleepScore as number }),
        ...(metrics.totalSleep != null && { totalSleep: metrics.totalSleep as string }),
        ...(metrics.efficiency != null && { efficiency: metrics.efficiency as number }),
        ...(metrics.restfulness != null && { restfulness: metrics.restfulness as string }),
        ...(metrics.remSleep != null && { remSleep: metrics.remSleep as string }),
        ...(metrics.remSleepPct != null && { remSleepPct: metrics.remSleepPct as number }),
        ...(metrics.deepSleep != null && { deepSleep: metrics.deepSleep as string }),
        ...(metrics.deepSleepPct != null && { deepSleepPct: metrics.deepSleepPct as number }),
        ...(metrics.latency != null && { latency: metrics.latency as number }),
        ...(metrics.timing != null && { timing: metrics.timing as string }),
        ...(metrics.hrv != null && { hrv: metrics.hrv as number }),
        ...(metrics.rhr != null && { rhr: metrics.rhr as number }),
        ...(metrics.bodyTemp != null && { bodyTemp: metrics.bodyTemp as number }),
        ...(metrics.averageHR != null && { averageHR: metrics.averageHR as number }),
        ...(metrics.respiratoryRate != null && { respiratoryRate: metrics.respiratoryRate as number }),
        ...(metrics.spo2 != null && { spo2: metrics.spo2 as number }),
        ...(metrics.lightSleep != null && { lightSleep: metrics.lightSleep as string }),
        ...(metrics.lightSleepPct != null && { lightSleepPct: metrics.lightSleepPct as number }),
        ...(metrics.awakeTime != null && { awakeTime: metrics.awakeTime as string }),
        ...(metrics.timeInBed != null && { timeInBed: metrics.timeInBed as string }),
      },
    }));
  }, [updateEntry]);

  const level = getRecoveryLevel(entry);
  const recentDates = useDateOptions();

  return (
    <Sheet open={isOpen} onClose={onClose} title="Recovery" subtitle={
      ouraSync.isPending ? "Syncing Oura data..." : ouraSync.isError ? "Sync failed - tap to retry" : "Eight Sleep + Oura Data"
    }>
      <DateSelector dates={recentDates} selectedDate={selectedDate} onSelect={setSelectedDate} />

      {/* Recovery status */}
      <div className="px-5 py-3">
        <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "var(--bg-elevated)" }}>
          <span className="text-3xl">{level.emoji}</span>
          <div>
            <p className="text-sm font-bold" style={{ color: level.color }}>{level.label}</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{level.advice}</p>
          </div>
        </div>
      </div>

      <div className="px-5 pb-6 space-y-6">
        <RecoveryHistory data={data} />

        {/* Last synced timestamps */}
        {(ouraLastSynced || eightSleepLastSynced) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1" aria-live="polite">
            {ouraLastSynced && (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Oura synced {formatTimeAgo(ouraLastSynced)}
              </span>
            )}
            {eightSleepLastSynced && (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Eight Sleep synced {formatTimeAgo(eightSleepLastSynced)}
              </span>
            )}
          </div>
        )}

        {/* Eight Sleep Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🛏️</span>
            <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Eight Sleep</h3>
          </div>

          <ScreenshotUpload
            label="Eight Sleep"
            source="eightSleep"
            currentUrl={entry.eightSleep?.screenshotDataUrl}
            onUpload={(url) => updateEightSleep("screenshotDataUrl", url)}
            onClear={() => updateEightSleep("screenshotDataUrl", undefined)}
            onMetricsExtracted={handleEightSleepMetrics}
          />

          <div className="mt-3 rounded-xl border divide-y" style={{ borderColor: "var(--border)" }}>
            <div className="px-3"><MetricInput label="Sleep Fitness Score" value={entry.eightSleep?.sleepFitnessScore} onChange={(v) => updateEightSleep("sleepFitnessScore", v)} placeholder="86" min={0} max={100} /></div>
            <div className="px-3"><MetricInput label="HRV" value={entry.eightSleep?.hrv} onChange={(v) => updateEightSleep("hrv", v)} unit="ms" placeholder="36" /></div>
            <div className="px-3"><MetricInput label="RHR" value={entry.eightSleep?.rhr} onChange={(v) => updateEightSleep("rhr", v)} unit="bpm" placeholder="61" /></div>
            <div className="px-3"><MetricInput label="Deep Sleep %" value={entry.eightSleep?.deepSleepPct} onChange={(v) => updateEightSleep("deepSleepPct", v)} unit="%" placeholder="14" /></div>
            <div className="px-3"><MetricInput label="REM Sleep %" value={entry.eightSleep?.remSleepPct} onChange={(v) => updateEightSleep("remSleepPct", v)} unit="%" placeholder="35" /></div>
          </div>
        </div>

        {/* Oura Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">💍</span>
            <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Oura Ring</h3>
          </div>

          <ScreenshotUpload
            label="Oura"
            source="oura"
            currentUrl={entry.oura?.screenshotDataUrl}
            onUpload={(url) => updateOura("screenshotDataUrl", url)}
            onClear={() => updateOura("screenshotDataUrl", undefined)}
            onMetricsExtracted={handleOuraMetrics}
          />

          <div className="mt-3 rounded-xl border divide-y" style={{ borderColor: "var(--border)" }}>
            <div className="px-3"><MetricInput label="Readiness Score" value={entry.oura?.readinessScore} onChange={(v) => updateOura("readinessScore", v)} placeholder="82" min={0} max={100} /></div>
            <div className="px-3"><MetricInput label="Sleep Score" value={entry.oura?.sleepScore} onChange={(v) => updateOura("sleepScore", v)} placeholder="88" min={0} max={100} /></div>
          </div>

          <p className="text-xs font-semibold tracking-wide mt-4 mb-2" style={{ color: "var(--text-muted)" }}>Contributors</p>
          <div className="rounded-xl border divide-y" style={{ borderColor: "var(--border)" }}>
            <div className="px-3"><TextMetricInput label="Total Sleep" value={entry.oura?.totalSleep} onChange={(v) => updateOura("totalSleep", v)} placeholder="8h 21m" /></div>
            <div className="px-3"><MetricInput label="Efficiency" value={entry.oura?.efficiency} onChange={(v) => updateOura("efficiency", v)} unit="%" placeholder="89" min={0} max={100} /></div>
            <div className="px-3"><SelectMetricInput label="Restfulness" value={entry.oura?.restfulness} onChange={(v) => updateOura("restfulness", v)} options={["Optimal", "Good", "Pay attention"]} /></div>
            <div className="px-3"><TextMetricInput label="REM Sleep" value={entry.oura?.remSleep} onChange={(v) => updateOura("remSleep", v)} placeholder="2h 46m" /></div>
            <div className="px-3"><MetricInput label="REM %" value={entry.oura?.remSleepPct} onChange={(v) => updateOura("remSleepPct", v)} unit="%" placeholder="33" min={0} max={100} /></div>
            <div className="px-3"><TextMetricInput label="Deep Sleep" value={entry.oura?.deepSleep} onChange={(v) => updateOura("deepSleep", v)} placeholder="1h 32m" /></div>
            <div className="px-3"><MetricInput label="Deep %" value={entry.oura?.deepSleepPct} onChange={(v) => updateOura("deepSleepPct", v)} unit="%" placeholder="18" min={0} max={100} /></div>
            <div className="px-3"><TextMetricInput label="Light Sleep" value={entry.oura?.lightSleep} onChange={(v) => updateOura("lightSleep", v)} placeholder="3h 45m" /></div>
            <div className="px-3"><MetricInput label="Light %" value={entry.oura?.lightSleepPct} onChange={(v) => updateOura("lightSleepPct", v)} unit="%" placeholder="45" min={0} max={100} /></div>
            <div className="px-3"><TextMetricInput label="Awake Time" value={entry.oura?.awakeTime} onChange={(v) => updateOura("awakeTime", v)} placeholder="0h 32m" /></div>
            <div className="px-3"><TextMetricInput label="Time in Bed" value={entry.oura?.timeInBed} onChange={(v) => updateOura("timeInBed", v)} placeholder="9h 10m" /></div>
            <div className="px-3"><MetricInput label="Latency" value={entry.oura?.latency} onChange={(v) => updateOura("latency", v)} unit="min" placeholder="18" /></div>
            <div className="px-3"><SelectMetricInput label="Timing" value={entry.oura?.timing} onChange={(v) => updateOura("timing", v)} options={["Optimal", "Good", "Pay attention"]} /></div>
          </div>

          <p className="text-xs font-semibold tracking-wide mt-4 mb-2" style={{ color: "var(--text-muted)" }}>Key Metrics</p>
          <div className="rounded-xl border divide-y" style={{ borderColor: "var(--border)" }}>
            <div className="px-3"><MetricInput label="HRV" value={entry.oura?.hrv} onChange={(v) => updateOura("hrv", v)} unit="ms" placeholder="45" /></div>
            <div className="px-3"><MetricInput label="RHR" value={entry.oura?.rhr} onChange={(v) => updateOura("rhr", v)} unit="bpm" placeholder="58" /></div>
            <div className="px-3"><MetricInput label="Avg HR" value={entry.oura?.averageHR} onChange={(v) => updateOura("averageHR", v)} unit="bpm" placeholder="62" /></div>
            <div className="px-3"><MetricInput label="Body Temp" value={entry.oura?.bodyTemp} onChange={(v) => updateOura("bodyTemp", v)} unit="°C" placeholder="-0.5" /></div>
            <div className="px-3"><MetricInput label="Respiratory Rate" value={entry.oura?.respiratoryRate} onChange={(v) => updateOura("respiratoryRate", v)} unit="br/m" placeholder="15.2" /></div>
            <div className="px-3"><MetricInput label="SpO2" value={entry.oura?.spo2} onChange={(v) => updateOura("spo2", v)} unit="%" placeholder="97" min={0} max={100} /></div>
          </div>
        </div>

        <ExportButton data={data} />
      </div>
    </Sheet>
  );
}
