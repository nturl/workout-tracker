"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  playCountdownIntro,
  vibrateRep,
  vibrateSetComplete,
  startCountdownClock,
  type ClockController,
} from "@/lib/audio";
import { useWorkoutStore } from "@/hooks/useWorkoutStore";

interface CountdownIntroProps {
  seconds?: number;
  onComplete: () => void;
  onSkip?: () => void;
}

// V20: audio-clock driven. Previously used chained setTimeout(1000) which
// inherited the same drift and iOS Safari throttling as the timer tick loops.
export function CountdownIntro({ seconds = 6, onComplete, onSkip }: CountdownIntroProps) {
  const timerSettings = useWorkoutStore((s) => s.timerSettings);
  const [count, setCount] = useState(seconds);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const clockRef: { current: ClockController | null } = { current: null };
    let goTimeout: ReturnType<typeof setTimeout> | null = null;

    clockRef.current = startCountdownClock({
      durationSeconds: seconds,
      onTick: ({ secondsLeft }) => {
        if (completedRef.current) return;
        setCount(secondsLeft);
        if (secondsLeft > 0) {
          if (timerSettings.audio) playCountdownIntro(false);
          if (timerSettings.haptics) vibrateRep();
        }
      },
      onComplete: () => {
        if (completedRef.current) return;
        completedRef.current = true;
        setCount(0);
        if (timerSettings.audio) playCountdownIntro(true);
        if (timerSettings.haptics) vibrateSetComplete();
        // Small delay so the "GO" flashes before the timer screen takes over.
        goTimeout = setTimeout(() => onCompleteRef.current(), 350);
      },
    });

    return () => {
      clockRef.current?.stop();
      if (goTimeout) clearTimeout(goTimeout);
    };
  }, [seconds, timerSettings.audio, timerSettings.haptics]);

  const handleSkip = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onSkip?.();
    onCompleteRef.current();
  };

  const showGo = count <= 0;
  const displayValue = showGo ? "GO" : String(count);
  const color = showGo ? "#22c55e" : count === 1 ? "#f59e0b" : "#60a5fa";

  return (
    <AnimatePresence>
      <motion.button
        type="button"
        onClick={handleSkip}
        aria-label="Skip countdown"
        className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md cursor-pointer select-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <motion.div
          key={displayValue}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.6, opacity: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 18 }}
          className="flex flex-col items-center"
        >
          <div
            className="absolute rounded-full"
            style={{
              width: showGo ? 360 : 260,
              height: showGo ? 360 : 260,
              border: `3px solid ${color}`,
              opacity: 0.25,
              filter: "blur(1px)",
            }}
          />
          <span
            className="font-display font-bold tabular-nums leading-none"
            style={{
              fontSize: showGo ? "10rem" : "14rem",
              color,
              textShadow: `0 0 60px ${color}80`,
              letterSpacing: "-0.05em",
            }}
          >
            {displayValue}
          </span>
        </motion.div>
        <span className="absolute bottom-16 text-sm font-medium text-white/60 tracking-wide">
          Tap to skip
        </span>
      </motion.button>
    </AnimatePresence>
  );
}
