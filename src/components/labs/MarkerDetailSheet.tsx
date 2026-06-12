"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { spring } from "@/lib/motion";
import { useBiomarkerDetail } from "@/hooks/useBiomarkers";
import { STATUS_CONFIG, type BiomarkerReading } from "@/types/biomarker";

const solidCard = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-subtle, var(--glass-border))",
  boxShadow: "var(--shadow-sm)",
} as const;

const closeBtnStyle = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-subtle, var(--glass-border))",
} as const;

interface Props {
  biomarkerId: string | null;
  onClose: () => void;
  onAskAI?: (question: string, biomarkerId: string) => void;
}

export function MarkerDetailSheet({ biomarkerId, onClose, onAskAI }: Props) {
  const { data, isLoading } = useBiomarkerDetail(biomarkerId);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      {biomarkerId && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
            onClick={onClose}
          />

          <motion.div
            ref={sheetRef}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring.snappy}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-y-auto"
            style={{
              background: "var(--bg-base)",
              maxHeight: "90vh",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "var(--border-active)" }} />
            </div>

            <div className="px-5 pb-8">
              {isLoading && (
                <div className="py-12 text-center">
                  <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
                </div>
              )}
              {data && <SheetContent data={data} onClose={onClose} onAskAI={onAskAI} />}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Sheet content
// ---------------------------------------------------------------------------

function SheetContent({
  data,
  onClose,
  onAskAI,
}: {
  data: NonNullable<ReturnType<typeof useBiomarkerDetail>["data"]>;
  onClose: () => void;
  onAskAI?: (question: string, biomarkerId: string) => void;
}) {
  const { meta, latest, history, trend } = data;
  const statusConfig = STATUS_CONFIG[latest.status];

  // Range calculations
  const rangeMin = meta.standard.low;
  const rangeMax = meta.standard.high;
  const rangeSpan = rangeMax - rangeMin;
  const padding = rangeSpan * 0.15;
  const barMin = rangeMin - padding;
  const barMax = rangeMax + padding;
  const barSpan = barMax - barMin;
  const valuePct = Math.max(0, Math.min(100, ((latest.value - barMin) / barSpan) * 100));
  const stdLowPct = ((rangeMin - barMin) / barSpan) * 100;
  const stdHighPct = ((rangeMax - barMin) / barSpan) * 100;

  let optLowPct = 0;
  let optHighPct = 0;
  if (meta.optimal) {
    optLowPct = ((meta.optimal.low - barMin) / barSpan) * 100;
    optHighPct = ((meta.optimal.high - barMin) / barSpan) * 100;
  }

  const questions = generateQuestions(meta.shortName ?? meta.name, meta.id, latest);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>
            {meta.shortName ?? meta.name}
          </h3>
          {meta.shortName && (
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{meta.name}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-xs font-bold px-3 py-1.5 rounded-full"
            style={{
              background: `${statusConfig.color}18`,
              color: statusConfig.color,
              border: `1px solid ${statusConfig.color}30`,
            }}
          >
            {statusConfig.label}
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all hover:scale-105"
            style={{ ...closeBtnStyle, color: "var(--text-primary)" }}
          >
            x
          </button>
        </div>
      </div>

      {/* Trend chart */}
      {history.length >= 2 && (
        <TrendChart
          readings={history}
          rangeMin={rangeMin}
          rangeMax={rangeMax}
          optimal={meta.optimal}
        />
      )}

      {/* Value cards row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4" style={{ ...solidCard }}>
          <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Latest result
          </p>
          <p className="text-2xl font-black tabular-nums mt-1.5" style={{ color: statusConfig.color }}>
            {latest.value}
            <span className="text-xs font-bold ml-1" style={{ color: "var(--text-secondary)" }}>{latest.unit}</span>
          </p>
          <p className="text-[11px] mt-1 font-medium" style={{ color: "var(--text-secondary)" }}>{latest.date}</p>
        </div>
        <div className="rounded-2xl p-4" style={{ ...solidCard }}>
          <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Optimal range
          </p>
          <p className="text-2xl font-black tabular-nums mt-1.5" style={{ color: "#22c55e" }}>
            {meta.optimal
              ? `${meta.optimal.low}-${meta.optimal.high}`
              : `${meta.standard.low}-${meta.standard.high}`}
            <span className="text-xs font-bold ml-1" style={{ color: "var(--text-secondary)" }}>{meta.unit}</span>
          </p>
          <p className="text-[11px] mt-1 font-medium" style={{ color: "var(--text-secondary)" }}>
            {meta.optimal ? "Research-backed" : "Standard lab"}
          </p>
        </div>
      </div>

      {/* Range bar */}
      <div className="rounded-2xl p-4" style={{ ...solidCard }}>
        <div className="relative h-7 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
          {/* Standard range */}
          <div
            className="absolute top-0 bottom-0 rounded-full"
            style={{ left: `${stdLowPct}%`, width: `${stdHighPct - stdLowPct}%`, background: "#3b82f6", opacity: 0.28 }}
          />
          {/* Optimal range */}
          {meta.optimal && (
            <div
              className="absolute top-0 bottom-0 rounded-sm"
              style={{ left: `${optLowPct}%`, width: `${optHighPct - optLowPct}%`, background: "#22c55e", opacity: 0.42 }}
            />
          )}
          {/* Glossy highlight */}
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.1), transparent 55%)" }}
          />
          {/* Value marker */}
          <div
            className="absolute top-1/2 w-5 h-5 rounded-full"
            style={{
              left: `${valuePct}%`,
              transform: "translateX(-50%) translateY(-50%)",
              background: statusConfig.color,
              border: "3px solid var(--bg-base)",
              boxShadow: `0 0 0 1px ${statusConfig.color}, 0 0 14px ${statusConfig.color}80`,
            }}
          />
        </div>
        <div className="flex justify-between mt-2.5 px-1">
          <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--text-secondary)" }}>{rangeMin}</span>
          {meta.optimal && (
            <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: "#22c55e" }}>Optimal</span>
          )}
          <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--text-secondary)" }}>{rangeMax}</span>
        </div>
      </div>

      {/* Trend chip */}
      {trend !== "insufficient_data" && (() => {
        const trendColor =
          trend === "improving" ? "#22c55e" : trend === "declining" ? "#ef4444" : "var(--text-secondary)";
        const trendBg =
          trend === "improving"
            ? "rgba(34,197,94,0.18)"
            : trend === "declining"
              ? "rgba(239,68,68,0.18)"
              : "var(--bg-elevated)";
        return (
          <div className="flex items-center gap-2.5">
            <span
              className="text-sm font-black px-3.5 py-2 rounded-full flex items-center gap-1.5"
              style={{
                background: trendBg,
                color: trendColor,
                border: `1px solid ${trend === "improving" ? "rgba(34,197,94,0.35)" : trend === "declining" ? "rgba(239,68,68,0.35)" : "var(--border-subtle, var(--glass-border))"}`,
              }}
            >
              <span>{trend === "improving" ? "+" : trend === "declining" ? "-" : "="}</span>
              {trend === "improving" ? "Improving" : trend === "declining" ? "Declining" : "Stable"}
            </span>
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              over {history.length} reading{history.length !== 1 ? "s" : ""}
            </span>
          </div>
        );
      })()}

      {/* History readings */}
      {history.length > 1 && (
        <div className="rounded-2xl p-4" style={{ ...solidCard }}>
          <h4 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
            History
          </h4>
          <div className="space-y-3">
            {[...history].reverse().map((r, i) => {
              const rConfig = STATUS_CONFIG[r.status];
              return (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{r.date}</span>
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: rConfig.color, boxShadow: `0 0 0 2px ${rConfig.color}25` }} />
                    <span className="text-sm font-black tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {r.value} {r.unit}
                    </span>
                    {r.flag && (
                      <span
                        className="text-[10px] font-black px-1.5 py-0.5 rounded"
                        style={{ background: `${rConfig.color}28`, color: rConfig.color, border: `1px solid ${rConfig.color}40` }}
                      >
                        {r.flag}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ask AI */}
      {onAskAI && (
        <div>
          <h4 className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
            <span>🤖</span> Ask AI
          </h4>
          <div className="space-y-2">
            {questions.map((q, i) => (
              <button
                key={i}
                onClick={() => onAskAI(q, data.biomarkerId)}
                className="w-full rounded-xl px-4 py-3.5 text-left text-sm font-medium flex items-center justify-between transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  ...solidCard,
                  color: "var(--text-primary)",
                }}
              >
                <span className="flex-1 min-w-0">{q}</span>
                <span
                  className="shrink-0 ml-3 text-base font-bold w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "var(--accent-glow)", color: "var(--accent)" }}
                >
                  &rarr;
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend chart with range bands
// ---------------------------------------------------------------------------

function TrendChart({ readings, rangeMin, rangeMax, optimal }: {
  readings: BiomarkerReading[];
  rangeMin: number;
  rangeMax: number;
  optimal?: { low: number; high: number };
}) {
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map((r) => r.value);
  const chartMin = Math.min(rangeMin, ...values) * 0.92;
  const chartMax = Math.max(rangeMax, ...values) * 1.08;
  const chartSpan = chartMax - chartMin;

  const w = 320;
  const h = 150;
  const px = 40;
  const py = 15;
  const plotW = w - px - 10;
  const plotH = h - py * 2 - 20;

  const points = sorted.map((r, i) => {
    const x = px + (i / Math.max(1, sorted.length - 1)) * plotW;
    const y = py + plotH - ((r.value - chartMin) / chartSpan) * plotH;
    return { x, y, status: r.status, date: r.date, value: r.value };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const yTicks = 4;
  const yStep = chartSpan / yTicks;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => chartMin + i * yStep);

  const firstDate = sorted[0]?.date ?? "";
  const lastDate = sorted[sorted.length - 1]?.date ?? "";
  const formatDate = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  const normalTop = py + plotH - ((rangeMax - chartMin) / chartSpan) * plotH;
  const normalBottom = py + plotH - ((rangeMin - chartMin) / chartSpan) * plotH;

  return (
    <div className="rounded-2xl p-3 overflow-hidden" style={{ ...solidCard }}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 150 }}>
        {/* Normal range band */}
        <rect x={px} y={normalTop} width={plotW} height={normalBottom - normalTop} fill="#3b82f6" opacity={0.06} rx={4} />

        {/* Optimal range band */}
        {optimal && (() => {
          const optTop = py + plotH - ((optimal.high - chartMin) / chartSpan) * plotH;
          const optBot = py + plotH - ((optimal.low - chartMin) / chartSpan) * plotH;
          return (
            <>
              <rect x={px} y={optTop} width={plotW} height={optBot - optTop} fill="#22c55e" opacity={0.1} rx={3} />
              <text x={w - 8} y={optTop + (optBot - optTop) / 2} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#22c55e" fontWeight="700">
                Optimal
              </text>
              <line x1={px} y1={optTop} x2={px + plotW} y2={optTop} stroke="#22c55e" strokeWidth="0.5" strokeDasharray="4 3" opacity={0.4} />
              <line x1={px} y1={optBot} x2={px + plotW} y2={optBot} stroke="#22c55e" strokeWidth="0.5" strokeDasharray="4 3" opacity={0.4} />
            </>
          );
        })()}

        {/* Y-axis range color bar */}
        <rect x={0} y={normalTop} width={4} height={normalBottom - normalTop} fill="#eab308" rx={2} />
        {optimal && (() => {
          const optTop = py + plotH - ((optimal.high - chartMin) / chartSpan) * plotH;
          const optBot = py + plotH - ((optimal.low - chartMin) / chartSpan) * plotH;
          return <rect x={0} y={optTop} width={4} height={optBot - optTop} fill="#22c55e" rx={2} />;
        })()}
        <rect x={0} y={py} width={4} height={normalTop - py} fill="#ef4444" rx={2} />
        <rect x={0} y={normalBottom} width={4} height={py + plotH - normalBottom} fill="#ef4444" rx={2} />

        {/* Y-axis labels */}
        {yLabels.map((v, i) => {
          const y = py + plotH - ((v - chartMin) / chartSpan) * plotH;
          return (
            <text key={i} x={px - 5} y={y} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="var(--text-muted)" fontWeight="500">
              {v.toFixed(v >= 100 ? 0 : 2)}
            </text>
          );
        })}

        {/* Data line */}
        <path d={linePath} fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" opacity={0.5} />

        {/* Data points with glow */}
        {points.map((p, i) => {
          const color = STATUS_CONFIG[p.status].color;
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={6} fill={color} opacity={0.15} />
              <circle cx={p.x} cy={p.y} r={4} fill={color} stroke="var(--bg-base)" strokeWidth={2} />
            </g>
          );
        })}

        {/* X-axis date labels */}
        {sorted.length >= 2 && (
          <>
            <text x={px} y={h - 3} textAnchor="start" fontSize="9" fill="var(--text-muted)" fontWeight="500">
              {formatDate(firstDate)}
            </text>
            <text x={px + plotW} y={h - 3} textAnchor="end" fontSize="9" fill="var(--text-muted)" fontWeight="500">
              {formatDate(lastDate)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generate contextual AI questions
// ---------------------------------------------------------------------------

function generateQuestions(name: string, id: string, latest: BiomarkerReading): string[] {
  const base = [
    `What causes ${latest.status === "out_of_range" ? "abnormal" : "elevated"} ${name} levels?`,
    `How can I improve my ${name}?`,
  ];

  if (latest.status === "out_of_range" || latest.status === "attention") {
    base.push(`What supplements or lifestyle changes help with ${name}?`);
  } else {
    base.push(`What does ${name} indicate about my health?`);
  }

  return base;
}
