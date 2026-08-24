// NOTE (DESIGN_SPEC.md §4): for entrance animations and tap feedback, prefer
// the CSS utilities in globals.css (.anim-fade-up, .anim-scale-in,
// .anim-stagger, .pressable) over these framer-motion helpers. framer-motion
// is now reserved for ui/Sheet.tsx, chat/ChatSheet.tsx, and
// labs/MarkerDetailSheet.tsx (AnimatePresence exit animations / drag).
// The exports below remain for any existing callers.

// Shared spring configs for consistent motion across the app
export const spring = {
  snappy: { type: "spring" as const, damping: 30, stiffness: 300 },
  gentle: { type: "spring" as const, damping: 25, stiffness: 200 },
  bouncy: { type: "spring" as const, damping: 20, stiffness: 300 },
};

// Fade-up entrance used by cards, banners, etc.
export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

// Staggered children container
export const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
