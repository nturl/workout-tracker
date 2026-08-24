"use client";

import { useState } from "react";
import { STATUS_CONFIG } from "@/types/biomarker";
import type { HealthGoal, BiomarkerSnapshot } from "@/types/biomarker";

const PRIORITY_COLORS = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--accent)",
};

interface Props {
  goals: HealthGoal[];
  initialIndex: number;
  allMarkers: BiomarkerSnapshot[];
  onBack: () => void;
  onSelectMarker: (biomarkerId: string) => void;
  onAskAI?: (question: string, goalContext: { title: string; summary: string; biomarkers: string[] }) => void;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function GoalProtocolView({ goals, initialIndex, allMarkers, onBack, onSelectMarker, onAskAI }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const goal = goals[currentIndex];

  if (!goal) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < goals.length - 1;
  const priorityColor = PRIORITY_COLORS[goal.priority];

  const linkedMarkers = goal.biomarkersToImprove
    .map((id) => allMarkers.find((s) => s.biomarkerId === id))
    .filter(Boolean) as BiomarkerSnapshot[];

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-xs font-semibold flex items-center gap-1 transition-opacity hover:opacity-70 text-accent"
      >
        &larr; Back
      </button>

      {/* Re-keyed on goal change so the CSS entrance replays per goal */}
      <div key={currentIndex} className="anim-fade-up space-y-4">
        {/* Goal counter pill */}
        <div className="flex items-center gap-2">
          <span
            className="px-3 py-1 rounded-full text-xs font-bold"
            style={{
              background: `color-mix(in srgb, ${priorityColor} 16%, transparent)`,
              color: priorityColor,
              border: `1px solid color-mix(in srgb, ${priorityColor} 35%, transparent)`,
            }}
          >
            GOAL {goal.number}/{goal.totalGoals}
          </span>
        </div>

        {/* Hero title card */}
        <div
          className="glass-card rounded-card p-5"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${priorityColor} 7%, transparent), var(--bg-card))`,
          }}
        >
          <h3 className="font-display text-xl font-bold leading-snug text-content-primary">
            {goal.title}
          </h3>
          <p className="text-sm mt-2 leading-relaxed text-content-secondary">
            {goal.summary}
          </p>

          {/* Metadata tags */}
          <div className="flex flex-wrap gap-2 mt-4">
            <MetaTag label="Priority" value={goal.priority} color={priorityColor} />
            <MetaTag label="Impact" value={goal.healthImpact} color="var(--text-muted)" />
            <MetaTag label="Timeline" value={goal.recoveryTime} color="var(--text-muted)" />
          </div>
        </div>

        {/* What this means */}
        <SectionCard icon="💡" title="What This Means">
          <p className="text-sm leading-relaxed text-content-secondary">
            {goal.whatThisMeans}
          </p>
        </SectionCard>

        {/* Potential causes */}
        <SectionCard icon="🔍" title="Potential Causes">
          <p className="text-sm leading-relaxed text-content-secondary">
            {goal.potentialCauses}
          </p>
        </SectionCard>

        {/* Linked biomarkers */}
        {linkedMarkers.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.08em] mb-3 flex items-center gap-1.5 text-content-secondary">
              <span>📊</span> Biomarkers to Improve
            </h4>
            <div className="space-y-2 anim-stagger">
              {linkedMarkers.map((snap, i) => {
                const { meta, latest, history } = snap;
                const statusCfg = STATUS_CONFIG[latest.status];
                const sparkData = history.slice(-5).map((r) => r.value);

                return (
                  <button
                    key={snap.biomarkerId}
                    onClick={() => onSelectMarker(snap.biomarkerId)}
                    className="anim-fade-up pressable glass-card w-full rounded-card p-3 text-left"
                    style={{
                      background: `linear-gradient(135deg, ${statusCfg.color}08, var(--bg-card))`,
                      borderLeft: `3px solid ${statusCfg.color}`,
                      "--stagger-i": i,
                    } as React.CSSProperties}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-content-primary">
                          {meta.shortName ?? meta.name}
                        </p>
                        <p className="text-[11px] mt-0.5 text-content-muted">
                          {latest.value} {latest.unit}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {sparkData.length >= 2 && <Sparkline data={sparkData} color={statusCfg.color} />}
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                          style={{ background: `${statusCfg.color}20`, color: statusCfg.color }}
                        >
                          {statusCfg.label}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recommended actions */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] mb-3 flex items-center gap-1.5 text-content-secondary">
            <span>✅</span> Recommended Actions
          </h4>
          <div className="space-y-2 anim-stagger">
            {goal.actions.map((action, i) => (
              <div
                key={action.number}
                className="anim-fade-up glass-card rounded-card p-3"
                style={{
                  borderLeft: "3px solid var(--accent)",
                  "--stagger-i": i,
                } as React.CSSProperties}
              >
                <div className="flex items-start gap-3">
                  <span className="glow-accent shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold bg-accent text-accent-contrast mt-0.5">
                    {action.number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-content-primary">
                      {action.title}
                    </p>
                    <p className="text-xs mt-1 leading-relaxed text-content-secondary">
                      {action.details}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ask AI questions */}
        {onAskAI && goal.askAiQuestions.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.08em] mb-3 flex items-center gap-1.5 text-content-secondary">
              <span>🤖</span> Ask AI
            </h4>
            <div className="flex flex-wrap gap-2">
              {goal.askAiQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() =>
                    onAskAI(q, {
                      title: goal.title,
                      summary: goal.summary,
                      biomarkers: goal.biomarkersToImprove,
                    })
                  }
                  className="pressable text-xs font-semibold px-3 py-2 rounded-full bg-surface-elevated text-accent transition-shadow hover:shadow-card-hover"
                  style={{ border: "1px solid var(--card-border)" }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Prev / Next navigation */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => hasPrev && setCurrentIndex(currentIndex - 1)}
            disabled={!hasPrev}
            className="pressable flex-1 h-11 rounded-button text-sm font-semibold bg-surface-elevated text-content-primary disabled:opacity-30"
            style={{ border: "1px solid var(--card-border)" }}
          >
            &larr; Previous Goal
          </button>
          <button
            onClick={() => hasNext && setCurrentIndex(currentIndex + 1)}
            disabled={!hasNext}
            className="pressable flex-1 h-11 rounded-button text-sm font-semibold bg-accent text-accent-contrast disabled:opacity-30"
          >
            Next Goal &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SectionCard - card with icon + section header                     */
/* ------------------------------------------------------------------ */

function SectionCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-card p-4">
      <h4 className="text-xs font-semibold uppercase tracking-[0.08em] mb-3 flex items-center gap-1.5 text-content-secondary">
        <span>{icon}</span> {title}
      </h4>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MetaTag - pill with colored border                                */
/* ------------------------------------------------------------------ */

function MetaTag({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span
      className="text-[10px] font-semibold px-2.5 py-1 rounded-full capitalize bg-surface-elevated"
      style={{
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        color,
      }}
    >
      {label}: {value}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Sparkline - mini trend line                                       */
/* ------------------------------------------------------------------ */

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 40;
  const h = 16;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
