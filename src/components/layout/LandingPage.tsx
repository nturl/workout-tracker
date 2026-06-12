"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { TimerRing } from "@/components/tracking/TimerRing";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const FEATURES = [
  { icon: "🗓️", title: "7-Day Program", desc: "Structured weekly plan with strength, cardio, recovery, and adventure days" },
  { icon: "📊", title: "3 Difficulty Levels", desc: "Beginner, intermediate, and advanced tiers that grow with you" },
  { icon: "❤️‍🩹", title: "Recovery Tracking", desc: "Integrate Eight Sleep and Oura Ring data to train smarter" },
  { icon: "📱", title: "SMS Logging", desc: "Text DONE to log workouts - no app needed" },
  { icon: "🔥", title: "Streak Tracking", desc: "Daily streaks, weekly progress, and consistency heatmaps" },
  { icon: "🧍", title: "Egoscue + Daily Habits", desc: "Daily postural therapy plus habit tracking for meditation and more" },
];

const DAYS_PREVIEW = [
  { day: "Mon", theme: "Build", emoji: "🏋️", color: "#3b82f6" },
  { day: "Tue", theme: "Burn", emoji: "⚡", color: "#f97316" },
  { day: "Wed", theme: "Restore", emoji: "🧘", color: "#10b981" },
  { day: "Thu", theme: "Heat", emoji: "🔥", color: "#f59e0b" },
  { day: "Fri", theme: "Build", emoji: "💪", color: "#3b82f6" },
  { day: "Sat", theme: "Explore", emoji: "🏔️", color: "#f59e0b" },
  { day: "Sun", theme: "Connect", emoji: "🤝", color: "#14b8a6" },
];

// Static product shot of the in-workout timer: real TimerRing component, no
// state, mid-sprint on the mitochondrial session.
function HeroTimerShot() {
  return (
    <div
      className="relative rounded-3xl overflow-hidden mx-auto w-full max-w-sm"
      style={{ background: "#121216", boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(420px 300px at 50% 38%, #22c55e1f, transparent 70%)" }}
      />
      <div className="relative p-5 pb-6">
        <div className="flex gap-1 mb-3" aria-hidden="true">
          {[100, 100, 58, 0, 0, 0, 0, 0].map((fill, i) => (
            <div key={i} className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.10)", flex: i % 2 === 1 ? 0.6 : 1 }}>
              <div className="h-full rounded-full" style={{ width: `${fill}%`, background: fill === 100 ? "rgba(255,255,255,0.45)" : "#22c55e" }} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full" style={{ background: "#22c55e26", color: "#22c55e" }}>
            GO!
          </span>
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: "rgba(255,255,255,0.45)" }}>
            Round 2/4 · 3/8
          </span>
        </div>
        <div className="flex justify-center my-2">
          <TimerRing pct={58} color="#22c55e" cycleKey="hero">
            <p className="text-sm font-bold text-white leading-tight">Round 2: All-out</p>
            <p className="font-black tabular-nums text-white" style={{ fontSize: "3.75rem", lineHeight: 1.05, letterSpacing: "-0.02em" }}>
              13
            </p>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>Next: Round 2: Recovery</p>
          </TimerRing>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(900px 600px at 80% -10%, rgba(30, 215, 96, 0.10), transparent 55%), radial-gradient(800px 600px at 0% 30%, rgba(59, 130, 246, 0.07), transparent 55%), linear-gradient(180deg, #000 0%, #0a0a0a 40%, #050d05 100%)",
      }}
    >
      {/* Hero */}
      <div className="max-w-2xl mx-auto px-6 pt-16 pb-14">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <p className="font-display font-semibold text-sm tracking-[0.2em] uppercase mb-6" style={{ color: "#1ed760" }}>
            Boundless
          </p>
          <h1
            className="font-display text-5xl sm:text-6xl font-bold mb-6 leading-[1.05]"
            style={{ background: "linear-gradient(135deg, #ffffff 0%, #1ed760 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          >
            Train Smarter.<br />
            Recover Better.
          </h1>
          <p className="text-lg text-neutral-400 max-w-md mx-auto mb-10 leading-relaxed">
            A structured 7-day workout program with recovery tracking, personalized intensity, and SMS logging.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-14">
            <SignUpButton mode="redirect">
              <button className="px-8 py-3.5 rounded-full font-bold text-black bg-white hover:bg-neutral-200 transition-all text-sm w-full sm:w-auto">
                Get Started Free
              </button>
            </SignUpButton>
            <SignInButton mode="redirect">
              <button className="px-8 py-3.5 rounded-full font-bold text-sm w-full sm:w-auto transition-all text-white"
                style={{ background: "rgba(255,255,255,0.08)" }}>
                Sign In
              </button>
            </SignInButton>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.25, duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <HeroTimerShot />
        </motion.div>
      </div>

      {/* Week preview */}
      <div className="max-w-2xl mx-auto px-6 pb-16">
        <motion.div
          className="rounded-2xl p-6"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          <p className="font-display font-semibold text-xs tracking-[0.18em] uppercase text-neutral-500 mb-5">Your Week</p>
          <div className="grid grid-cols-7 gap-3">
            {DAYS_PREVIEW.map((d) => (
              <div key={d.day} className="text-center">
                <div className="w-11 h-11 sm:w-12 sm:h-12 mx-auto rounded-full flex items-center justify-center text-lg sm:text-xl mb-2"
                  style={{ background: `${d.color}20` }}>
                  {d.emoji}
                </div>
                <p className="text-xs font-bold text-neutral-300">{d.day}</p>
                <p className="text-[10px] sm:text-xs text-neutral-600">{d.theme}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Features */}
      <div className="max-w-2xl mx-auto px-6 pb-20">
        <h2 className="font-display text-2xl font-bold text-white text-center mb-10">Everything You Need</h2>
        <motion.div className="grid grid-cols-1 sm:grid-cols-2 gap-3" variants={staggerContainer} initial="hidden" animate="visible">
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              className="rounded-2xl p-5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(12px)" }}
              variants={fadeUp}
            >
              <span className="text-2xl mb-3 block">{f.icon}</span>
              <h3 className="font-display font-semibold text-white text-sm mb-1">{f.title}</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* CTA */}
      <div className="max-w-2xl mx-auto px-6 pb-20 text-center">
        <div className="rounded-2xl p-10" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 className="font-display text-3xl font-bold text-white mb-3">Ready to start?</h2>
          <p className="text-sm text-neutral-400 mb-8">Free to use. No credit card required.</p>
          <SignUpButton mode="redirect">
            <button className="px-8 py-3.5 rounded-full font-bold text-black bg-white hover:bg-neutral-200 transition-all text-sm">
              Create Your Account
            </button>
          </SignUpButton>
        </div>
      </div>

      <footer className="text-center pb-8">
        <p className="text-xs text-neutral-600">Built on the Boundless fitness blueprint by Ben Greenfield</p>
      </footer>
    </div>
  );
}
