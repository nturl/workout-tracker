"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useWorkoutStore } from "@/hooks/useWorkoutStore";
import { useOuraSync, useOuraStatus } from "@/hooks/useConnectedAccounts";
import { useQueryClient } from "@tanstack/react-query";
import { getRecoveryLevel, todayKey } from "@/lib/helpers";
import type { RecoveryEntry } from "@/types/workout";
import { ScreenshotUpload } from "@/components/recovery/ScreenshotUpload";
import { MetricInput } from "@/components/recovery/MetricInputs";
import { RecoveryHistory } from "@/components/recovery/RecoveryHistory";
import { DateSelector, useDateOptions } from "@/components/recovery/DateSelector";
import { ExportButton } from "@/components/recovery/ExportButton";
import { formatTimeAgo } from "@/components/recovery/formatTimeAgo";

export function RecoveryTab() {
  const data = useWorkoutStore((s) => s.recoveryData);
  const mergeRecoveryData = useWorkoutStore((s) => s.mergeRecoveryData);
  const ouraLastSynced = useWorkoutStore((s) => s.ouraLastSynced);
  const eightSleepLastSynced = useWorkoutStore((s) => s.eightSleepLastSynced);
  const [selectedDate, setSelectedDate] = useState(todayKey());

  const queryClient = useQueryClient();
  const ouraStatus = useOuraStatus();
  const ouraSync = useOuraSync();
  const lastSyncRef = useRef(0);

  useEffect(() => {
    if (Date.now() - lastSyncRef.current < 300_000) return;
    lastSyncRef.current = Date.now();
    queryClient.invalidateQueries({ queryKey: ["sync-data"] });
    if (ouraStatus.data?.connected) {
      ouraSync.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouraStatus.data?.connected]);

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
        ...Object.fromEntries(Object.entries(metrics).filter(([, v]) => v != null)),
      },
    }));
  }, [updateEntry]);

  const dateOptions = useDateOptions();
  const level = getRecoveryLevel(entry);

  return (
    <div className="max-w-lg mx-auto px-5 pt-5 pb-24">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[28px] leading-[34px] font-display font-bold text-content-primary">Recovery</h2>
          <p className="text-sm text-content-muted">
            Sleep, HRV & readiness data
          </p>
        </div>
        <ExportButton data={data} />
      </div>

      <DateSelector dates={dateOptions} selectedDate={selectedDate} onSelect={setSelectedDate} />

      {/* Recovery level badge */}
      {level && (
        <div className="mt-4 glass-card rounded-card p-4 flex items-center gap-3 anim-fade-up">
          <span className="text-2xl">{level.emoji}</span>
          <div className="flex-1">
            <span className="text-sm font-bold" style={{ color: level.color }}>{level.label}</span>
            <p className="text-xs text-content-muted">{level.advice}</p>
          </div>
        </div>
      )}

      {/* Connected accounts status */}
      <div className="mt-4 glass-card rounded-card p-4 anim-fade-up">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-content-secondary mb-3">
          Data Sources
        </h3>
        <div className="space-y-2 text-xs text-content-secondary">
          {ouraStatus.data?.connected && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent" />
              <span>Oura Ring connected</span>
              {ouraLastSynced && <span className="text-content-muted">{formatTimeAgo(ouraLastSynced)}</span>}
            </div>
          )}
          {eightSleepLastSynced && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--warning)" }} />
              <span>Eight Sleep via SMS</span>
              <span className="text-content-muted">{formatTimeAgo(eightSleepLastSynced)}</span>
            </div>
          )}
          {!ouraStatus.data?.connected && !eightSleepLastSynced && (
            <p className="text-content-muted">No devices connected yet</p>
          )}
        </div>
      </div>

      {/* Oura data */}
      {(entry.oura || ouraStatus.data?.connected) && (
        <div className="mt-4 glass-card rounded-card p-4 anim-fade-up">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-content-secondary">Oura Ring</h3>
            {entry.oura?.screenshotDataUrl && <span className="text-[10px] text-content-muted">via screenshot</span>}
          </div>
          <ScreenshotUpload label="Oura" source="oura" currentUrl={entry.oura?.screenshotDataUrl}
            onUpload={(url) => updateOura("screenshotDataUrl", url)}
            onClear={() => updateOura("screenshotDataUrl", undefined)}
            onMetricsExtracted={handleOuraMetrics} />
          <div className="mt-3 rounded-card ring-1 ring-[var(--card-border)] divide-y divide-[var(--card-border)]">
            <div className="px-3"><MetricInput label="Readiness Score" value={entry.oura?.readinessScore} onChange={(v) => updateOura("readinessScore", v)} placeholder="82" min={0} max={100} /></div>
            <div className="px-3"><MetricInput label="Sleep Score" value={entry.oura?.sleepScore} onChange={(v) => updateOura("sleepScore", v)} placeholder="88" min={0} max={100} /></div>
            <div className="px-3"><MetricInput label="HRV" value={entry.oura?.hrv} onChange={(v) => updateOura("hrv", v)} unit="ms" placeholder="36" /></div>
            <div className="px-3"><MetricInput label="RHR" value={entry.oura?.rhr} onChange={(v) => updateOura("rhr", v)} unit="bpm" placeholder="61" /></div>
          </div>
        </div>
      )}

      {/* Eight Sleep data */}
      <div className="mt-4 glass-card rounded-card p-4 anim-fade-up">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-content-secondary">Eight Sleep</h3>
          {entry.eightSleep?.autoImported && <span className="text-[10px] text-content-muted">auto-imported via SMS</span>}
        </div>
        <ScreenshotUpload label="Eight Sleep" source="eightSleep" currentUrl={entry.eightSleep?.screenshotDataUrl}
            onUpload={(url) => updateEightSleep("screenshotDataUrl", url)}
            onClear={() => updateEightSleep("screenshotDataUrl", undefined)}
            onMetricsExtracted={handleEightSleepMetrics} />
        <div className="mt-3 rounded-card ring-1 ring-[var(--card-border)] divide-y divide-[var(--card-border)]">
          <div className="px-3"><MetricInput label="Sleep Fitness Score" value={entry.eightSleep?.sleepFitnessScore} onChange={(v) => updateEightSleep("sleepFitnessScore", v)} placeholder="86" min={0} max={100} /></div>
          <div className="px-3"><MetricInput label="HRV" value={entry.eightSleep?.hrv} onChange={(v) => updateEightSleep("hrv", v)} unit="ms" placeholder="36" /></div>
          <div className="px-3"><MetricInput label="RHR" value={entry.eightSleep?.rhr} onChange={(v) => updateEightSleep("rhr", v)} unit="bpm" placeholder="61" /></div>
          <div className="px-3"><MetricInput label="Deep Sleep %" value={entry.eightSleep?.deepSleepPct} onChange={(v) => updateEightSleep("deepSleepPct", v)} unit="%" placeholder="14" /></div>
          <div className="px-3"><MetricInput label="REM Sleep %" value={entry.eightSleep?.remSleepPct} onChange={(v) => updateEightSleep("remSleepPct", v)} unit="%" placeholder="35" /></div>
        </div>
      </div>

      {/* History */}
      <div className="mt-6">
        <RecoveryHistory data={data} />
      </div>
    </div>
  );
}
