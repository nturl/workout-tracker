"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { CountdownIntro } from "./CountdownIntro";
import { TimerRing } from "./TimerRing";
import { Icon } from "@/components/ui/Icon";
import {
  unlockAudio,
  startCountdownClock,
  playWorkStart,
  playRestStart,
  playBilateralSwitch,
  playCountdown,
  playCircuitComplete,
  vibrateRep,
  vibrateSetComplete,
  type ClockController,
} from "@/lib/audio";
import { useWorkoutStore } from "@/hooks/useWorkoutStore";
import type { CircuitExercise } from "@/lib/workoutData";

// Phase hues ride the design tokens: work/complete = brand accent, rest =
// warning, idle = muted. Alphas go through color-mix so the var() colors can
// be tinted for glows and chips.
const PHASE_COLOR = {
  work: "var(--accent)",
  rest: "var(--warning)",
  done: "var(--accent)",
  idle: "var(--text-muted)",
} as const;

function formatTime(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return `${seconds}`;
}

// "4 min", "20s", "1:30" - for structure summaries, not countdowns.
function formatDuration(seconds: number): string {
  if (seconds >= 60) return seconds % 60 === 0 ? `${seconds / 60} min` : formatTime(seconds);
  return `${seconds}s`;
}

// One-line description of the circuit's structure for the idle screen.
function circuitSummary(exercises: CircuitExercise[]): string {
  const work = exercises.filter((e) => !e.restOnly);
  const restBlocks = exercises.filter((e) => e.restOnly);
  const first = work[0];
  if (!first) return `${exercises.length} blocks`;
  if ((first.rounds ?? 1) > 1) {
    return `${first.rounds} × ${formatDuration(first.workSeconds)} on / ${formatDuration(first.restSeconds)} off`;
  }
  if (restBlocks.length > 0) {
    return `${work.length} × ${formatDuration(first.workSeconds)} work · ${formatDuration(restBlocks[0].restSeconds || restBlocks[0].workSeconds)} recover`;
  }
  if (first.restSeconds > 0) {
    return `${work.length} exercises · ${formatDuration(first.workSeconds)} on / ${formatDuration(first.restSeconds)} off`;
  }
  return `${work.length} exercises · ${formatDuration(first.workSeconds)} each`;
}

function segmentTotalSeconds(ex: CircuitExercise): number {
  if (ex.restOnly) return ex.restSeconds || ex.workSeconds;
  return (ex.rounds ?? 1) * (ex.workSeconds + ex.restSeconds);
}

interface CircuitTimerProps {
  exercises: CircuitExercise[];
  rounds?: number;
  // Fired when an exercise finishes its last inner round. Index matches the
  // position in the `exercises` array. Used by SessionCard to auto-check off
  // functional-fitness exercises as the timer advances past them.
  onExerciseComplete?: (index: number) => void;
}

type Phase = "idle" | "work" | "rest" | "done";

export function CircuitTimer({ exercises, rounds: defaultRounds = 1, onExerciseComplete }: CircuitTimerProps) {
  const timerSettings = useWorkoutStore((s) => s.timerSettings);
  const [selectedRounds, setSelectedRounds] = useState(defaultRounds);
  const [currentRound, setCurrentRound] = useState(1);
  const [currentEx, setCurrentEx] = useState(0);
  // innerRound counts 1..ex.rounds for Tabata-style multi-round exercises.
  const [innerRound, setInnerRound] = useState(1);
  const [phase, setPhase] = useState<Phase>("idle");
  const [timeLeft, setTimeLeft] = useState(0);
  const timeLeftRef = useRef(0);
  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);
  const [running, setRunning] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const clockRef = useRef<ClockController | null>(null);

  const onExerciseCompleteRef = useRef(onExerciseComplete);
  useEffect(() => {
    onExerciseCompleteRef.current = onExerciseComplete;
  }, [onExerciseComplete]);

  const rounds = selectedRounds;
  const totalExercises = exercises.length;

  const beepWork = useCallback(() => {
    if (timerSettings.audio) playWorkStart();
    if (timerSettings.haptics) vibrateRep();
  }, [timerSettings.audio, timerSettings.haptics]);

  const beepRest = useCallback(() => {
    if (timerSettings.audio) playRestStart();
    if (timerSettings.haptics && typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([50, 50, 50]);
    }
  }, [timerSettings.audio, timerSettings.haptics]);

  const beepCountdown = useCallback(() => {
    if (timerSettings.audio && timerSettings.countdownTicks) playCountdown();
    if (timerSettings.haptics && typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(30);
    }
  }, [timerSettings.audio, timerSettings.countdownTicks, timerSettings.haptics]);

  const beepBilateral = useCallback(() => {
    if (timerSettings.audio) playBilateralSwitch();
    if (timerSettings.haptics && typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([80, 40, 80]);
    }
  }, [timerSettings.audio, timerSettings.haptics]);

  const beepDone = useCallback(() => {
    if (timerSettings.audio) playCircuitComplete();
    if (timerSettings.haptics) vibrateSetComplete();
  }, [timerSettings.audio, timerSettings.haptics]);

  // Kick off the first exercise. restOnly exercises start in rest phase so
  // between-block rests render with the right label from the first second.
  const startCircuit = useCallback(() => {
    setCurrentRound(1);
    setCurrentEx(0);
    setInnerRound(1);
    const first = exercises[0];
    if (first.restOnly) {
      setPhase("rest");
      setTimeLeft(first.restSeconds || first.workSeconds);
      beepRest();
    } else {
      setPhase("work");
      setTimeLeft(first.workSeconds);
      beepWork();
    }
    setRunning(true);
  }, [exercises, beepWork, beepRest]);

  // V20: audio-clock driven, drift-free. Previous setInterval(1000) accumulated
  // wall-clock drift on iOS Safari and let beeps fall out of sync with the
  // displayed number over a circuit.
  useEffect(() => {
    if (!running || phase === "idle" || phase === "done") {
      if (clockRef.current) {
        clockRef.current.stop();
        clockRef.current = null;
      }
      return;
    }

    const ex = exercises[currentEx];
    // timeLeft is the source of truth for duration so pause-resume mid-phase
    // works. On fresh phase start the onComplete transitions set timeLeft to
    // the full phase duration before this effect re-runs.
    const phaseDurationSec = timeLeftRef.current || (phase === "work" ? ex.workSeconds : ex.restSeconds);
    const isBi = ex?.bilateral ?? false;
    const halfway = Math.ceil(ex.workSeconds / 2);
    const exerciseRounds = ex.rounds ?? 1;
    let firstTick = true;

    // Advance to the next exercise, marking the completed one via callback so
    // SessionCard can auto-check off functional-fitness rows.
    const advanceToNextExercise = () => {
      onExerciseCompleteRef.current?.(currentEx);
      const nextEx = currentEx + 1;
      if (nextEx >= totalExercises) {
        const nextRound = currentRound + 1;
        if (nextRound > rounds) {
          setPhase("done");
          setRunning(false);
          beepDone();
          return;
        }
        setCurrentRound(nextRound);
        setCurrentEx(0);
        setInnerRound(1);
        const first = exercises[0];
        if (first.restOnly) {
          setPhase("rest");
          setTimeLeft(first.restSeconds || first.workSeconds);
          beepRest();
        } else {
          setPhase("work");
          setTimeLeft(first.workSeconds);
          beepWork();
        }
        return;
      }
      setCurrentEx(nextEx);
      setInnerRound(1);
      const next = exercises[nextEx];
      if (next.restOnly) {
        setPhase("rest");
        setTimeLeft(next.restSeconds || next.workSeconds);
        beepRest();
      } else {
        setPhase("work");
        setTimeLeft(next.workSeconds);
        beepWork();
      }
    };

    clockRef.current = startCountdownClock({
      durationSeconds: phaseDurationSec,
      onTick: ({ secondsLeft }) => {
        if (firstTick) {
          firstTick = false;
          setTimeLeft(secondsLeft);
          return;
        }
        // Skip the 0 display flicker; onComplete jumps to the next phase.
        if (secondsLeft <= 0) return;
        setTimeLeft(secondsLeft);
        // Switch-sides alert for bilateral exercises at halfway point
        if (phase === "work" && isBi && secondsLeft === halfway) {
          beepBilateral();
        }
        // 3-2-1 countdown beeps
        if (secondsLeft <= 3) {
          beepCountdown();
        }
      },
      onComplete: () => {
        if (phase === "work") {
          const restTime = ex.restSeconds;
          if (restTime > 0) {
            setPhase("rest");
            setTimeLeft(restTime);
            beepRest();
            return;
          }
          // No rest configured: either advance inner round or next exercise.
          if (innerRound < exerciseRounds) {
            setInnerRound(innerRound + 1);
            setPhase("work");
            setTimeLeft(ex.workSeconds);
            beepWork();
            return;
          }
          advanceToNextExercise();
          return;
        }
        // phase === "rest"
        if (innerRound < exerciseRounds) {
          setInnerRound(innerRound + 1);
          // restOnly exercises have no work phase; they're a single rest block,
          // so advance once the rest phase completes.
          if (ex.restOnly) {
            advanceToNextExercise();
            return;
          }
          setPhase("work");
          setTimeLeft(ex.workSeconds);
          beepWork();
          return;
        }
        advanceToNextExercise();
      },
    });

    return () => {
      if (clockRef.current) {
        clockRef.current.stop();
        clockRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase, currentEx, currentRound, innerRound]);

  const togglePause = () => {
    // Always unlock audio on gesture. iOS backgrounding can resuspend the
    // ctx mid-workout; without this re-unlock, pause→resume kills the beeps.
    unlockAudio();
    if (phase === "idle" || phase === "done") {
      setShowCountdown(true);
    } else {
      setRunning(!running);
    }
  };

  const reset = () => {
    setRunning(false);
    setShowCountdown(false);
    setPhase("idle");
    setCurrentEx(0);
    setCurrentRound(1);
    setInnerRound(1);
    setTimeLeft(0);
  };

  const handleCountdownComplete = useCallback(() => {
    setShowCountdown(false);
    startCircuit();
  }, [startCircuit]);

  const skip = () => {
    if (phase !== "work" && phase !== "rest") return;
    onExerciseCompleteRef.current?.(currentEx);
    const nextEx = currentEx + 1;
    if (nextEx >= totalExercises) {
      const nextRound = currentRound + 1;
      if (nextRound > rounds) {
        setPhase("done");
        setRunning(false);
        return;
      }
      setCurrentRound(nextRound);
      setCurrentEx(0);
      setInnerRound(1);
      const first = exercises[0];
      if (first.restOnly) {
        setPhase("rest");
        setTimeLeft(first.restSeconds || first.workSeconds);
      } else {
        setPhase("work");
        setTimeLeft(first.workSeconds);
      }
      return;
    }
    setCurrentEx(nextEx);
    setInnerRound(1);
    const next = exercises[nextEx];
    if (next.restOnly) {
      setPhase("rest");
      setTimeLeft(next.restSeconds || next.workSeconds);
    } else {
      setPhase("work");
      setTimeLeft(next.workSeconds);
    }
  };

  const currentExercise = phase !== "idle" && phase !== "done" ? exercises[currentEx] : null;
  const phaseDuration = currentExercise
    ? phase === "work"
      ? currentExercise.workSeconds
      : currentExercise.restSeconds || currentExercise.workSeconds
    : 0;
  const phasePct = phase === "idle" || phase === "done" || !phaseDuration
    ? phase === "done" ? 100 : 0
    : ((phaseDuration - timeLeft) / phaseDuration) * 100;

  const nextExIndex = currentEx + 1;
  const nextExercise = nextExIndex < totalExercises ? exercises[nextExIndex] : null;
  const nextLabel = nextExercise?.name || (currentRound < rounds ? `Round ${currentRound + 1}` : "Finish!");

  const isBilateral = currentExercise?.bilateral ?? false;
  const halfwayPoint = currentExercise ? Math.ceil(currentExercise.workSeconds / 2) : 0;
  const showSwitch = phase === "work" && isBilateral && timeLeft === halfwayPoint;

  const exerciseRounds = currentExercise?.rounds ?? 1;
  const showInnerRounds = exerciseRounds > 1;

  // restOnly segments are recovery prescribed by the protocol; transition
  // rests between circuit exercises are plain rest. Label them differently.
  const isRecoverBlock = phase === "rest" && !!currentExercise?.restOnly;
  const phaseColor = PHASE_COLOR[phase];
  const phaseChip =
    phase === "idle" ? "Ready" :
    phase === "work" ? "GO!" :
    phase === "rest" ? (isRecoverBlock ? "Recover" : "Rest") :
    "Done!";

  // Per-segment elapsed fraction for the progress strip.
  const segPct = (() => {
    if (!currentExercise) return 0;
    const total = segmentTotalSeconds(currentExercise);
    if (total <= 0) return 0;
    const elapsed = currentExercise.restOnly
      ? (currentExercise.restSeconds || currentExercise.workSeconds) - timeLeft
      : (innerRound - 1) * (currentExercise.workSeconds + currentExercise.restSeconds) +
        (phase === "work"
          ? currentExercise.workSeconds - timeLeft
          : currentExercise.workSeconds + (currentExercise.restSeconds - timeLeft));
    return Math.min(Math.max((elapsed / total) * 100, 0), 100);
  })();

  const totalSeconds = exercises.reduce((sum, e) => sum + segmentTotalSeconds(e), 0) * rounds;

  // Interval protocols (explicit recovery rows or multi-round blocks: mito,
  // VO2 4x4, Tabata) are fixed structures - repeating the whole sequence makes
  // no sense, so the rounds selector only shows for flat work circuits like
  // the 7-Minute Workout.
  const fixedProtocol = exercises.some((e) => e.restOnly || (e.rounds ?? 1) > 1);

  // Center content: during work show the exercise; during a transition rest
  // show what's coming so the user can set up.
  const centerName = phase === "work" || isRecoverBlock
    ? currentExercise?.name
    : phase === "rest"
      ? (innerRound < exerciseRounds ? currentExercise?.name : nextLabel)
      : null;

  return (
    <div className="rounded-card overflow-hidden relative" style={{ background: "var(--timer-bg, #1a1a2e)" }}>
      {showCountdown && <CountdownIntro onComplete={handleCountdownComplete} />}

      {/* Phase-tinted ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-700"
        style={{
          background: `radial-gradient(420px 300px at 50% 38%, color-mix(in srgb, ${phaseColor} 12%, transparent), transparent 70%)`,
          opacity: phase === "idle" ? 0.35 : 1,
        }}
      />

      <div className="relative p-4 pb-5">
        {/* Segment progress strip - one bar per block in this round */}
        <div className="flex gap-1 mb-3" aria-hidden="true">
          {exercises.map((e, i) => {
            const isPast = phase === "done" || (phase !== "idle" && i < currentEx);
            const isCurrent = phase !== "idle" && phase !== "done" && i === currentEx;
            return (
              <div
                key={i}
                className="h-1 rounded-full overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.10)",
                  // Recovery blocks get a shorter flex share so work segments dominate the strip
                  flex: e.restOnly ? 0.6 : 1,
                }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500 ease-linear"
                  style={{
                    width: isPast ? "100%" : isCurrent ? `${segPct}%` : "0%",
                    background: isPast ? "rgba(255,255,255,0.45)" : phaseColor,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between mb-1">
          <span
            className="text-[11px] font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full inline-touch"
            style={{ background: `color-mix(in srgb, ${phaseColor} 15%, transparent)`, color: phaseColor }}
          >
            {phaseChip}
          </span>
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: "rgba(255,255,255,0.45)" }}>
            {phase === "idle" || phase === "done"
              ? `~${formatDuration(totalSeconds)} total`
              : [
                  rounds > 1 ? `Round ${currentRound}/${rounds}` : null,
                  `${currentEx + 1}/${totalExercises}`,
                  showInnerRounds ? `Set ${innerRound}/${exerciseRounds}` : null,
                ].filter(Boolean).join(" · ")}
          </span>
        </div>

        {/* Ring */}
        <div className="flex justify-center my-2">
          <TimerRing
            pct={phasePct}
            color={phaseColor}
            cycleKey={`${currentRound}-${currentEx}-${innerRound}-${phase}`}
          >
            {phase === "idle" && (
              <>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {circuitSummary(exercises)}
                </p>
                <p className="text-5xl font-display font-bold tabular-nums tracking-tight text-white mt-2">
                  {formatTime(totalSeconds)}
                </p>
                <p className="text-[11px] mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Press play to start
                </p>
              </>
            )}
            {phase === "done" && (
              <>
                <span style={{ color: PHASE_COLOR.done }}>
                  <Icon name="check" size={44} strokeWidth={2.6} />
                </span>
                <p className="text-xl font-display font-bold text-white mt-1.5">Circuit complete</p>
                <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {formatDuration(totalSeconds)} of work banked
                </p>
              </>
            )}
            {(phase === "work" || phase === "rest") && (
              <>
                <p className="text-sm font-bold text-white leading-tight line-clamp-2">
                  {centerName}
                </p>
                {phase === "work" && isBilateral && (
                  showSwitch ? (
                    <p className="text-xs font-black text-warning animate-pulse">SWITCH SIDES</p>
                  ) : (
                    <p className="text-[11px] font-semibold text-accent-light">
                      {timeLeft > halfwayPoint ? "Side 1" : "Side 2"}
                    </p>
                  )
                )}
                <p
                  className="font-display font-bold tabular-nums text-white"
                  style={{ fontSize: "4.5rem", lineHeight: 1.05, letterSpacing: "-0.03em" }}
                >
                  {formatTime(timeLeft)}
                </p>
                {phase === "rest" && !isRecoverBlock ? (
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: PHASE_COLOR.rest }}>
                    Up next
                  </p>
                ) : nextExercise || currentRound < rounds ? (
                  <p className="text-[11px] truncate max-w-full" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Next: {nextLabel}
                  </p>
                ) : (
                  <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Last one - empty the tank
                  </p>
                )}
              </>
            )}
          </TimerRing>
        </div>

        {/* Rounds selector (idle, flat circuits only) */}
        {phase === "idle" && !fixedProtocol && (
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>Rounds</span>
            <div className="flex gap-1 p-1 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
              {[1, 2, 3].map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRounds(r)}
                  className="w-8 h-8 rounded-full text-xs font-bold pressable inline-touch"
                  style={selectedRounds === r
                    ? { background: "var(--accent)", color: "var(--accent-contrast)" }
                    : { color: "rgba(255,255,255,0.55)" }}
                >
                  {r}x
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="w-11 h-11 rounded-full flex items-center justify-center pressable text-white"
            style={{ background: "rgba(255,255,255,0.08)" }}
            aria-label="Reset timer"
          >
            <Icon name="reset" size={17} strokeWidth={2.2} />
          </button>
          <button
            onClick={togglePause}
            className={`w-16 h-16 rounded-full flex items-center justify-center pressable${running ? " text-white" : ""}`}
            style={{
              background: running
                ? "rgba(255,255,255,0.12)"
                : "linear-gradient(135deg, var(--accent), var(--accent-light))",
              color: running ? undefined : "var(--accent-contrast)",
              boxShadow: running ? "none" : "0 4px 20px color-mix(in srgb, var(--accent) 25%, transparent)",
            }}
            aria-label={running ? "Pause" : phase === "done" ? "Restart" : "Start timer"}
          >
            <Icon name={running ? "pause" : "play"} size={26} />
          </button>
          <button
            onClick={skip}
            disabled={phase === "idle" || phase === "done"}
            className="w-11 h-11 rounded-full flex items-center justify-center pressable text-white disabled:opacity-25"
            style={{ background: "rgba(255,255,255,0.08)" }}
            aria-label="Skip to next exercise"
          >
            <Icon name="skip" size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
