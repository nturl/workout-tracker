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
