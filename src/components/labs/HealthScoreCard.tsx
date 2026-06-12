"use client";

import { motion } from "framer-motion";
import { fadeUp, spring } from "@/lib/motion";
import type { GradeResult } from "@/lib/biomarkerData";
import type { HealthInsightsData, HealthInsight } from "@/hooks/useBiomarkers";

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

interface Props {
  grade: GradeResult;
  totalMarkers: number;
  insights: HealthInsightsData | null;
  goalCount?: number;
  onViewInsights?: () => void;
  onViewProtocol?: () => void;
}

export function HealthScoreCard({
  grade,
  totalMarkers,
  insights,
  goalCount,
  onViewInsights,
  onViewProtocol,
}: Props) {
  const circumference = 2 * Math.PI * 42;
  const progress = (grade.score / 100) * circumference;

  const topInsights =
    insights?.insights
      ?.filter((i) => i.priority === "high" || i.priority === "medium")
      .slice(0, 2) ?? [];

  return (
    <motion.div
      variants={fadeUp}
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid var(--glass-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {/* Gradient overlay */}
      <div
        className="absolute inset-x-0 top-0 h-24 pointer-events-none"
        style={{
          background: `linear-gradient(180deg, ${grade.color}08 0%, transparent 100%)`,
        }}
      />

      <div className="relative p-5">
        <div className="flex items-center gap-4">
          {/* Score ring */}
          <div className="relative shrink-0" style={{ width: 88, height: 88 }}>
            {/* Glow behind ring */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `radial-gradient(circle, ${grade.color}20 0%, transparent 70%)`,
                filter: "blur(8px)",
                transform: "scale(1.3)",
              }}
            />
            <svg viewBox="0 0 100 100" className="relative w-full h-full -rotate-90">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="var(--bg-elevated)"
                strokeWidth="5"
                strokeOpacity={0.5}
              />
              <motion.circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={grade.color}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${progress} ${circumference}`}
                initial={{ strokeDasharray: `0 ${circumference}` }}
                animate={{ strokeDasharray: `${progress} ${circumference}` }}
                transition={spring.snappy}
                style={{
                  filter: `drop-shadow(0 0 6px ${grade.color}66)`,
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-2xl font-black tabular-nums leading-none"
                style={{ color: grade.color }}
              >
                {grade.score}
              </span>
              <span
                className="text-[10px] font-bold tabular-nums mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                {grade.letter}
              </span>
            </div>
          </div>

          {/* Summary text */}
          <div className="flex-1 min-w-0">
            <p
              className="text-base font-black tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Health Score
            </p>
            <p
              className="text-xs mt-0.5 font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {totalMarkers} biomarkers tracked
            </p>
            {insights?.summary && (
              <p
                className="text-xs mt-2 line-clamp-3 leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {insights.summary}
              </p>
            )}
          </div>
        </div>

        {/* Pill insights */}
        {topInsights.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {topInsights.map((insight, i) => (
              <InsightPill key={i} insight={insight} />
            ))}
          </div>
        )}

        {/* Trend pills */}
        {insights?.trends && insights.trends.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {insights.trends.slice(0, 3).map((t, i) => {
              const isUp = t.direction === "improving";
              const isDown = t.direction === "declining";
              const icon = isUp ? "+" : isDown ? "-" : "=";
              const color = isUp
                ? "#22c55e"
                : isDown
                  ? "#ef4444"
                  : "var(--text-muted)";
              const bg = isUp
                ? "linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.04) 100%)"
                : isDown
                  ? "linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(239,68,68,0.04) 100%)"
                  : "var(--bg-elevated)";

              return (
                <span
                  key={i}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: bg, color }}
                >
                  {icon} {t.marker}
                </span>
              );
            })}
          </div>
        )}

        {/* CTA buttons */}
        {(onViewProtocol && goalCount) || onViewInsights ? (
          <div className="mt-4">
            {onViewProtocol && goalCount ? (
              <button
                onClick={onViewProtocol}
                className="w-full text-center py-2.5 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: `linear-gradient(135deg, ${grade.color}20 0%, ${grade.color}08 100%)`,
                  color: grade.color,
                  border: `1px solid ${grade.color}18`,
                  fontWeight: 700,
                  fontSize: "0.8125rem",
                }}
              >
                View Health Protocol
                <span
                  className="block text-[10px] font-semibold mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  {goalCount} personalized goal{goalCount !== 1 ? "s" : ""}
                </span>
              </button>
            ) : onViewInsights ? (
              <button
                onClick={onViewInsights}
                className="w-full text-center py-2.5 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background:
                    "linear-gradient(135deg, var(--accent-glow) 0%, transparent 100%)",
                  color: "var(--accent)",
                  border: "1px solid var(--accent-glow)",
                  fontWeight: 700,
                  fontSize: "0.8125rem",
                }}
              >
                View Full Analysis
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Insight pill                                                      */
/* ------------------------------------------------------------------ */

function InsightPill({ insight }: { insight: HealthInsight }) {
  const isConcern = insight.type === "concern";
  const isPositive = insight.type === "positive";

  const dotColor = isConcern
    ? "#ef4444"
    : isPositive
      ? "#22c55e"
      : "var(--text-muted)";

  const pillBg = isConcern
    ? "linear-gradient(135deg, rgba(239,68,68,0.10) 0%, rgba(239,68,68,0.03) 100%)"
    : isPositive
      ? "linear-gradient(135deg, rgba(34,197,94,0.10) 0%, rgba(34,197,94,0.03) 100%)"
      : "var(--bg-elevated)";

  return (
    <div
      className="rounded-xl px-3 py-2 flex items-center gap-2.5"
      style={{ background: pillBg }}
    >
      <span
        className="shrink-0 w-1.5 h-1.5 rounded-full"
        style={{ background: dotColor }}
      />
      <div className="flex-1 min-w-0">
        <span
          className="text-xs font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          {insight.title}
        </span>
        <p
          className="text-[11px] mt-0.5 line-clamp-1"
          style={{ color: "var(--text-muted)" }}
        >
          {insight.body}
        </p>
      </div>
    </div>
  );
}
