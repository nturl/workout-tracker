"use client";

import { useId } from "react";

interface StreakCounterProps {
  streak: number;
  weekDone: number;
  weekTotal: number;
  bestStreak: number;
}

function Ring({ value, max, from, to, size = 56 }: { value: number; max: number; from: string; to: string; size?: number }) {
  const gid = useId();
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference * (1 - pct);
  const isFull = pct >= 1;

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90"
      style={{ filter: `drop-shadow(0 0 ${isFull ? 7 : 3}px ${from})` }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: from }} />
          <stop offset="100%" style={{ stopColor: to }} />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="var(--bg-elevated)" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={`url(#${gid})`} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700 ease-out" />
    </svg>
  );
}

export function StreakCounter({ streak, weekDone, weekTotal, bestStreak }: StreakCounterProps) {
  const stats = [
    { value: streak, max: 7, label: "Streak", from: "#f97316", to: "#fb923c" },
    { value: weekDone, max: weekTotal, label: "This Week", from: "var(--accent)", to: "var(--accent-light)", sub: `/${weekTotal}` },
    { value: bestStreak, max: Math.max(bestStreak, 7), label: "Best", from: "#a855f7", to: "#c084fc" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3" role="group" aria-label="Workout statistics">
      {stats.map((s, i) => (
        <div key={i} className="glass-card rounded-2xl p-3 flex flex-col items-center gap-1.5">
          <div className="relative">
            <Ring value={s.value} max={s.max} from={s.from} to={s.to} />
            <span className="absolute inset-0 flex items-center justify-center text-xl font-black tabular-nums" style={{ color: "var(--text-primary)" }}>
              {s.value}
            </span>
          </div>
          <p className="text-xs font-semibold tracking-wide" style={{ color: "var(--text-muted)" }}>
            {s.label}
            {s.sub && <span className="opacity-60">{s.sub}</span>}
          </p>
        </div>
      ))}
    </div>
  );
}
