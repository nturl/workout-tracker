"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

  // BUG-17 fix: read the latest settings via a ref inside the clock effect
  // instead of depending on the timerSettings object directly. setTimerSettings
  // always installs a brand-new object (useWorkoutStore.ts), so any unrelated
  // settings write anywhere in the (deliberately kept-mounted) app would
  // otherwise tear down and recreate this clock mid-count, restarting the
  // countdown from `seconds` instead of continuing from where it was.
  const timerSettingsRef = useRef(timerSettings);
  useEffect(() => {
    timerSettingsRef.current = timerSettings;
  }, [timerSettings]);

  useEffect(() => {
    const clockRef: { current: ClockController | null } = { current: null };
    let goTimeout: ReturnType<typeof setTimeout> | null = null;

    clockRef.current = startCountdownClock({
      durationSeconds: seconds,
      onTick: ({ secondsLeft }) => {
        if (completedRef.current) return;
        setCount(secondsLeft);
        if (secondsLeft > 0) {
          if (timerSettingsRef.current.audio) playCountdownIntro(false);
          if (timerSettingsRef.current.haptics) vibrateRep();
        }
      },
      onComplete: () => {
        if (completedRef.current) return;
        completedRef.current = true;
        setCount(0);
        if (timerSettingsRef.current.audio) playCountdownIntro(true);
        if (timerSettingsRef.current.haptics) vibrateSetComplete();
        // Small delay so the "GO" flashes before the timer screen takes over.
        goTimeout = setTimeout(() => onCompleteRef.current(), 350);
      },
    });

    return () => {
      clockRef.current?.stop();
      if (goTimeout) clearTimeout(goTimeout);
    };
  }, [seconds]);

  const handleSkip = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onSkip?.();
    onCompleteRef.current();
  };

  // BUG-29 fix: portal to document.body so this overlay's `fixed inset-0`
  // is never nested under an ancestor whose entrance animation holds a
  // non-`none` transform (which would make that ancestor a containing block
  // for `position: fixed` and trap this overlay inside e.g. a SessionCard's
  // expanded accordion). Lazy initializer (not an effect) so SSR never
  // touches `document` but the portal target is available from this
  // component's very first client render - no extra render pass needed.
  const [portalTarget] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" ? document.body : null
  );

  const showGo = count <= 0;
  const displayValue = showGo ? "GO" : String(count);
  const color = showGo ? "var(--accent)" : count === 1 ? "var(--warning)" : "var(--accent-light)";

  const content = (
    <button
      type="button"
      onClick={handleSkip}
      aria-label="Skip countdown"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md cursor-pointer select-none anim-fade-up"
    >
      {/* Key-based remount: each digit swap replays the scale-in animation. */}
      <div key={displayValue} className="anim-scale-in relative flex flex-col items-center">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{
            width: showGo ? 360 : 260,
            height: showGo ? 360 : 260,
            border: `3px solid ${color}`,
            opacity: 0.25,
            filter: "blur(1px)",
          }}
        />
        {/* BUG-18 fix: numerals stay Inter (drop font-display) so tabular-nums
            actually holds each digit's advance width - see layout.tsx:9-11. */}
        <span
          className="font-bold tabular-nums leading-none"
          style={{
            fontSize: showGo ? "10rem" : "14rem",
            color,
            textShadow: `0 0 60px color-mix(in srgb, ${color} 50%, transparent)`,
            letterSpacing: "-0.05em",
          }}
        >
          {displayValue}
        </span>
      </div>
      <span className="absolute bottom-16 text-sm font-medium text-white/60 tracking-wide">
        Tap to skip
      </span>
    </button>
  );

  if (!portalTarget) return null;
  return createPortal(content, portalTarget);
}
