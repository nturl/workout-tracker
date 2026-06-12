"use client";

import { memo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { weeklyPlan } from "@/lib/workoutData";
import { DAYS, weekKey, sessionKey } from "@/lib/helpers";
import { ConsistencyHeatmap } from "@/components/progress/Heatmap";
import { Icon } from "@/components/ui/Icon";
import type { CompletionRecord } from "@/types/workout";

const WEEKS = 8;

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl px-2.5 py-2 text-center" style={{ background: "var(--bg-elevated)" }}>
      <div className="text-base font-black tabular-nums" style={{ color: "var(--text-primary)" }}>{value}</div>
      <div className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-[9px]" style={{ color: "var(--text-muted)", opacity: 0.7 }}>{sub}</div>
    </div>
  );
}

/**
 * Weekly completion-% trend over the last 8 weeks. Collapsed: the trend line +
 * momentum read. Tap to expand for week highlights and the day-of-week pattern.
 * Themed via tokens (currentColor = --accent) for light + dark.
 */
export const MomentumChart = memo(function MomentumChart({ completions }: { completions: CompletionRecord }) {
  const [expanded, setExpanded] = useState(false);
  const today = new Date();

  const weekStarts: Date[] = [];
  const pcts: number[] = [];
  const doneArr: number[] = [];
  const totalArr: number[] = [];
  for (let w = 0; w < WEEKS; w++) {
    const ref = new Date(today);
    ref.setDate(today.getDate() - (WEEKS - 1 - w) * 7);
    const start = new Date(ref);
    start.setDate(ref.getDate() - ref.getDay()); // Sunday
    weekStarts.push(start);

    let total = 0;
    let done = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + d);
      const dayName = DAYS[day.getDay()];
      const wk = weekKey(day);
      const plan = weeklyPlan.find((p) => p.day === dayName);
      if (!plan) continue;
      total += plan.sessions.length;
      done += plan.sessions.filter((s) => completions[sessionKey(wk, dayName, s)]).length;
    }
    doneArr.push(done);
    totalArr.push(total);
    pcts.push(total > 0 ? Math.round((done / total) * 100) : 0);
  }

  const current = pcts[WEEKS - 1];
  const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / WEEKS);

  // Momentum = recent half vs prior half (stable; not thrown off by a single
  // in-progress week the way a week-over-week delta would be).
  const half = WEEKS / 2;
  const recentAvg = pcts.slice(half).reduce((a, b) => a + b, 0) / half;
  const priorAvg = pcts.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const swing = recentAvg - priorAvg;
  const trend = swing > 3 ? { icon: "▲", text: "trending up", up: true } : swing < -3 ? { icon: "▼", text: "cooling off", up: false } : { icon: "→", text: "holding steady", up: true };

  let bestIdx = 0;
  let worstIdx = 0;
  pcts.forEach((p, i) => {
    if (p > pcts[bestIdx]) bestIdx = i;
    if (p < pcts[worstIdx]) worstIdx = i;
  });
  const weeksAboveAvg = pcts.filter((p) => p >= avg && p > 0).length;

  // Geometry
  const W = 320;
  const H = 132;
  const padX = 10;
  const padTop = 14;
  const padBottom = 14;
  const plotW = W - padX * 2;
  const plotH = H - padTop - padBottom;
  const baseline = padTop + plotH;
  const x = (i: number) => padX + (i * plotW) / (WEEKS - 1);
  const y = (p: number) => baseline - (p / 100) * plotH;

  const ptsStr = pcts.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`);
  const linePath = "M" + ptsStr.join(" L");
  const areaPath = `M${x(0).toFixed(1)},${baseline.toFixed(1)} L` + ptsStr.join(" L") + ` L${x(WEEKS - 1).toFixed(1)},${baseline.toFixed(1)} Z`;
  const avgY = y(avg);

  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div style={{ color: "var(--accent)" }}>
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="w-full text-left" aria-label={expanded ? "Collapse momentum detail" : "Expand momentum detail"}>
        <div className="flex items-baseline gap-2.5 mb-3">
          <span className="text-3xl font-black tracking-tight tabular-nums" style={{ color: "var(--text-primary)" }}>{current}%</span>
          <span className="text-xs font-bold" style={{ color: trend.up ? "var(--accent)" : "#f87171" }}>{trend.icon} {trend.text}</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold tabular-nums" style={{ color: "var(--text-muted)" }}>
            8-wk avg {avg}%
            <span className="inline-flex transition-transform" style={{ transform: expanded ? "rotate(180deg)" : undefined }}>
              <Icon name="chevron" size={13} strokeWidth={2.4} />
            </span>
          </span>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto", overflow: "visible" }} role="img" aria-label={`Weekly completion trend, currently ${current} percent, ${trend.text}`}>
          <defs>
            <linearGradient id="momentum-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.42" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 50, 75].map((g) => (
            <line key={g} x1={padX} y1={y(g)} x2={W - padX} y2={y(g)} stroke="var(--text-muted)" strokeOpacity="0.12" strokeWidth="1" />
          ))}
          <line x1={padX} y1={avgY} x2={W - padX} y2={avgY} stroke="var(--text-muted)" strokeOpacity="0.45" strokeDasharray="3 4" strokeWidth="1" />
          <path d={areaPath} fill="url(#momentum-area)" />
          <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {pcts.map((p, i) =>
            i === WEEKS - 1 ? (
              <circle key={i} cx={x(i)} cy={y(p)} r="5" fill="currentColor" stroke="var(--bg-card)" strokeWidth="2.5" style={{ filter: "drop-shadow(0 0 5px var(--accent-glow))" }} />
            ) : (
              <circle key={i} cx={x(i)} cy={y(p)} r="2.6" fill="currentColor" />
            ),
          )}
        </svg>

        <div className="flex justify-between mt-2">
          {[0, 2, 4, 6].map((i) => (
            <span key={i} className="text-[9px] font-medium" style={{ color: "var(--text-muted)" }}>{fmt(weekStarts[i])}</span>
          ))}
          <span className="text-[9px] font-bold" style={{ color: "var(--accent)" }}>now</span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="mt-4 pt-4 grid grid-cols-3 gap-2" style={{ borderTop: "1px solid var(--card-border)" }}>
              <Stat label="Best week" value={`${pcts[bestIdx]}%`} sub={fmt(weekStarts[bestIdx])} />
              <Stat label="Toughest" value={`${pcts[worstIdx]}%`} sub={fmt(weekStarts[worstIdx])} />
              <Stat label="This week" value={`${doneArr[WEEKS - 1]}/${totalArr[WEEKS - 1]}`} sub="sessions" />
            </div>

            <p className="text-[11px] mt-3 mb-2" style={{ color: "var(--text-muted)" }}>
              <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{weeksAboveAvg} of {WEEKS}</span> weeks at or above your average. Pattern by day:
            </p>

            <ConsistencyHeatmap completions={completions} compact />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
