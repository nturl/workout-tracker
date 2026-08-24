"use client";

import { useHealthInsights, type HealthInsight } from "@/hooks/useBiomarkers";

export function HealthInsights() {
  const { data, isLoading, isError, error, refetch } = useHealthInsights();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 rounded-card animate-pulse bg-surface-elevated" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        className="glass-card rounded-card p-5"
        style={{ border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)" }}
      >
        <p className="text-sm font-bold mb-2 text-danger">
          Couldn&apos;t generate insights
        </p>
        <p className="text-xs mb-3 text-content-secondary">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <button
          onClick={() => refetch()}
          className="pressable h-11 px-5 rounded-button text-[13px] font-medium bg-accent text-accent-contrast"
        >
          Retry
        </button>
      </div>
    );
  }
  if (!data.insights) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-content-muted">{data.message ?? "No data available for insights."}</p>
      </div>
    );
  }

  const { insights } = data;
  const scoreColor = insights.overallScore >= 80 ? "var(--accent)" : insights.overallScore >= 60 ? "#3b82f6" : insights.overallScore >= 40 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="space-y-6">
      {/* Score card */}
      <div className="glass-card rounded-card p-5">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16" role="progressbar" aria-valuenow={insights.overallScore} aria-valuemin={0} aria-valuemax={100} aria-label={`Health score: ${insights.overallScore} out of 100`}>
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90" aria-hidden="true">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--bg-elevated)" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.5" fill="none"
                stroke={scoreColor}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${insights.overallScore * 0.974} 100`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-display text-lg font-bold tabular-nums" style={{ color: scoreColor }}>
                {insights.overallScore}
              </span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: scoreColor }}>{insights.scoreLabel}</p>
            <p className="text-xs mt-0.5 text-content-secondary">{insights.summary}</p>
          </div>
        </div>
      </div>

      {/* Insights */}
      {insights.insights.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] mb-3 text-content-secondary">Insights</h4>
          {insights.insights.map((insight, i) => (
            <InsightCard key={i} insight={insight} />
          ))}
        </div>
      )}

      {/* Recommendations */}
      {insights.recommendations.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] mb-3 text-content-secondary">Do this</h4>
          <div className="space-y-2">
            {insights.recommendations.map((rec, i) => (
              <RecommendationRow key={i} index={i + 1} text={rec} />
            ))}
          </div>
        </div>
      )}

      {/* Trends */}
      {insights.trends.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] mb-3 text-content-secondary">Trends</h4>
          <div className="space-y-2">
            {insights.trends.map((trend, i) => (
              <TrendRow key={i} trend={trend} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecommendationRow({ index, text }: { index: number; text: string }) {
  // Split on first sentence-ish break so we can bold the lead-in
  const match = text.match(/^([^.:;]+[.:;])\s*(.*)$/);
  const lead = match ? match[1].replace(/[.:;]$/, "") : text;
  const rest = match ? match[2] : "";

  return (
    <div className="glass-card rounded-card p-3.5 flex items-start gap-3">
      <span
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums"
        style={{ background: "var(--accent-glow)", color: "var(--accent)" }}
      >
        {String(index).padStart(2, "0")}
      </span>
      <p className="text-sm leading-snug flex-1 min-w-0">
        <span className="font-bold text-content-primary">
          {lead}
        </span>
        {rest && (
          <span className="text-content-secondary">
            {" - "}
            {rest}
          </span>
        )}
      </p>
    </div>
  );
}

function TrendRow({ trend }: { trend: { marker: string; direction: string; note: string } }) {
  const isUp = trend.direction === "improving";
  const isDown = trend.direction === "declining";
  const color = isUp ? "var(--accent)" : isDown ? "var(--danger)" : "var(--text-muted)";
  const icon = isUp ? "↑" : isDown ? "↓" : "→";
  const label = isUp ? "UP" : isDown ? "DOWN" : "FLAT";

  return (
    <div
      className="glass-card rounded-card p-3.5 flex items-start gap-3"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div
        className="shrink-0 w-9 h-9 rounded-button flex items-center justify-center text-lg font-bold"
        style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-bold text-content-primary">
            {trend.marker}
          </span>
          <span
            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
          >
            {label}
          </span>
        </div>
        <p className="text-xs leading-snug text-content-secondary">
          {trend.note}
        </p>
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: HealthInsight }) {
  const borderColor = insight.type === "concern" ? "var(--danger)" : insight.type === "positive" ? "var(--accent)" : "var(--border-active)";
  const priorityBadge = insight.priority === "high"
    ? { bg: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)", label: "High" }
    : insight.priority === "medium"
      ? { bg: "color-mix(in srgb, var(--warning) 14%, transparent)", color: "var(--warning)", label: "Medium" }
      : null;

  return (
    <div
      className="glass-card rounded-card p-3"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-content-primary">{insight.title}</span>
            {priorityBadge && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: priorityBadge.bg, color: priorityBadge.color }}>
                {priorityBadge.label}
              </span>
            )}
          </div>
          <p className="text-xs mt-1 text-content-secondary">{insight.body}</p>
        </div>
      </div>
    </div>
  );
}
