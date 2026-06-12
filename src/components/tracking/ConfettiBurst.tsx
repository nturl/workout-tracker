"use client";

import { motion, AnimatePresence } from "framer-motion";

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

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

export function ConfettiBurst({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
          {PARTICLES.map((p, i) => (
            <motion.div
              key={i}
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
              }}
              initial={{ x: "-50%", y: "-50%", scale: 1, opacity: 1 }}
              animate={{
                x: `calc(-50% + ${p.tx}px)`,
                y: `calc(-50% + ${p.ty}px)`,
                scale: 0,
                opacity: 0,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: p.delay }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
