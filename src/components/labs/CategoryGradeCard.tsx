"use client";

import type { CSSProperties } from "react";
import type { GradedCategory } from "@/hooks/useBiomarkers";
import { STATUS_CONFIG } from "@/types/biomarker";
import type { BiomarkerCategory, BiomarkerStatus } from "@/types/biomarker";

// ---------------------------------------------------------------------------
// Category icon + short label maps
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<BiomarkerCategory, string> = {
  cbc: "\u{1FA78}",
  metabolic: "\u{26A1}",
  lipids: "\u{1F4A7}",
  liver: "\u{1FAC0}",
  kidney: "\u{1FAD8}",
  thyroid: "\u{1F98B}",
  hormones: "\u{1F9EC}",
  iron: "\u{1F529}",
  vitamins: "\u{1F48A}",
  electrolytes: "\u{26A1}",
  coagulation: "\u{1FA79}",
  inflammation: "\u{1F525}",
  cardiac: "\u{2764}\u{FE0F}",
  tumor_markers: "\u{1F52C}",
  immune: "\u{1F6E1}\u{FE0F}",
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
    <div className="anim-stagger grid grid-cols-2 gap-3">
      {categories.map((cat, i) => {
        const filledLength = (cat.grade.score / 100) * RING_CIRCUMFERENCE;
        const displayLabel = SHORT_LABELS[cat.category] ?? cat.label;

        return (
          <button
            key={cat.category}
            onClick={() => onSelect(cat.category)}
            onMouseEnter={() => onHoverCategory?.(cat.category)}
            onMouseLeave={() => onHoverCategory?.(null)}
            onTouchStart={() => onHoverCategory?.(cat.category)}
            onTouchEnd={() => onHoverCategory?.(null)}
            className="anim-fade-up pressable group relative glass-card rounded-card p-4 text-left"
            style={{ "--stagger-i": i } as CSSProperties}
          >
            {/* Hover border glow overlay */}
            <span
              className="pointer-events-none absolute inset-0 rounded-card
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
                  <circle
                    cx="22"
                    cy="22"
                    r={RING_R}
                    fill="none"
                    stroke={cat.grade.color}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeDasharray={`${filledLength} ${RING_CIRCUMFERENCE}`}
                    style={{
                      transition:
                        "stroke-dasharray var(--dur-slow) var(--ease-out-quart)",
                    }}
                  />
                </svg>

                {/* Letter label */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="font-display text-xs font-bold"
                    style={{ color: cat.grade.color }}
                  >
                    {cat.grade.letter}
                  </span>
                </div>
              </div>

              {/* Category name + count */}
              <div className="min-w-0 flex-1">
                <p
                  className="text-[17px] leading-[22px] font-semibold tracking-[-0.01em] truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {displayLabel}
                </p>
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
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
          </button>
        );
      })}
    </div>
  );
}
