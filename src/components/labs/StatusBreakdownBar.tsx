"use client";

import { motion } from "framer-motion";
import { fadeUp, spring } from "@/lib/motion";
import { STATUS_CONFIG, type BiomarkerStatus } from "@/types/biomarker";

interface Props {
  breakdown: Record<BiomarkerStatus, number>;
}

const ORDER: BiomarkerStatus[] = ["optimal", "normal", "attention", "out_of_range"];

export function StatusBreakdownBar({ breakdown }: Props) {
  const total = ORDER.reduce((sum, s) => sum + breakdown[s], 0);
  if (total === 0) return null;

  const activeStatuses = ORDER.filter((s) => breakdown[s] > 0);

  return (
    <motion.div
      variants={fadeUp}
      className="rounded-2xl p-5"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle, var(--glass-border))",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between mb-3">
        <span
          className="text-sm font-black tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          {total} Total
        </span>
        <span
          className="text-[11px] font-bold"
          style={{ color: "var(--text-secondary)" }}
        >
          {breakdown.optimal + breakdown.normal} in range - {breakdown.attention + breakdown.out_of_range} flagged
        </span>
      </div>

      {/* Bar with glow */}
      <div className="relative mb-4">
        {/* Glow layer - sits behind the bar */}
        <div
          className="absolute inset-0 top-1 rounded-xl overflow-hidden flex"
          style={{ filter: "blur(8px)", opacity: 0.4 }}
        >
          {activeStatuses.map((status) => {
            const pct = (breakdown[status] / total) * 100;
            return (
              <div
                key={status}
                style={{
                  width: `${pct}%`,
                  background: STATUS_CONFIG[status].color,
                }}
              />
            );
          })}
        </div>

        {/* Main bar */}
        <div
          className="relative rounded-xl overflow-hidden flex h-4"
          style={{ background: "var(--bg-elevated)" }}
        >
          {ORDER.map((status) => {
            const count = breakdown[status];
            if (count === 0) return null;
            const pct = (count / total) * 100;
            return (
              <motion.div
                key={status}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={spring.snappy}
                className="relative overflow-hidden"
                style={{ background: STATUS_CONFIG[status].color }}
                title={`${STATUS_CONFIG[status].label}: ${count}`}
              >
                {/* Glossy inner highlight */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to bottom, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 60%)",
                  }}
                />
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Legend pills */}
      <div className="flex flex-wrap gap-2">
        {activeStatuses.map((status) => (
          <span
            key={status}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
            style={{
              background: `${STATUS_CONFIG[status].color}18`,
              color: STATUS_CONFIG[status].color,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: STATUS_CONFIG[status].color }}
            />
            {breakdown[status]} {STATUS_CONFIG[status].label}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
