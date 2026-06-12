"use client";

import { Icon } from "@/components/ui/Icon";
import type { RecentDay } from "@/lib/helpers";

interface HabitCardProps {
  label: string;
  doneToday: boolean;
  streak: number;
  bestStreak: number;
  expanded: boolean;
  recentDays: (RecentDay & { logged: boolean })[];
  onToggleToday: () => void;
  onToggleDate: (dateKey: string) => void;
  onExpandToggle: () => void;
}

export function HabitCard({
  label,
  doneToday,
  streak,
  bestStreak,
  expanded,
  recentDays,
  onToggleToday,
  onToggleDate,
  onExpandToggle,
}: HabitCardProps) {
  return (
    <div
      className="glass-card rounded-xl px-3 py-2"
      role="group"
      aria-label={`${label} tracker`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleToday}
          aria-pressed={doneToday}
          aria-label={doneToday ? `Mark ${label} today as not done` : `Mark ${label} today as done`}
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          style={{
            background: doneToday ? "var(--accent)" : "var(--bg-elevated)",
            color: doneToday ? "#fff" : "var(--text-muted)",
            boxShadow: doneToday ? "0 0 8px var(--accent-glow)" : "none",
          }}
        >
          <Icon name="check" size={15} strokeWidth={3} />
        </button>

        <button
          type="button"
          onClick={onExpandToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} ${label} history`}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <span className="flex-1 min-w-0 text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
            {label}
          </span>
          <span className="flex items-center gap-1 shrink-0 tabular-nums">
            <span className="inline-flex" style={{ color: streak > 0 ? "#f97316" : "var(--text-muted)" }}>
              <Icon name="flame" size={13} strokeWidth={2.2} />
            </span>
            <span className="text-base font-black" style={{ color: streak > 0 ? "#f97316" : "var(--text-muted)" }}>{streak}</span>
            <span className="text-[10px] font-semibold ml-0.5" style={{ color: "var(--text-muted)" }}>best {bestStreak}</span>
          </span>
          <span
            className="shrink-0 inline-flex transition-transform"
            style={{
              color: "var(--text-muted)",
              transform: expanded ? "rotate(180deg)" : undefined,
            }}
          >
            <Icon name="chevron" size={13} strokeWidth={2.4} />
          </span>
        </button>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t flex items-center justify-between gap-1" style={{ borderColor: "var(--bg-elevated)" }}>
          {recentDays.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => onToggleDate(d.key)}
              aria-pressed={d.logged}
              aria-label={`${d.logged ? "Unlog" : "Log"} ${label} for ${d.key}${d.isToday ? " (today)" : ""}`}
              className="flex-1 flex flex-col items-center gap-1 py-1 rounded-lg transition-all active:scale-95"
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
                style={{
                  background: d.logged ? "var(--accent)" : "var(--bg-elevated)",
                  color: d.logged ? "#fff" : "var(--text-muted)",
                  outline: d.isToday ? "2px solid var(--accent-light)" : "none",
                  outlineOffset: "1px",
                }}
              >
                {d.logged ? <Icon name="check" size={11} strokeWidth={3.5} /> : null}
              </span>
              <span className="text-[10px] font-bold tracking-wide" style={{ color: d.isToday ? "var(--text-primary)" : "var(--text-muted)" }}>
                {d.dayLabel}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
