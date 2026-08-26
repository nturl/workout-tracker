"use client";

import { Icon } from "@/components/ui/Icon";
import type { RecentDay } from "@/lib/helpers";

interface HabitCardProps {
  label: string;
  statusToday: boolean | undefined;
  streak: number;
  bestStreak: number;
  expanded: boolean;
  recentDays: (RecentDay & { logged: boolean | undefined })[];
  onSetToday: (done: boolean) => void;
  onToggleDate: (dateKey: string) => void;
  onExpandToggle: () => void;
}

export function HabitCard({
  label,
  statusToday,
  streak,
  bestStreak,
  expanded,
  recentDays,
  onSetToday,
  onToggleDate,
  onExpandToggle,
}: HabitCardProps) {
  return (
    <div
      className="glass-card rounded-card px-3 py-2.5"
      role="group"
      aria-label={`${label} tracker`}
    >
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSetToday(true)}
            aria-pressed={statusToday === true}
            aria-label={`Mark ${label} today as done`}
            className="pressable w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{
              background: statusToday === true ? "var(--accent)" : "var(--bg-elevated)",
              color: statusToday === true ? "var(--accent-contrast)" : "var(--text-muted)",
              boxShadow: statusToday === true ? "0 0 8px var(--accent-glow)" : "none",
            }}
          >
            <Icon name="check" size={15} strokeWidth={3} />
          </button>
          <button
            type="button"
            onClick={() => onSetToday(false)}
            aria-pressed={statusToday === false}
            aria-label={`Mark ${label} today as missed`}
            className="pressable w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{
              background: statusToday === false ? "var(--danger)" : "var(--bg-elevated)",
              color: statusToday === false ? "var(--accent-contrast)" : "var(--text-muted)",
            }}
          >
            <Icon name="close" size={15} strokeWidth={3} />
          </button>
        </div>

        <button
          type="button"
          onClick={onExpandToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} ${label} history`}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <span className="flex-1 min-w-0 text-[17px] font-semibold tracking-[-0.01em] truncate" style={{ color: "var(--text-primary)" }}>
            {label}
          </span>
          <span className="flex items-center gap-1 shrink-0 tabular-nums">
            <span className="inline-flex" style={{ color: streak > 0 ? "#f97316" : "var(--text-muted)" }}>
              <Icon name="flame" size={13} strokeWidth={2.2} />
            </span>
            <span className="font-display text-base font-bold" style={{ color: streak > 0 ? "#f97316" : "var(--text-muted)" }}>{streak}</span>
            <span className="text-[10px] font-medium ml-0.5" style={{ color: "var(--text-muted)" }}>best {bestStreak}</span>
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
        <div className="anim-fade-up mt-2 pt-2 border-t flex items-center justify-between gap-1" style={{ borderColor: "var(--bg-elevated)" }}>
          {recentDays.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => onToggleDate(d.key)}
              aria-pressed={d.logged === true}
              aria-label={`Mark ${label} as ${d.logged === true ? "missed" : "done"} for ${d.key}${d.isToday ? " (today)" : ""}`}
              className="pressable flex-1 flex flex-col items-center gap-1 py-1 rounded-lg"
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                style={{
                  background: d.logged === true ? "var(--accent)" : d.logged === false ? "var(--danger)" : "var(--bg-elevated)",
                  color: d.logged === true || d.logged === false ? "var(--accent-contrast)" : "var(--text-muted)",
                  outline: d.isToday ? "2px solid var(--accent-light)" : "none",
                  outlineOffset: "1px",
                }}
              >
                {d.logged === true ? (
                  <Icon name="check" size={11} strokeWidth={3.5} />
                ) : d.logged === false ? (
                  <Icon name="close" size={11} strokeWidth={3.5} />
                ) : null}
              </span>
              <span className="text-[10px] font-semibold tracking-wide" style={{ color: d.isToday ? "var(--text-primary)" : "var(--text-muted)" }}>
                {d.dayLabel}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
