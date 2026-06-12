"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { RepProtocol } from "@/lib/workoutData";
import { useWorkoutStore } from "@/hooks/useWorkoutStore";
import {
  unlockAudio,
  playRepTick,
  playSetComplete,
  playCountdown,
  vibrateRep,
  vibrateSetComplete,
  requestWakeLock,
  releaseWakeLock,
  startCountdownClock,
  type ClockController,
} from "@/lib/audio";
import { CountdownIntro } from "./CountdownIntro";
import { TimerRing } from "./TimerRing";
import { Icon } from "@/components/ui/Icon";

const PHASE_COLOR = {
  up: "#22c55e",
  down: "#f59e0b",
  done: "#60a5fa",
  idle: "#6b7280",
} as const;

const DEFAULT_PROTOCOL: RepProtocol = {
  upSeconds: 10,
  downSeconds: 10,
  targetReps: 6,
  toFailure: true,
};

interface RepTimerProps {
  protocol?: RepProtocol;
  exerciseName?: string;
  onComplete?: (result: { reps: number; tutSeconds: number }) => void;
}

type Phase = "idle" | "up" | "down" | "done";

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RepTimer({ protocol = DEFAULT_PROTOCOL, exerciseName, onComplete }: RepTimerProps) {
  const timerSettings = useWorkoutStore((s) => s.timerSettings);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [phaseSecondsLeft, setPhaseSecondsLeft] = useState(protocol.upSeconds);
  const phaseSecondsLeftRef = useRef(protocol.upSeconds);
  useEffect(() => {
    phaseSecondsLeftRef.current = phaseSecondsLeft;
  }, [phaseSecondsLeft]);
  const [currentRep, setCurrentRep] = useState(0); // 0 means "not started"; increments after each completed down phase
  const [tutSeconds, setTutSeconds] = useState(0);
  const tutSecondsRef = useRef(0);
  const [running, setRunning] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);

  const clockRef = useRef<ClockController | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  const totalReps = protocol.targetReps;
  const phaseDuration = phase === "up" ? protocol.upSeconds : protocol.downSeconds;
  const phaseLabel = phase === "up" ? "UP" : phase === "down" ? "DOWN" : "";
  const phaseColor = PHASE_COLOR[phase];

  const triggerRepBeep = useCallback(() => {
    if (timerSettings.audio) playRepTick();
    if (timerSettings.haptics) vibrateRep();
  }, [timerSettings.audio, timerSettings.haptics]);

  const triggerSetCompleteBeep = useCallback(() => {
    if (timerSettings.audio) playSetComplete();
    if (timerSettings.haptics) vibrateSetComplete();
  }, [timerSettings.audio, timerSettings.haptics]);

  // Exercise/protocol changes reset this timer via a remount: SessionCard
  // keys the RepTimer on the active slug + protocol, so all state re-inits.

  // Cleanup wake lock on unmount
  useEffect(() => {
    return () => {
      releaseWakeLock(wakeLockRef.current).catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  // Re-acquire wake lock when page becomes visible again
  useEffect(() => {
    if (!running || !timerSettings.wakeLock) return;
    const handler = async () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        wakeLockRef.current = await requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [running, timerSettings.wakeLock]);

  // Main tick loop (V20: audio-clock driven, drift-free).
  useEffect(() => {
    if (!running || phase === "idle" || phase === "done") {
      if (clockRef.current) {
        clockRef.current.stop();
        clockRef.current = null;
      }
      return;
    }

    // Use phaseSecondsLeft as duration so pause-resume mid-phase works:
    // on fresh phase start, phaseSecondsLeft equals the full duration; on
    // resume, it equals the remaining seconds at pause. Ref-read so the
    // effect doesn't re-run every second.
    const phaseDurationSec = phaseSecondsLeftRef.current;
    let firstTick = true;

    clockRef.current = startCountdownClock({
      durationSeconds: phaseDurationSec,
      onTick: ({ secondsLeft }) => {
        // Skip the initial emission: it fires at mount with the full phase
        // duration and no wall time has elapsed yet.
        if (firstTick) {
          firstTick = false;
          setPhaseSecondsLeft(secondsLeft);
          return;
        }
        tutSecondsRef.current += 1;
        setTutSeconds(tutSecondsRef.current);
        // Skip the 0 display update; onComplete jumps straight to the next phase.
        if (secondsLeft > 0) {
          setPhaseSecondsLeft(secondsLeft);
          if (secondsLeft <= 3 && timerSettings.audio && timerSettings.countdownTicks) {
            playCountdown();
          }
        }
      },
      onComplete: () => {
        // Phase boundary
        if (phase === "up") {
          triggerRepBeep();
          setPhase("down");
          setPhaseSecondsLeft(protocol.downSeconds);
          return;
        }
        // phase === "down": rep complete
        const completedRep = currentRep + 1;
        if (completedRep >= totalReps) {
          triggerSetCompleteBeep();
          setCurrentRep(completedRep);
          setPhase("done");
          setRunning(false);
          onCompleteRef.current?.({ reps: completedRep, tutSeconds: tutSecondsRef.current + 1 });
          return;
        }
        triggerRepBeep();
        setCurrentRep(completedRep);
        setPhase("up");
        setPhaseSecondsLeft(protocol.upSeconds);
      },
    });

    return () => {
      if (clockRef.current) {
        clockRef.current.stop();
        clockRef.current = null;
      }
    };
  }, [running, phase, currentRep, totalReps, protocol.upSeconds, protocol.downSeconds, triggerRepBeep, triggerSetCompleteBeep, timerSettings.audio, timerSettings.countdownTicks]);

  const beginTimer = useCallback(() => {
    setShowCountdown(false);
    setPhase("up");
    setPhaseSecondsLeft(protocol.upSeconds);
    setCurrentRep(0);
    setTutSeconds(0);
    tutSecondsRef.current = 0;
    triggerRepBeep();
    setRunning(true);
  }, [protocol.upSeconds, triggerRepBeep]);

  const start = useCallback(async () => {
    if (timerSettings.audio) unlockAudio();
    if (timerSettings.wakeLock && !wakeLockRef.current) {
      wakeLockRef.current = await requestWakeLock();
    }
    if (phase === "idle" || phase === "done") {
      // Fresh start: show 3-2-1 intro; beginTimer fires when it completes.
      setShowCountdown(true);
    } else {
      // Resuming from pause: no intro.
      setRunning(true);
    }
  }, [phase, timerSettings.audio, timerSettings.wakeLock]);

  const pause = useCallback(() => {
    setRunning(false);
  }, []);

  const reset = useCallback(async () => {
    setRunning(false);
    setShowCountdown(false);
    setPhase("idle");
    setPhaseSecondsLeft(protocol.upSeconds);
    setCurrentRep(0);
    setTutSeconds(0);
    tutSecondsRef.current = 0;
    await releaseWakeLock(wakeLockRef.current);
    wakeLockRef.current = null;
  }, [protocol.upSeconds]);

  const stopSet = useCallback(() => {
    triggerSetCompleteBeep();
    setRunning(false);
    setPhase("done");
    onCompleteRef.current?.({ reps: currentRep, tutSeconds });
  }, [triggerSetCompleteBeep, currentRep, tutSeconds]);

  const phasePct = phase === "up" || phase === "down"
    ? ((phaseDuration - phaseSecondsLeft) / phaseDuration) * 100
    : phase === "done" ? 100 : 0;

  return (
    <div className="rounded-2xl overflow-hidden relative" style={{ background: "var(--timer-bg, #1a1a2e)" }}>
      {showCountdown && <CountdownIntro onComplete={beginTimer} />}

      {/* Phase-tinted ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-700"
        style={{
          background: `radial-gradient(420px 300px at 50% 40%, ${phaseColor}1f, transparent 70%)`,
          opacity: phase === "idle" ? 0.35 : 1,
        }}
      />

      <div className="relative p-4 pb-5">
        {/* Status row */}
        <div className="flex items-center justify-between mb-1 gap-3">
          <span
            className="text-[11px] font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full inline-touch"
            style={{
              background: phase === "idle" ? "rgba(255,255,255,0.08)" : `${phaseColor}26`,
              color: phase === "idle" ? "rgba(255,255,255,0.55)" : phaseColor,
            }}
          >
            {phase === "idle" ? "Super-Slow" : phase === "done" ? "Done!" : phaseLabel}
          </span>
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: "rgba(255,255,255,0.45)" }}>
            TUT {formatTime(tutSeconds)}
          </span>
        </div>

        {/* Ring */}
        <div className="flex justify-center my-2">
          <TimerRing pct={phasePct} color={phaseColor} cycleKey={`${currentRep}-${phase}`}>
            {phase === "idle" && (
              <>
                <p className="text-sm font-bold text-white leading-tight line-clamp-2">
                  {exerciseName || "Pick an exercise"}
                </p>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {protocol.upSeconds}s up · {protocol.downSeconds}s down
                </p>
                <p className="text-4xl font-black tabular-nums tracking-tight text-white mt-1.5">
                  {totalReps} reps
                </p>
                <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                  ~{formatTime((protocol.upSeconds + protocol.downSeconds) * totalReps)} under tension
                </p>
              </>
            )}
            {(phase === "up" || phase === "down") && (
              <>
                {exerciseName && (
                  <p className="text-xs font-semibold leading-tight line-clamp-1" style={{ color: "rgba(255,255,255,0.6)" }}>
                    {exerciseName}
                  </p>
                )}
                <p
                  className="font-display font-bold"
                  style={{
                    fontSize: "2.5rem",
                    lineHeight: 1.1,
                    color: phaseColor,
                    textShadow: `0 0 24px ${phaseColor}40`,
                  }}
                >
                  {phaseLabel}
                </p>
                <p className="font-black tabular-nums text-white" style={{ fontSize: "3.25rem", lineHeight: 1.05 }}>
                  {phaseSecondsLeft}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  Rep {Math.min(currentRep + 1, totalReps)} of {totalReps}
                </p>
              </>
            )}
            {phase === "done" && (
              <>
                <span style={{ color: PHASE_COLOR.done }}>
                  <Icon name="check" size={44} strokeWidth={2.6} />
                </span>
                <p className="text-xl font-display font-bold text-white mt-1.5">Set complete</p>
                <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {currentRep} {currentRep === 1 ? "rep" : "reps"} · {formatTime(tutSeconds)} under tension
                </p>
              </>
            )}
          </TimerRing>
        </div>

        {/* Rep dots */}
        <div className="flex gap-1 mb-4 px-1" aria-hidden="true">
          {Array.from({ length: totalReps }).map((_, i) => {
            const filled = i < currentRep;
            const isActive = i === currentRep && (phase === "up" || phase === "down");
            return (
              <div
                key={i}
                className="flex-1 h-1 rounded-full transition-all duration-300"
                style={{
                  background: filled
                    ? "rgba(255,255,255,0.45)"
                    : isActive
                      ? phaseColor
                      : "rgba(255,255,255,0.10)",
                }}
              />
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reset}
            aria-label="Reset rep timer"
            className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 text-white"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <Icon name="reset" size={17} strokeWidth={2.2} />
          </button>
          <button
            onClick={running ? pause : start}
            aria-label={running ? "Pause rep timer" : phase === "done" ? "Restart rep timer" : "Start rep timer"}
            className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95 text-white"
            style={{
              background: running
                ? "rgba(255,255,255,0.12)"
                : `linear-gradient(135deg, ${PHASE_COLOR.up}, #16a34a)`,
              boxShadow: running ? "none" : `0 4px 20px ${PHASE_COLOR.up}40`,
            }}
          >
            <Icon name={running ? "pause" : "play"} size={26} />
          </button>
          <button
            onClick={stopSet}
            disabled={phase === "idle" || phase === "done"}
            aria-label="Mark set complete"
            className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 text-white disabled:opacity-25"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <Icon name="stop" size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
