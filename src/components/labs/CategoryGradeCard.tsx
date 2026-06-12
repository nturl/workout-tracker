"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer, spring } from "@/lib/motion";
import type { GradedCategory } from "@/hooks/useBiomarkers";
import { STATUS_CONFIG } from "@/types/biomarker";
import type { BiomarkerCategory, BiomarkerStatus } from "@/types/biomarker";

// ---------------------------------------------------------------------------
// Category icon + short label maps
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<BiomarkerCategory, string> = {
  cbc: "\u{1FA78}",
  metabolic: "\u26A1",
  lipids: "\u{1F4A7}",
  liver: "\u{1FAC0}",
  kidney: "\u{1FAD8}",
  thyroid: "\u{1F98B}",
  hormones: "\u{1F9EC}",
  iron: "\u{1F529}",
  vitamins: "\u{1F48A}",
  electrolytes: "\u26A1",
  coagulation: "\u{1FA79}",
  inflammation: "\u{1F525}",
  cardiac: "\u2764\uFE0F",
  tumor_markers: "\u{1F52C}",
  immune: "\u{1F6E1}\uFE0F",
  glucose: "\u{1F36C}",
  minerals: "\u{1F48E}",
  other: "\u{1F4CA}",
};

const SHORT_LABELS: Partial<Record<BiomarkerCategory, string>> = {
  cbc: "Blood Count",
  metabolic: "Metabolic",
  lipids: "Lipids",
  liver: "Liver",
  kidney: "Kidney",
  iron: "Iron",
  glucose: "Glucose",
  tumor_markers: "Tumor",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RING_R = 18;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;
const STATUS_ORDER: BiomarkerStatus[] = [
  "optimal",
  "normal",
  "attention",
  "out_of_range",
];

interface Props {
  categories: GradedCategory[];
  onSelect: (category: string) => void;
  onHoverCategory?: (category: string | null) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CategoryGradeCards({ categories, onSelect, onHoverCategory }: Props) {
  if (categories.length === 0) return null;

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 gap-3"
    >
      {categories.map((cat) => {
        const filledLength = (cat.grade.score / 100) * RING_CIRCUMFERENCE;
        const displayLabel = SHORT_LABELS[cat.category] ?? cat.label;

        return (
          <motion.button
            key={cat.category}
            variants={fadeUp}
            onClick={() => onSelect(cat.category)}
            onMouseEnter={() => onHoverCategory?.(cat.category)}
            onMouseLeave={() => onHoverCategory?.(null)}
            onTouchStart={() => onHoverCategory?.(cat.category)}
            onTouchEnd={() => onHoverCategory?.(null)}
            className="group relative rounded-2xl p-4 text-left transition-all
                       duration-200 hover:scale-[1.03] active:scale-[0.97]"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle, var(--glass-border))",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {/* Hover border glow overlay */}
            <span
              className="pointer-events-none absolute inset-0 rounded-2xl
                         opacity-0 transition-opacity duration-200
                         group-hover:opacity-100"
              style={{
                boxShadow: `0 0 16px 2px ${cat.grade.color}33`,
              }}
            />

            {/* Top row - icon, grade ring, label */}
            <div className="flex items-center gap-2.5 mb-3">
              {/* Category icon */}
              <span className="text-lg leading-none select-none shrink-0">
                {CATEGORY_ICONS[cat.category]}
              </span>

              {/* Grade ring with glow */}
              <div className="relative shrink-0" style={{ width: 40, height: 40 }}>
                {/* Glow layer behind the ring */}
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    boxShadow: `0 0 10px 2px ${cat.grade.color}33`,
                  }}
                />

                <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90">
                  {/* Track */}
                  <circle
                    cx="22"
                    cy="22"
                    r={RING_R}
                    fill="none"
                    stroke="var(--bg-elevated)"
                    strokeWidth="3.5"
                  />
                  {/* Filled arc */}
                  <motion.circle
                    cx="22"
                    cy="22"
                    r={RING_R}
                    fill="none"
                    stroke={cat.grade.color}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeDasharray={`${filledLength} ${RING_CIRCUMFERENCE}`}
                    initial={{
                      strokeDasharray: `0 ${RING_CIRCUMFERENCE}`,
                    }}
                    animate={{
                      strokeDasharray: `${filledLength} ${RING_CIRCUMFERENCE}`,
                    }}
                    transition={spring.snappy}
                  />
                </svg>

                {/* Letter label */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="text-xs font-black"
                    style={{ color: cat.grade.color }}
                  >
                    {cat.grade.letter}
                  </span>
                </div>
              </div>

              {/* Category name + count */}
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-black truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {displayLabel}
                </p>
                <p className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  {cat.markerCount} marker{cat.markerCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {/* Status dots row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {STATUS_ORDER.map((status) => {
                const count = cat.statusBreakdown[status] ?? 0;
                if (count === 0) return null;
                const { color, label } = STATUS_CONFIG[status];
                return Array.from({ length: count }, (_, i) => (
                  <span
                    key={`${status}-${i}`}
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: color }}
                    title={label}
                  />
                ));
              })}
            </div>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
