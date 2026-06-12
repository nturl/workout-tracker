"use client";

import type { ReactNode } from "react";

interface TimerRingProps {
  size?: number;
  strokeWidth?: number;
  // Elapsed percentage 0..100. Animates forward once per second via CSS.
  pct: number;
  color: string;
  // Remount key for the progress arc: change it on phase/segment boundaries
  // so the arc snaps to its new position instead of animating backwards.
  cycleKey: string | number;
  children?: ReactNode;
}

// Circular countdown ring shared by CircuitTimer and RepTimer. Extends the
// StreakCounter ring language to the in-workout surfaces: track circle, glowing
// phase-colored arc, center content slot.
export function TimerRing({ size = 216, strokeWidth = 9, pct, color, cycleKey, children }: TimerRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(pct, 0), 100);
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth}
        />
        <circle
          key={cycleKey}
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 1s linear, stroke 0.3s ease",
            filter: `drop-shadow(0 0 7px ${color}59)`,
          }}
        />
      </svg>
      <div className="relative z-10 flex flex-col items-center justify-center text-center" style={{ maxWidth: size - strokeWidth * 2 - 36 }}>
        {children}
      </div>
    </div>
  );
}
