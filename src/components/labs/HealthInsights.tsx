"use client";

import { useHealthInsights, type HealthInsight } from "@/hooks/useBiomarkers";

export function HealthInsights() {
  const { data, isLoading, isError, error, refetch } = useHealthInsights();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: "var(--bg-elevated)" }} />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        className="rounded-2xl p-5"
        style={{
          background: "var(--bg-card)",
          boxShadow: "var(--shadow-sm)",
          border: "1px solid #ef444430",
        }}
      >
        <p className="text-sm font-bold mb-2" style={{ color: "#ef4444" }}>
          Couldn&apos;t generate insights
        </p>
        <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <button
          onClick={() => refetch()}
          className="text-xs font-bold px-3 py-1.5 rounded-full"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Retry
        </button>
      </div>
    );
  }
  if (!data.insights) {
    return (
      <div className="rounded-2xl p-5 text-center" style={{ background: "var(--bg-card)", boxShadow: "var(--shadow-sm)" }}>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{data.message ?? "No data available for insights."}</p>
      </div>
    );
  }

  const { insights } = data;
  const scoreColor = insights.overallScore >= 80 ? "#22c55e" : insights.overallScore >= 60 ? "#3b82f6" : insights.overallScore >= 40 ? "#eab308" : "#ef4444";

  return (
    <div className="space-y-4">
      {/* Score card */}
      <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", boxShadow: "var(--card-shadow)" }}>
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
              <span className="text-lg font-black tabular-nums" style={{ color: scoreColor }}>
                {insights.overallScore}
              </span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: scoreColor }}>{insights.scoreLabel}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{insights.summary}</p>
          </div>
        </div>
      </div>

      {/* Insights */}
      {insights.insights.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Insights</h4>
          {insights.insights.map((insight, i) => (
            <InsightCard key={i} insight={insight} />
          ))}
        </div>
      )}

      {/* Recommendations */}
      {insights.recommendations.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Do this</h4>
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
          <h4 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Trends</h4>
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
    <div
      className="rounded-2xl p-3.5 flex items-start gap-3"
      style={{ background: "var(--bg-card)", boxShadow: "var(--shadow-sm)" }}
    >
      <span
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black tabular-nums"
        style={{ background: "var(--accent-glow)", color: "var(--accent)" }}
      >
        {String(index).padStart(2, "0")}
      </span>
      <p className="text-sm leading-snug flex-1 min-w-0">
        <span className="font-black" style={{ color: "var(--text-primary)" }}>
          {lead}
        </span>
        {rest && (
          <span style={{ color: "var(--text-secondary)" }}>
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
  const color = isUp ? "#22c55e" : isDown ? "#ef4444" : "var(--text-muted)";
  const icon = isUp ? "↑" : isDown ? "↓" : "→";
  const label = isUp ? "UP" : isDown ? "DOWN" : "FLAT";

  return (
    <div
      className="rounded-2xl p-3.5 flex items-start gap-3"
      style={{
        background: "var(--bg-card)",
        boxShadow: "var(--shadow-sm)",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div
        className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg font-black"
        style={{ background: `${color}18`, color }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-black" style={{ color: "var(--text-primary)" }}>
            {trend.marker}
          </span>
          <span
            className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: `${color}18`, color }}
          >
            {label}
          </span>
        </div>
        <p className="text-xs leading-snug" style={{ color: "var(--text-secondary)" }}>
          {trend.note}
        </p>
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: HealthInsight }) {
  const borderColor = insight.type === "concern" ? "#ef4444" : insight.type === "positive" ? "#22c55e" : "var(--border-active)";
  const priorityBadge = insight.priority === "high" ? { bg: "#fef2f2", color: "#ef4444", label: "High" }
    : insight.priority === "medium" ? { bg: "#fffbeb", color: "#eab308", label: "Medium" }
    : null;

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: "var(--bg-card)",
        boxShadow: "var(--shadow-sm)",
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{insight.title}</span>
            {priorityBadge && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: priorityBadge.bg, color: priorityBadge.color }}>
                {priorityBadge.label}
              </span>
            )}
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{insight.body}</p>
        </div>
      </div>
    </div>
  );
}
