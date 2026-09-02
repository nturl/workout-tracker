"use client";

import type { CSSProperties } from "react";
import { DOT_COLORS } from "@/lib/colors";

// BUG-23: was a standalone hardcoded hex palette. Now rides design tokens
// (var(--accent)/var(--warning)/var(--danger)) plus existing DOT_COLORS
// entries instead of introducing new off-token literals.
const COLORS = [
  "var(--accent)",
  DOT_COLORS.strength,
  "var(--warning)",
  "var(--danger)",
  DOT_COLORS.meditation,
  DOT_COLORS.posture,
];

// Particle geometry is rolled once at module load, not during render - render
// must stay pure (react-compiler). Bursts reuse the same scatter, which reads
// identically in practice at 0.6s.
const PARTICLES = Array.from({ length: 20 }, (_, i) => {
  const angle = (i / 20) * 360;
  const distance = 40 + Math.random() * 60;
  return {
    tx: Math.cos((angle * Math.PI) / 180) * distance,
    ty: Math.sin((angle * Math.PI) / 180) * distance,
    size: 4 + Math.random() * 4,
    delay: Math.random() * 0.15,
    color: COLORS[i % COLORS.length],
  };
});

// Pure-CSS burst: particles are driven by the shared `confetti-burst`
// keyframes (globals.css) via per-particle --tx/--ty custom properties.
export function ConfettiBurst({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={
            {
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              "--tx": `${p.tx}px`,
              "--ty": `${p.ty}px`,
              animation: `confetti-burst 0.6s ease-out ${p.delay}s both`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
