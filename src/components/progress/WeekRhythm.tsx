"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { weeklyPlan } from "@/lib/workoutData";
import { getTodayDayName, getWeekDates } from "@/lib/helpers";
import { DOT_COLORS } from "@/lib/colors";

interface WeekRhythmProps {
  selectedDay: string;
  onSelectDay: (day: string) => void;
  weekOffset: number;
  onChangeWeek: (offset: number) => void;
}

export const WeekRhythm = memo(function WeekRhythm({ selectedDay, onSelectDay, weekOffset, onChangeWeek }: WeekRhythmProps) {
  const todayName = getTodayDayName();
  const weekDates = getWeekDates(weekOffset);
  const isCurrentWeek = weekOffset === 0;

  const firstDate = weekDates[0].dateLabel;
  const lastDate = weekDates[6].dateLabel;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => onChangeWeek(weekOffset - 1)}
          aria-label="Previous week"
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all hover:opacity-70 active:scale-95"
          style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
          &lsaquo;
        </button>
        <button
          onClick={() => isCurrentWeek ? null : onChangeWeek(0)}
          className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all"
          style={{ color: "var(--text-secondary)" }}>
          {firstDate} - {lastDate}
          {!isCurrentWeek && <span className="ml-1 opacity-60">(today)</span>}
        </button>
        <button onClick={() => onChangeWeek(weekOffset + 1)}
          disabled={weekOffset >= 0}
          aria-label="Next week"
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all hover:opacity-70 disabled:opacity-20 active:scale-95"
          style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
          &rsaquo;
        </button>
      </div>
      <div className="flex gap-1 w-full" role="tablist" aria-label="Day selector">
        {weekDates.map(({ day, dateLabel }) => {
          const plan = weeklyPlan.find((d) => d.day === day);
          const isToday = isCurrentWeek && day === todayName;
          const isSelected = day === selectedDay;
          const dotColor = DOT_COLORS[plan?.sessions[plan.sessions.length - 1]?.category || "recovery"] || "#6b7280";

          return (
            <button key={day} onClick={() => onSelectDay(day)}
              role="tab" aria-selected={isSelected} aria-label={`${day} - ${dateLabel}`}
              className="relative flex-1 flex flex-col items-center py-2.5 px-1 rounded-2xl transition-all active:scale-95">
              {isSelected && (
                <motion.div
                  layoutId="day-pill"
                  className="absolute inset-0 rounded-2xl"
                  style={{ background: "var(--bg-card)", boxShadow: "var(--card-shadow)" }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                />
              )}
              <span className="relative text-[10px] font-bold uppercase" style={{
                color: isSelected ? "var(--text-primary)" : isToday ? "var(--accent)" : "var(--text-muted)",
              }}>{day.slice(0, 3)}</span>
              <span className="relative text-xs font-semibold mt-0.5 tabular-nums" style={{
                color: isSelected ? "var(--text-primary)" : "var(--text-muted)",
              }}>{dateLabel.split(" ")[1]}</span>
              <div className="relative w-1.5 h-1.5 rounded-full mt-1.5" style={{
                background: isSelected ? "var(--accent)" : dotColor,
                opacity: isSelected ? 1 : 0.5,
              }} />
            </button>
          );
        })}
      </div>
    </div>
  );
});
