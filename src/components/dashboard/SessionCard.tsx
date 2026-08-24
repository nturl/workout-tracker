"use client";

import { useState, memo, useMemo, useCallback } from "react";
import {
  categoryColors,
  parseTimedExercises,
  type WorkoutSession,
  type Level,
  type Exercise,
  type ParsedTimedExercise,
} from "@/lib/workoutData";
import { ConfettiBurst } from "@/components/tracking/ConfettiBurst";
import { Icon } from "@/components/ui/Icon";
import { RepTimer } from "@/components/tracking/RepTimer";
import { CircuitTimer } from "@/components/tracking/CircuitTimer";
import type { WorkoutLogRecord, WorkoutLogEntry } from "@/types/workout";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const EQUIPMENT_PATTERNS: [RegExp, string, string][] = [
  [/dumbbell|db\b/i, "Dumbbells", "🏋️"],
  [/barbell|bench press|squat rack|deadlift/i, "Barbell", "🏋️"],
  [/leg press|machine|pulldown|seated row|cable/i, "Machine", "⚙️"],
  [/band|bfr/i, "Bands", "🔗"],
  [/kettlebell|kb\b/i, "Kettlebell", "🔔"],
  [/bodyweight|push.?up|pull.?up|plank|burpee/i, "Bodyweight", "🤸"],
  [/wall|floor|chair|step/i, "Bodyweight", "🤸"],
  [/sauna/i, "Sauna", "♨️"],
  [/cold/i, "Cold Plunge", "🧊"],
];

function inferEquipment(ex: Exercise): { label: string; icon: string }[] {
  if (ex.equipment?.length) {
    return ex.equipment.map((e) => {
      const match = EQUIPMENT_PATTERNS.find(([, label]) => label.toLowerCase() === e.toLowerCase());
      return { label: e, icon: match?.[2] || "🔧" };
    });
  }
  const found: { label: string; icon: string }[] = [];
  const seen = new Set<string>();
  for (const [pattern, label, icon] of EQUIPMENT_PATTERNS) {
    if (!seen.has(label) && (pattern.test(ex.name) || (ex.notes && pattern.test(ex.notes)))) {
      found.push({ label, icon });
      seen.add(label);
    }
  }
  return found;
}

interface SessionCardProps {
  session: WorkoutSession;
  level: Level;
  completed: boolean;
  onToggle: () => void;
  logKey: string;
  logs: WorkoutLogRecord;
  onOpenLog: () => void;
  onSaveLog?: (key: string, entry: WorkoutLogEntry) => void;
  showTimer: boolean;
}

export const SessionCard = memo(function SessionCard({ session, level, completed, onToggle, logKey, logs, onOpenLog, onSaveLog, showTimer }: SessionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const detail = session.levels[level];
  const colors = categoryColors[session.category];
  const log = logs[logKey];

  const exerciseSlugs = useMemo(
    () => (detail.exercises ? detail.exercises.map((ex) => slugify(ex.name)) : []),
    [detail.exercises]
  );

  // Checklist mode: Super-Slow Strength (has repProtocol + exercise list).
  // Each exercise becomes a tap target; tapping selects it as the active exercise
  // for the RepTimer. On timer complete, the exercise is checked off. When all
  // exercises are checked, the whole session auto-completes.
  const checklistMode = !!(session.repProtocol && detail.exercises && detail.exercises.length > 0);

  // Parsed timer spec per timed exercise, with a link back to the original
  // exercise slug so CircuitTimer completions check off the right row.
  const parsedTimed = useMemo<ParsedTimedExercise[]>(
    () => (detail.exercises ? parseTimedExercises(detail.exercises) : []),
    [detail.exercises]
  );

  // Timer checklist mode: CircuitTimer-driven sessions (functional fitness,
  // Tabata, 4x4 breathing). The timer auto-checks rows as it advances.
  const timerChecklistMode = !checklistMode && parsedTimed.length > 0;

  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const exerciseLogs = log?.exerciseLogs || {};
  const isExerciseDone = (slug: string) => !!exerciseLogs[slug]?.completed;
  const activeExercise = checklistMode && activeSlug && detail.exercises
    ? detail.exercises.find((ex) => slugify(ex.name) === activeSlug) || null
    : null;

  // Derive a per-exercise RepTimer protocol. When activeExercise carries a
  // tutTargetSeconds, convert it to targetReps using the session cadence so the
  // rep-dot UI, TUT estimate, and completion trigger all line up. Without a
  // target, use the session protocol as-is.
  const activeProtocol = useMemo(() => {
    if (!session.repProtocol) return undefined;
    const target = activeExercise?.tutTargetSeconds;
    if (!target) return session.repProtocol;
    const { upSeconds, downSeconds } = session.repProtocol;
    const reps = Math.max(1, Math.round(target / (upSeconds + downSeconds)));
    return { ...session.repProtocol, targetReps: reps };
  }, [session.repProtocol, activeExercise?.tutTargetSeconds]);

  const handleSelectExercise = (slug: string) => {
    setActiveSlug((prev) => (prev === slug ? null : slug));
  };

  const handleExerciseComplete = (slug: string, result: { reps: number; tutSeconds: number }) => {
    if (!onSaveLog) return;
    const prevLog = logs[logKey] || {};
    const prevExerciseLogs = prevLog.exerciseLogs || {};
    const nextExerciseLogs = {
      ...prevExerciseLogs,
      [slug]: {
        ...prevExerciseLogs[slug],
        completed: true,
        reps: result.reps,
        tutSeconds: result.tutSeconds,
        completedAt: new Date().toISOString(),
      },
    };
    onSaveLog(logKey, { ...prevLog, exerciseLogs: nextExerciseLogs });

    // Auto-advance to the next unchecked exercise for flow.
    const nextSlug = exerciseSlugs.find((s) => s !== slug && !nextExerciseLogs[s]?.completed);
    setActiveSlug(nextSlug || null);

    // If this was the last exercise, mark the session complete.
    const allDone = exerciseSlugs.every((s) => nextExerciseLogs[s]?.completed);
    if (allDone && !completed) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 800);
      if (navigator.vibrate) navigator.vibrate([80, 40, 120]);
      onToggle();
    }
  };

  // Circuit-timer progression: mark the exercise slug complete as the timer
  // advances past it. Auto-completes the session on final row.
  const handleTimerExerciseComplete = useCallback((slug: string) => {
    if (!onSaveLog) return;
    const prevLog = logs[logKey] || {};
    const prevExerciseLogs = prevLog.exerciseLogs || {};
    if (prevExerciseLogs[slug]?.completed) return;
    const nextExerciseLogs = {
      ...prevExerciseLogs,
      [slug]: { ...prevExerciseLogs[slug], completed: true, completedAt: new Date().toISOString() },
    };
    onSaveLog(logKey, { ...prevLog, exerciseLogs: nextExerciseLogs });

    if (!timerChecklistMode) return;
    const allDone = exerciseSlugs.every((s) => nextExerciseLogs[s]?.completed);
    if (allDone && !completed) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 800);
      if (navigator.vibrate) navigator.vibrate([80, 40, 120]);
      onToggle();
    }
  }, [onSaveLog, logs, logKey, exerciseSlugs, completed, onToggle, timerChecklistMode]);

  const toggleExerciseCheck = (slug: string) => {
    if (!onSaveLog) return;
    const prevLog = logs[logKey] || {};
    const prevExerciseLogs = prevLog.exerciseLogs || {};
    const wasDone = !!prevExerciseLogs[slug]?.completed;
    const nextExerciseLogs = {
      ...prevExerciseLogs,
      [slug]: {
        ...prevExerciseLogs[slug],
        completed: !wasDone,
        ...(wasDone ? {} : { completedAt: new Date().toISOString() }),
      },
    };
    onSaveLog(logKey, { ...prevLog, exerciseLogs: nextExerciseLogs });

    if (!wasDone) {
      // Just checked: advance and maybe auto-complete session.
      if (activeSlug === slug) {
        const nextSlug = exerciseSlugs.find((s) => s !== slug && !nextExerciseLogs[s]?.completed);
        setActiveSlug(nextSlug || null);
      }
      const allDone = exerciseSlugs.every((s) => nextExerciseLogs[s]?.completed);
      if (allDone && !completed) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 800);
        if (navigator.vibrate) navigator.vibrate([80, 40, 120]);
        onToggle();
      }
    }
  };

  const handleToggle = () => {
    if (!completed) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 800);
      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(50);
    }
    onToggle();
  };

  // Collapsed-card progress: exercises checked off so far in checklist or
  // timer-checklist sessions. Hidden once the session is complete.
  const checkable = checklistMode || timerChecklistMode;
  const progressTotal = checkable ? exerciseSlugs.length : 0;
  const progressDone = checkable ? exerciseSlugs.filter((s) => isExerciseDone(s)).length : 0;

  return (
    <div
      className={`glass-card rounded-card overflow-hidden relative anim-fade-up ${completed ? "glow-accent" : ""}`}
    >
      <ConfettiBurst active={showConfetti} />
      {/* Top accent - thin gradient line */}
      <div className={`h-0.5 bg-gradient-to-r ${colors.gradient} transition-opacity duration-300 ${completed ? "opacity-100" : "opacity-60"}`} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setExpanded(!expanded)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); }
            }}
            aria-expanded={expanded}
            aria-label={`${session.title} details`}
            className="flex-1 min-w-0 cursor-pointer select-none"
          >
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-xl overflow-hidden shrink-0">
                <div className={`absolute inset-0 bg-gradient-to-br ${colors.gradient}`} style={{ opacity: 0.16 }} />
                <span className="relative w-full h-full flex items-center justify-center text-lg">{session.icon}</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className={`font-display font-bold text-[20px] leading-[26px] tracking-[-0.02em] truncate ${completed ? "text-accent" : "text-content-primary"}`}>
                    {session.title}
                  </h3>
                  <span
                    className={`inline-flex shrink-0 text-content-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                  >
                    <Icon name="chevron" size={13} strokeWidth={2.4} />
                  </span>
                </div>
                {session.subtitle && <p className="text-xs font-medium leading-4 truncate text-content-muted">{session.subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              {detail.duration && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-content-secondary">
                  {detail.duration}
                </span>
              )}
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-content-secondary">
                {session.timeOfDay.split("(")[0].trim()}
              </span>
              {session.repProtocol && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-content-secondary">
                  {session.repProtocol.upSeconds}s up + {session.repProtocol.downSeconds}s down
                </span>
              )}
            </div>
            {progressTotal > 0 && !completed && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full overflow-hidden bg-surface-elevated">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${(progressDone / progressTotal) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold tabular-nums shrink-0 text-content-muted">
                  {progressDone}/{progressTotal}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={handleToggle}
            aria-label={completed ? `Mark ${session.title} incomplete` : `Mark ${session.title} complete`}
            className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-base font-bold pressable transition-colors duration-300 ${
              completed ? "bg-accent text-accent-contrast glow-accent" : "bg-surface-elevated text-content-muted"
            }`}
          >
            {completed ? <Icon name="check" size={18} strokeWidth={3} /> : ""}
          </button>
        </div>
        {log && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center gap-2 text-xs text-content-muted">
              {log.feeling && <span>{["", "😫", "😓", "😊", "💪", "🔥"][log.feeling]}</span>}
              {log.duration ? <span>{log.duration} min</span> : null}
              {log.notes && <span className="truncate max-w-[200px]">- {log.notes}</span>}
            </div>
            {log.exerciseLogs && Object.keys(log.exerciseLogs).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(log.exerciseLogs).map(([slug, ex]) => {
                  if (!ex.weight && !ex.reps) return null;
                  const parts = [];
                  if (ex.weight) parts.push(`${ex.weight}lb`);
                  if (ex.reps) parts.push(`${ex.reps}r`);
                  if (ex.sets) parts.push(`${ex.sets}s`);
                  return (
                    <span key={slug} className="text-[10px] px-1.5 py-0.5 rounded-md font-mono bg-surface-elevated text-content-secondary">
                      {slug.replace(/-/g, " ")}: {parts.join("x")}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <div
        hidden={!expanded}
        className={`px-5 pb-5 pt-4 space-y-4 ${expanded ? "anim-fade-up" : ""}`}
      >
          {showTimer && activeProtocol && (
            <RepTimer
              key={`${activeSlug ?? "session"}-${activeProtocol.upSeconds}-${activeProtocol.targetReps}`}
              protocol={activeProtocol}
              exerciseName={checklistMode ? activeExercise?.name : undefined}
              onComplete={checklistMode
                ? (result) => { if (activeSlug) handleExerciseComplete(activeSlug, result); }
                : undefined}
            />
          )}
          {showTimer && parsedTimed.length > 0 && (
            <CircuitTimer
              exercises={parsedTimed.map((p) => p.circuit)}
              onExerciseComplete={timerChecklistMode ? (i) => {
                const slug = exerciseSlugs[parsedTimed[i].originalIndex];
                if (slug) handleTimerExerciseComplete(slug);
              } : undefined}
            />
          )}
          {detail.warmup && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-content-secondary mb-1.5">Warm-up</p>
              <p className="text-[15px] leading-[22px] text-content-secondary">{detail.warmup}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-content-secondary mb-1.5">Instructions</p>
            <p className="text-[15px] leading-[22px] text-content-secondary">{detail.instructions}</p>
          </div>
          {detail.keyPoints && detail.keyPoints.length > 0 && (
            <div className="rounded-xl p-3 space-y-1.5 bg-surface-elevated">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-content-secondary">Key Points</p>
              {detail.keyPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs mt-0.5 shrink-0 text-content-secondary">-</span>
                  <p className="text-xs leading-relaxed text-content-secondary">{point}</p>
                </div>
              ))}
            </div>
          )}
          {detail.exercises && detail.exercises.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-content-secondary mb-1">Exercises</p>
              {parsedTimed.length > 0 && (
                <p className="text-xs mb-2 text-content-secondary">
                  {parsedTimed.length} timed exercises below. Hit play above to time them.
                </p>
              )}
              <div className="space-y-2 anim-stagger">
                {detail.exercises.map((ex, i) => {
                  const secMatch = ex.name.match(/\((\d+)(?:-\d+)?\s*s(?:ec)?\b/);
                  const minMatch = ex.name.match(/\((\d+)(?:-\d+)?\s*min\b/);
                  const cleanName = ex.name.replace(/\s*\(\d+(?:-\d+)?\s*(?:s|sec|min)\b[^)]*\)/, "").trim();
                  const duration = secMatch ? `${secMatch[1]}s` : minMatch ? `${minMatch[1]}m` : null;
                  const checkable = checklistMode || timerChecklistMode;
                  const slug = checkable ? exerciseSlugs[i] : "";
                  const done = checkable ? isExerciseDone(slug) : false;
                  const isActive = checklistMode && activeSlug === slug;
                  const rowInteractive = checklistMode;
                  return (
                  <div
                    key={i}
                    onClick={rowInteractive ? () => handleSelectExercise(slug) : undefined}
                    role={rowInteractive ? "button" : undefined}
                    tabIndex={rowInteractive ? 0 : undefined}
                    onKeyDown={rowInteractive ? (e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelectExercise(slug); }
                    } : undefined}
                    aria-pressed={rowInteractive ? isActive : undefined}
                    className={`anim-fade-up flex items-start gap-3 rounded-xl p-3 bg-surface-elevated transition-shadow ${rowInteractive ? "cursor-pointer pressable" : ""}`}
                    style={{
                      boxShadow: isActive ? "0 0 0 2px var(--accent)" : undefined,
                      "--stagger-i": i,
                    } as React.CSSProperties}
                  >
                    {checkable ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleExerciseCheck(slug); }}
                        aria-label={done ? `Mark ${cleanName} incomplete` : `Mark ${cleanName} complete`}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 transition-all"
                        style={{
                          background: done ? "var(--accent)" : "var(--border)",
                          color: done ? "var(--accent-contrast)" : "var(--text-secondary)",
                        }}
                      >
                        {done ? <Icon name="check" size={13} strokeWidth={3.2} /> : i + 1}
                      </button>
                    ) : (
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                        style={{ background: "var(--border)", color: "var(--text-secondary)" }}>{i + 1}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[17px] leading-[22px] font-semibold tracking-[-0.01em]" style={{
                          color: done ? "var(--text-muted)" : "var(--text-primary)",
                          textDecoration: done ? "line-through" : "none",
                        }}>{cleanName}</p>
                        {duration && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-500 shrink-0">{duration}</span>
                        )}
                      </div>
                      {ex.notes && <p className="text-[15px] leading-[22px] mt-0.5 text-content-secondary">{ex.notes}</p>}
                      {ex.alternatives && <p className="text-xs mt-0.5 text-content-muted">or {ex.alternatives.join(" · ")}</p>}
                      {(() => {
                        const equip = inferEquipment(ex);
                        if (equip.length === 0) return null;
                        return (
                          <div className="flex gap-1 mt-1">
                            {equip.map((e) => (
                              <span key={e.label} className="text-[9px] px-1.5 py-0.5 rounded-md font-medium"
                                style={{ background: "var(--border)", color: "var(--text-muted)" }}>
                                {e.icon} {e.label}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
          <button
            onClick={onOpenLog}
            className="w-full h-11 rounded-button text-[13px] leading-4 font-semibold pressable bg-surface-elevated text-content-primary ring-1 ring-[var(--card-border)]"
          >
            Log workout
          </button>
      </div>
    </div>
  );
});
