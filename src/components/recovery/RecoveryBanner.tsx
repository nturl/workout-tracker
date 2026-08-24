"use client";

import { todayKey, getRecoveryLevel } from "@/lib/helpers";
import { Icon } from "@/components/ui/Icon";
import type { RecoveryData } from "@/types/workout";

export function RecoveryBanner({ data, onClick }: { data: RecoveryData; onClick?: () => void }) {
  const today = todayKey();
  const entry = data[today];
  if (!entry) return null;

  const level = getRecoveryLevel(entry);
  const score = entry.oura?.readinessScore ?? entry.eightSleep?.sleepFitnessScore;
  const hrv = entry.oura?.hrv ?? entry.eightSleep?.hrv;
  const source = entry.oura?.readinessScore != null ? "Oura" : entry.eightSleep?.sleepFitnessScore != null ? "Eight Sleep" : null;

  return (
    <button onClick={onClick} className="w-full text-left glass-card rounded-card p-4 flex items-start gap-3 pressable transition-opacity hover:opacity-90">
      <span className="text-2xl mt-0.5">{level.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold" style={{ color: level.color }}>{level.label}</span>
          {score && <span className="text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums bg-surface-elevated text-content-secondary">Score: {score}</span>}
          {hrv && <span className="text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums bg-surface-elevated text-content-secondary">HRV: {hrv}ms</span>}
          {source && <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-surface-elevated text-content-muted">{source}</span>}
        </div>
        <p className="text-xs mt-1 text-content-muted">{level.advice}</p>
      </div>
      <span className="mt-1.5 shrink-0 inline-flex -rotate-90 text-content-muted">
        <Icon name="chevron" size={14} strokeWidth={2.4} />
      </span>
    </button>
  );
}
