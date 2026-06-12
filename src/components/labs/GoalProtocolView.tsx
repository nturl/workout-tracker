"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { STATUS_CONFIG } from "@/types/biomarker";
import type { HealthGoal, BiomarkerSnapshot } from "@/types/biomarker";

const PRIORITY_COLORS = {
  high: "#ef4444",
  medium: "#eab308",
  low: "#3b82f6",
};

const PRIORITY_GRADIENTS = {
  high: "linear-gradient(135deg, #ef4444, #dc2626)",
  medium: "linear-gradient(135deg, #eab308, #ca8a04)",
  low: "linear-gradient(135deg, #3b82f6, #2563eb)",
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
/*  Glass card style helper                                           */
/* ------------------------------------------------------------------ */

const glass = {
  background: "var(--glass-bg)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid var(--glass-border)",
} as const;

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
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-xs font-semibold flex items-center gap-1 transition-opacity hover:opacity-70"
        style={{ color: "var(--accent)" }}
      >
        &larr; Back
      </button>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          {/* Goal counter pill */}
          <div className="flex items-center gap-2">
            <span
              className="px-3 py-1 rounded-full text-xs font-black text-white"
              style={{
                background: PRIORITY_GRADIENTS[goal.priority],
                boxShadow: `0 2px 12px ${priorityColor}40`,
              }}
            >
              GOAL {goal.number}/{goal.totalGoals}
            </span>
          </div>

          {/* Hero title card */}
          <motion.div
            variants={fadeUp}
            className="rounded-2xl p-5"
            style={{
              ...glass,
              background: `linear-gradient(135deg, ${priorityColor}0D, var(--glass-bg))`,
              boxShadow: "var(--card-shadow)",
            }}
          >
            <h3 className="text-lg font-bold leading-snug" style={{ color: "var(--text-primary)" }}>
              {goal.title}
            </h3>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {goal.summary}
            </p>

            {/* Metadata tags */}
            <div className="flex flex-wrap gap-2 mt-4">
              <MetaTag label="Priority" value={goal.priority} color={priorityColor} />
              <MetaTag label="Impact" value={goal.healthImpact} color="var(--text-muted)" />
              <MetaTag label="Timeline" value={goal.recoveryTime} color="var(--text-muted)" />
            </div>
          </motion.div>

          {/* What this means */}
          <SectionCard icon="💡" title="What This Means">
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {goal.whatThisMeans}
            </p>
          </SectionCard>

          {/* Potential causes */}
          <SectionCard icon="🔍" title="Potential Causes">
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {goal.potentialCauses}
            </p>
          </SectionCard>

          {/* Linked biomarkers */}
          {linkedMarkers.length > 0 && (
            <motion.div variants={fadeUp}>
              <h4
                className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                <span>📊</span> Biomarkers to Improve
              </h4>
              <div className="space-y-2">
                {linkedMarkers.map((snap) => {
                  const { meta, latest, history } = snap;
                  const statusCfg = STATUS_CONFIG[latest.status];
                  const sparkData = history.slice(-5).map((r) => r.value);

                  return (
                    <button
                      key={snap.biomarkerId}
                      onClick={() => onSelectMarker(snap.biomarkerId)}
                      className="w-full rounded-xl p-3 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                      style={{
                        ...glass,
                        background: `linear-gradient(135deg, ${statusCfg.color}08, var(--glass-bg))`,
                        borderLeft: `3px solid ${statusCfg.color}`,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                            {meta.shortName ?? meta.name}
                          </p>
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
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
            </motion.div>
          )}

          {/* Recommended actions */}
          <motion.div variants={fadeUp}>
            <h4
              className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              <span>✅</span> Recommended Actions
            </h4>
            <div className="space-y-2">
              {goal.actions.map((action) => (
                <div
                  key={action.number}
                  className="rounded-xl p-3"
                  style={{
                    ...glass,
                    borderLeft: `3px solid var(--accent)`,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white mt-0.5"
                      style={{
                        background: "linear-gradient(135deg, var(--accent), var(--accent-glow))",
                        boxShadow: "0 2px 8px var(--accent-glow)",
                      }}
                    >
                      {action.number}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                        {action.title}
                      </p>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {action.details}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Ask AI questions */}
          {onAskAI && goal.askAiQuestions.length > 0 && (
            <motion.div variants={fadeUp}>
              <h4
                className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5"
                style={{ color: "var(--text-muted)" }}
              >
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
                    className="text-xs font-semibold px-3 py-2 rounded-full transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      ...glass,
                      color: "var(--accent)",
                      boxShadow: "none",
                      transition: "box-shadow 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = "0 2px 16px var(--accent-glow)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Prev / Next navigation */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => hasPrev && setCurrentIndex(currentIndex - 1)}
              disabled={!hasPrev}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all hover:scale-[1.01] disabled:opacity-30"
              style={{
                ...glass,
                color: "var(--text-primary)",
              }}
            >
              &larr; Previous Goal
            </button>
            <button
              onClick={() => hasNext && setCurrentIndex(currentIndex + 1)}
              disabled={!hasNext}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all hover:scale-[1.01] disabled:opacity-30"
              style={{
                background: "linear-gradient(135deg, var(--accent), var(--accent-glow))",
                color: "#fff",
                border: "none",
              }}
            >
              Next Goal &rarr;
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  SectionCard - glass card with icon + title                        */
/* ------------------------------------------------------------------ */

function SectionCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <motion.div
      variants={fadeUp}
      className="rounded-xl p-4"
      style={{
        ...glass,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <h4
        className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        <span>{icon}</span> {title}
      </h4>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  MetaTag - glass pill with colored border                          */
/* ------------------------------------------------------------------ */

function MetaTag({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span
      className="text-[10px] font-bold px-2.5 py-1 rounded-full capitalize"
      style={{
        ...glass,
        border: `1px solid ${color}30`,
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
