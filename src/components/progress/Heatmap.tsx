"use client";

import { memo, useState, useCallback } from "react";
import { weeklyPlan } from "@/lib/workoutData";
import { DAYS, weekKey, sessionKey } from "@/lib/helpers";
import { DOT_COLORS } from "@/lib/colors";
import type { CompletionRecord } from "@/types/workout";

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface CellData {
  date: Date;
  pct: number;
  dayIdx: number;
  weekIdx: number;
}

export const ConsistencyHeatmap = memo(function ConsistencyHeatmap({ completions, compact = false }: { completions: CompletionRecord; compact?: boolean }) {
  const weeks = 8;
  const today = new Date();
  const [tapped, setTapped] = useState<string | null>(null);

  // Build cell grid: cells[dayIdx][weekIdx]
  const grid: CellData[][] = Array.from({ length: 7 }, () => []);
  const weekStarts: Date[] = [];

  for (let weekIdx = 0; weekIdx < weeks; weekIdx++) {
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const i = (weeks - 1 - weekIdx) * 7 + (6 - dayIdx);
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dayName = DAYS[d.getDay()];
      const wk = weekKey(d);
      const plan = weeklyPlan.find((p) => p.day === dayName);

      if (dayIdx === 0) weekStarts.push(new Date(d));

      if (!plan) {
        grid[dayIdx].push({ date: d, pct: 0, dayIdx, weekIdx });
        continue;
      }
      const total = plan.sessions.length;
      const done = plan.sessions.filter((s) => completions[sessionKey(wk, dayName, s)]).length;
      grid[dayIdx].push({ date: d, pct: total > 0 ? done / total : 0, dayIdx, weekIdx });
    }
  }

  // Week completion percentages for footer
  const weekPcts = Array.from({ length: weeks }, (_, weekIdx) => {
    let total = 0, done = 0;
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const cell = grid[dayIdx][weekIdx];
      const dayName = DAYS[cell.date.getDay()];
      const wk = weekKey(cell.date);
      const plan = weeklyPlan.find((p) => p.day === dayName);
      if (!plan) continue;
      total += plan.sessions.length;
      done += plan.sessions.filter((s) => completions[sessionKey(wk, dayName, s)]).length;
    }
    return total > 0 ? Math.round((done / total) * 100) : 0;
  });

  // Current week index
  const todayWk = weekKey(today);
  const currentWeekIdx = weekStarts.findIndex((ws) => weekKey(ws) === todayWk);

  // Primary category per day (for dot colors)
  const dayCategories = DAY_LABELS.map((_, i) => {
    const dayName = DAYS[i];
    const plan = weeklyPlan.find((p) => p.day === dayName);
    return plan?.sessions[0]?.category || "recovery";
  });

  const handleTap = useCallback((key: string) => {
    setTapped((prev) => (prev === key ? null : key));
  }, []);

  // Column count: 1 for labels + 8 for weeks

  return (
    <div>
      {/* Legend */}
      <div className={`flex items-center ${compact ? "justify-end" : "justify-between"} mb-3`}>
        {!compact && <span className="text-[15px] leading-[22px] font-semibold text-content-primary">8-Week History</span>}
        <div className="flex items-center gap-1 text-[10px] text-content-muted">
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <div key={v} className="w-3 h-3 rounded-sm" style={{
              backgroundColor: v === 0 ? "var(--heatmap-empty)" : `rgba(var(--heatmap-fill), ${0.2 + v * 0.8})`,
            }} />
          ))}
          <span>More</span>
        </div>
      </div>

      <div
        className="gap-[3px]"
        role="grid"
        aria-label="Workout consistency heatmap"
        style={{
          display: "grid",
          gridTemplateColumns: `2.4rem repeat(${weeks}, 1fr)`,
          gridTemplateRows: `1.4rem repeat(7, 1fr) 1.2rem`,
        }}
      >
        {/* Header row: empty corner + week date labels */}
        <div />
        {weekStarts.map((ws, wi) => (
          <div
            key={`wh-${wi}`}
            className="text-[9px] font-medium text-center truncate px-0.5 text-content-muted"
          >
            {ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </div>
        ))}

        {/* Day rows: label + cells */}
        {Array.from({ length: 7 }).map((_, dayIdx) => {
          const category = dayCategories[dayIdx];
          const dotColor = DOT_COLORS[category] || "#6b7280";

          return [
            /* Row label with dot */
            <div
              key={`rl-${dayIdx}`}
              className="flex items-center gap-1 pr-1 text-content-muted"
            >
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: dotColor }}
              />
              <span className="text-[10px] font-semibold leading-none">{DAY_LABELS[dayIdx]}</span>
            </div>,

            /* Cells for this day across all weeks */
            ...grid[dayIdx].map((cell, weekIdx) => {
              const isToday = cell.date.toDateString() === today.toDateString();
              const isCurrentWeek = weekIdx === currentWeekIdx;
              const cellKey = `${dayIdx}-${weekIdx}`;
              const isTapped = tapped === cellKey;
              const dateStr = cell.date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              const pctStr = `${Math.round(cell.pct * 100)}%`;

              return (
                <div key={cellKey} className="relative">
                  <div
                    role="gridcell"
                    aria-label={`${cell.date.toLocaleDateString()} - ${Math.round(cell.pct * 100)}% complete`}
                    className={`w-full aspect-square rounded-md transition-all cursor-pointer ${isToday ? "ring-2 ring-offset-1 scale-110" : ""}`}
                    style={{
                      backgroundColor: cell.pct === 0
                        ? (isCurrentWeek ? "var(--heatmap-current-empty, var(--heatmap-empty))" : "var(--heatmap-empty)")
                        : `rgba(var(--heatmap-fill), ${0.2 + cell.pct * 0.8})`,
                      ...(isCurrentWeek && cell.pct === 0 ? {
                        boxShadow: "inset 0 0 0 1px var(--accent-glow)",
                      } : {}),
                      ...(isToday ? {
                        ["--tw-ring-color" as string]: "var(--accent)",
                        ["--tw-ring-offset-color" as string]: "var(--ring-offset)",
                        boxShadow: "0 0 8px var(--accent-glow)",
                      } : {}),
                    }}
                    title={`${cell.date.toLocaleDateString()} - ${Math.round(cell.pct * 100)}%`}
                    onClick={() => handleTap(cellKey)}
                  />
                  {/* Mobile tap tooltip */}
                  {isTapped && (
                    <div
                      className="absolute z-10 px-2 py-1 rounded-button text-[10px] font-semibold whitespace-nowrap pointer-events-none glass-card text-content-primary"
                      style={{
                        bottom: "calc(100% + 4px)",
                        left: "50%",
                        transform: "translateX(-50%)",
                      }}
                    >
                      {dateStr} - {pctStr}
                    </div>
                  )}
                </div>
              );
            }),
          ];
        })}

        {/* Footer row: empty corner + week completion percentages */}
        <div />
        {weekPcts.map((pct, wi) => (
          <div
            key={`wf-${wi}`}
            className="text-[9px] font-bold text-center tabular-nums"
            style={{
              color: pct === 100 ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {pct}%
          </div>
        ))}
      </div>
    </div>
  );
});
