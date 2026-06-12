"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import type { HealthGoal } from "@/types/biomarker";

const PRIORITY_COLORS: Record<HealthGoal["priority"], string> = {
  high: "#ef4444",
  medium: "#eab308",
  low: "#3b82f6",
};

const PRIORITY_GRADIENTS: Record<HealthGoal["priority"], string> = {
  high: "linear-gradient(135deg, #ef4444, #f97316)",
  medium: "linear-gradient(135deg, #eab308, #f59e0b)",
  low: "linear-gradient(135deg, #3b82f6, #6366f1)",
};

interface Props {
  goals: HealthGoal[];
  onSelectGoal: (index: number) => void;
}

export function GoalSummaryCard({ goals, onSelectGoal }: Props) {
  if (goals.length === 0) return null;

  return (
    <motion.div variants={fadeUp}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm" aria-hidden="true">
          🧬
        </span>
        <h3
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          Health Protocol
        </h3>
        <div
          className="flex-1 h-px ml-2"
          style={{
            background:
              "linear-gradient(to right, var(--glass-border), transparent)",
          }}
        />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        {goals.map((goal, i) => {
          const color = PRIORITY_COLORS[goal.priority];
          const gradient = PRIORITY_GRADIENTS[goal.priority];

          return (
            <motion.button
              key={goal.id}
              onClick={() => onSelectGoal(i)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="shrink-0 rounded-2xl p-4 text-left relative overflow-hidden transition-shadow duration-200"
              style={{
                width: 160,
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle, var(--glass-border))",
                boxShadow: "var(--shadow-sm)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 0 20px ${color}22, 0 4px 16px ${color}18`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              {/* Bottom gradient glow */}
              <div
                className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl"
                style={{
                  background: gradient,
                  opacity: 0.7,
                }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 h-8 rounded-b-2xl pointer-events-none"
                style={{
                  background: `linear-gradient(to top, ${color}10, transparent)`,
                }}
              />

              {/* Goal number as gradient circle */}
              <span
                className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black text-white mb-2.5"
                style={{ background: gradient }}
              >
                {goal.number}
              </span>

              <p
                className="text-xs font-bold line-clamp-2 leading-snug"
                style={{ color: "var(--text-primary)" }}
              >
                {goal.title}
              </p>
              <p
                className="text-[10px] mt-1.5 line-clamp-1"
                style={{ color: "var(--text-muted)" }}
              >
                {goal.healthImpact}
              </p>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
