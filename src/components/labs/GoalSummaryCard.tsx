"use client";

import type { HealthGoal } from "@/types/biomarker";

const PRIORITY_COLORS: Record<HealthGoal["priority"], string> = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--accent)",
};

interface Props {
  goals: HealthGoal[];
  onSelectGoal: (index: number) => void;
}

export function GoalSummaryCard({ goals, onSelectGoal }: Props) {
  if (goals.length === 0) return null;

  return (
    <div className="anim-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm" aria-hidden="true">
          🧬
        </span>
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-content-secondary">
          Health Protocol
        </h3>
        <div
          className="flex-1 h-px ml-2"
          style={{
            background:
              "linear-gradient(to right, var(--card-border), transparent)",
          }}
        />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 no-scrollbar anim-stagger">
        {goals.map((goal, i) => {
          const color = PRIORITY_COLORS[goal.priority];

          return (
            <button
              key={goal.id}
              onClick={() => onSelectGoal(i)}
              className="anim-fade-up pressable shrink-0 rounded-card p-4 text-left relative overflow-hidden glass-card transition-shadow duration-200 hover:shadow-card-hover"
              style={{ width: 160, "--stagger-i": i } as React.CSSProperties}
            >
              {/* Bottom priority accent */}
              <div
                className="absolute bottom-0 left-0 right-0 h-1 rounded-b-card"
                style={{
                  background: color,
                  opacity: 0.7,
                }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 h-8 rounded-b-card pointer-events-none"
                style={{
                  background: `linear-gradient(to top, color-mix(in srgb, ${color} 8%, transparent), transparent)`,
                }}
              />

              {/* Goal number as tinted circle */}
              <span
                className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold mb-2.5"
                style={{
                  background: `color-mix(in srgb, ${color} 16%, transparent)`,
                  color,
                }}
              >
                {goal.number}
              </span>

              <p className="text-xs font-bold line-clamp-2 leading-snug text-content-primary">
                {goal.title}
              </p>
              <p className="text-[10px] mt-1.5 line-clamp-1 text-content-muted">
                {goal.healthImpact}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
