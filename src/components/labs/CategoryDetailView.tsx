"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { fadeUp, staggerContainer, spring } from "@/lib/motion";
import type { GradedCategory } from "@/hooks/useBiomarkers";
import type { HealthInsight } from "@/hooks/useBiomarkers";
import type { BiomarkerSnapshot } from "@/types/biomarker";
import { STATUS_CONFIG } from "@/types/biomarker";
import { MarkerTable } from "./MarkerTable";

interface Props {
  category: GradedCategory;
  markers: BiomarkerSnapshot[];
  insights: HealthInsight[];
  categorySummary?: string;
  onBack: () => void;
  onSelectMarker: (biomarkerId: string) => void;
}

export function CategoryDetailView({ category, markers, insights, categorySummary, onBack, onSelectMarker }: Props) {
  const circumference = 2 * Math.PI * 42;
  const progress = (category.grade.score / 100) * circumference;

  const statusOrder = ["optimal", "normal", "attention", "out_of_range"] as const;

  // Compute flagged markers with context
  const flagged = useMemo(() => {
    const outOfRange = markers.filter((m) => m.latest.status === "out_of_range");
    const attention = markers.filter((m) => m.latest.status === "attention");
    return { outOfRange, attention, total: outOfRange.length + attention.length };
  }, [markers]);

  // Build a computed summary when no AI category summary or insights match
  const computedSummary = useMemo(() => {
    if (categorySummary || insights.length > 0) return null;
    const { outOfRange, attention } = flagged;
    if (outOfRange.length === 0 && attention.length === 0) {
      return `All ${category.markerCount} markers in ${category.label} are within normal or optimal range. Keep up the good work.`;
    }
    const parts: string[] = [];
    if (outOfRange.length > 0) {
      const names = outOfRange.map((m) => m.meta.shortName ?? m.meta.name).join(", ");
      parts.push(`${outOfRange.length} marker${outOfRange.length > 1 ? "s" : ""} out of range: ${names}`);
    }
    if (attention.length > 0) {
      const names = attention.map((m) => m.meta.shortName ?? m.meta.name).join(", ");
      parts.push(`${attention.length} marker${attention.length > 1 ? "s" : ""} need${attention.length === 1 ? "s" : ""} attention: ${names}`);
    }
    return parts.join(". ") + ". Tap any marker for details and AI-powered recommendations.";
  }, [insights, flagged, category, categorySummary]);

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-5">
      <button
        onClick={onBack}
        className="text-xs font-semibold flex items-center gap-1"
        style={{ color: "var(--accent)" }}
      >
        &larr; Back
      </button>

      {/* Grade header card */}
      <motion.div
        variants={fadeUp}
        className="rounded-2xl p-5"
        style={{ background: "var(--bg-card)", boxShadow: "var(--card-shadow)" }}
      >
        <div className="flex items-center gap-5">
          {/* Large grade ring */}
          <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle
                cx="50" cy="50" r="42"
                fill="none"
                stroke="var(--bg-elevated)"
                strokeWidth="5"
              />
              <motion.circle
                cx="50" cy="50" r="42"
                fill="none"
                stroke={category.grade.color}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${progress} ${circumference}`}
                initial={{ strokeDasharray: `0 ${circumference}` }}
                animate={{ strokeDasharray: `${progress} ${circumference}` }}
                transition={spring.snappy}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-black" style={{ color: category.grade.color }}>
                {category.grade.letter}
              </span>
              <span className="text-[9px] font-bold" style={{ color: "var(--text-muted)" }}>
                {category.grade.score}/100
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              {category.label}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {category.markerCount} marker{category.markerCount !== 1 ? "s" : ""} tracked
            </p>

            {/* Mini status breakdown */}
            <div className="flex gap-3 mt-2">
              {statusOrder.map((s) => {
                const count = category.statusBreakdown[s];
                if (count === 0) return null;
                return (
                  <div key={s} className="flex items-center gap-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: STATUS_CONFIG[s].color }}
                    />
                    <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {/* AI insights for this category */}
      {insights.length > 0 && (
        <motion.div variants={fadeUp} className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            AI Analysis
          </h4>
          {insights.map((insight, i) => {
            const borderColor = insight.type === "concern" ? "#ef4444" : insight.type === "positive" ? "#22c55e" : "var(--border-active)";
            return (
              <div
                key={i}
                className="rounded-xl p-3"
                style={{
                  background: "var(--bg-card)",
                  boxShadow: "var(--shadow-sm)",
                  borderLeft: `3px solid ${borderColor}`,
                }}
              >
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {insight.title}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                  {insight.body}
                </p>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* AI category summary */}
      {categorySummary && (
        <motion.div
          variants={fadeUp}
          className="rounded-xl p-4"
          style={{ background: "var(--bg-card)", boxShadow: "var(--shadow-sm)" }}
        >
          <h4 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
            AI Summary
          </h4>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{categorySummary}</p>
        </motion.div>
      )}

      {/* Computed summary fallback when no AI insights */}
      {computedSummary && (
        <motion.div
          variants={fadeUp}
          className="rounded-xl p-4"
          style={{ background: "var(--bg-card)", boxShadow: "var(--shadow-sm)" }}
        >
          <h4 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
            Summary
          </h4>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{computedSummary}</p>
        </motion.div>
      )}

      {/* Flagged markers to improve */}
      {flagged.total > 0 && (
        <motion.div variants={fadeUp}>
          <h4 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
            Markers to Improve
          </h4>
          <div className="space-y-2">
            {[...flagged.outOfRange, ...flagged.attention].map((s) => {
              const { meta, latest, trend } = s;
              const statusCfg = STATUS_CONFIG[latest.status];
              const trendLabel = trend === "improving" ? "Improving" : trend === "declining" ? "Declining" : trend === "stable" ? "Stable" : null;
              const trendColor = trend === "improving" ? "#22c55e" : trend === "declining" ? "#ef4444" : "var(--text-muted)";

              // Compute how far off from optimal/standard
              const target = meta.optimal ?? meta.standard;
              const isLow = latest.value < target.low;
              const delta = isLow
                ? target.low - latest.value
                : latest.value - target.high;
              const direction = isLow ? "below" : "above";

              return (
                <button
                  key={s.biomarkerId}
                  onClick={() => onSelectMarker(s.biomarkerId)}
                  className="w-full rounded-xl p-3 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background: "var(--bg-card)",
                    boxShadow: "var(--shadow-sm)",
                    borderLeft: `3px solid ${statusCfg.color}`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                        {meta.shortName ?? meta.name}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {latest.value} {latest.unit} - {delta.toFixed(1)} {direction} {meta.optimal ? "optimal" : "normal"} range
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${statusCfg.color}20`, color: statusCfg.color }}>
                        {statusCfg.label}
                      </span>
                      {trendLabel && (
                        <p className="text-[10px] font-semibold mt-1" style={{ color: trendColor }}>
                          {trendLabel}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* All markers in this category */}
      <motion.div variants={fadeUp}>
        <h4 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
          All Markers
        </h4>
        <MarkerTable markers={markers} onSelect={onSelectMarker} />
      </motion.div>
    </motion.div>
  );
}
