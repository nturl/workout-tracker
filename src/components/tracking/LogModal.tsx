"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/Icon";
import type { WorkoutSession, Level } from "@/lib/workoutData";
import type { WorkoutLogEntry, WorkoutLogRecord, ExerciseLog } from "@/types/workout";

const DURATION_PRESETS = [15, 20, 30, 45, 60];

const FEELINGS = [
  { value: 1 as const, emoji: "😫", label: "Exhausted" },
  { value: 2 as const, emoji: "😓", label: "Tough" },
  { value: 3 as const, emoji: "😊", label: "Good" },
  { value: 4 as const, emoji: "💪", label: "Strong" },
  { value: 5 as const, emoji: "🔥", label: "On Fire" },
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

interface LogModalProps {
  session: WorkoutSession;
  logKey: string;
  logs: WorkoutLogRecord;
  level: Level;
  onSave: (key: string, data: WorkoutLogEntry) => void;
  onClose: () => void;
}

export function LogModal({ session, logKey, logs, level, onSave, onClose }: LogModalProps) {
  const existing = logs[logKey] || {};
  const [notes, setNotes] = useState(existing.notes || "");
  const [duration, setDuration] = useState(existing.duration || 0);
  const [feeling, setFeeling] = useState<1 | 2 | 3 | 4 | 5>(existing.feeling || 3);
  const [exerciseLogs, setExerciseLogs] = useState<Record<string, ExerciseLog>>(existing.exerciseLogs || {});
  const [showExercises, setShowExercises] = useState(false);

  const exercises = session.levels[level]?.exercises || [];

  const updateExercise = (slug: string, field: keyof ExerciseLog, value: number | string | undefined) => {
    setExerciseLogs((prev) => ({
      ...prev,
      [slug]: { ...prev[slug], [field]: value },
    }));
  };

  return (
    <Sheet open onClose={onClose} title="Log workout" subtitle={session.title}>
      <div className="p-5 space-y-5">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] block mb-2 text-content-secondary">How did it feel?</label>
          <div className="flex gap-2" role="radiogroup" aria-label="How did it feel?">
            {FEELINGS.map((f) => (
              <button key={f.value} onClick={() => setFeeling(f.value)}
                role="radio"
                aria-checked={feeling === f.value}
                aria-label={`Rate feeling: ${f.label}`}
                className={`flex-1 py-2.5 rounded-button text-center transition-all duration-200 ${
                  feeling === f.value ? "scale-105" : "pressable"
                }`}
                style={{
                  background: feeling === f.value ? "var(--accent)" : "var(--bg-elevated)",
                  color: feeling === f.value ? "var(--accent-contrast)" : "var(--text-primary)",
                  boxShadow: feeling === f.value ? "0 0 14px var(--accent-glow)" : "none",
                }}>
                <div className="text-xl">{f.emoji}</div>
                <div className="text-[10px] mt-0.5 font-semibold">{f.label}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="log-duration" className="text-xs font-semibold uppercase tracking-[0.08em] block mb-2 text-content-secondary">Duration</label>
          <div className="flex gap-1.5 mb-2">
            {DURATION_PRESETS.map((m) => (
              <button key={m} onClick={() => setDuration(m)}
                className="flex-1 py-1.5 rounded-full text-xs font-bold tabular-nums pressable inline-touch"
                style={{
                  background: duration === m ? "var(--accent)" : "var(--bg-elevated)",
                  color: duration === m ? "var(--accent-contrast)" : "var(--text-secondary)",
                }}>
                {m}m
              </button>
            ))}
          </div>
          <input id="log-duration" type="number" value={duration || ""} onChange={(e) => setDuration(parseInt(e.target.value) || 0)} placeholder="Custom minutes"
            className="input-field w-full h-11 px-4 rounded-button border border-border-active outline-none transition-all text-[15px] leading-[22px] tabular-nums bg-surface-input text-content-primary" />
        </div>
        <div>
          <label htmlFor="log-notes" className="text-xs font-semibold uppercase tracking-[0.08em] block mb-2 text-content-secondary">
            Notes <span className="normal-case tracking-normal font-normal font-sans text-content-muted">(weights, reps, observations)</span>
          </label>
          <textarea id="log-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Chest press: 135lbs, ~100s TUT..." rows={4}
            className="input-field w-full px-4 py-3 rounded-button border border-border-active outline-none transition-all resize-none text-[15px] leading-[22px] bg-surface-input text-content-primary" />
        </div>
        {exercises.length > 0 && (
          <div>
            <button onClick={() => setShowExercises(!showExercises)}
              aria-expanded={showExercises}
              className="text-sm font-semibold flex items-center gap-1.5 transition-colors text-content-secondary">
              Exercise details
              <span className="inline-flex transition-transform" style={{ transform: showExercises ? "rotate(180deg)" : undefined }}>
                <Icon name="chevron" size={13} strokeWidth={2.4} />
              </span>
            </button>
            {showExercises && (
              <div className="mt-3 space-y-3 anim-fade-up">
                {exercises.map((ex) => {
                  const slug = slugify(ex.name);
                  const log = exerciseLogs[slug] || {};
                  return (
                    <div key={slug} className="rounded-xl p-3 bg-surface-elevated">
                      <p className="text-[15px] leading-[22px] font-semibold mb-2 text-content-primary">{ex.name}</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label htmlFor={`ex-weight-${slug}`} className="text-[10px] font-medium block mb-1 text-content-muted">Weight</label>
                          <input id={`ex-weight-${slug}`} type="number" value={log.weight ?? ""} placeholder="lbs"
                            onChange={(e) => updateExercise(slug, "weight", e.target.value ? Number(e.target.value) : undefined)}
                            className="input-field w-full px-2 py-1.5 rounded-lg border border-border text-sm font-mono outline-none bg-surface-input text-content-primary" />
                        </div>
                        <div>
                          <label htmlFor={`ex-reps-${slug}`} className="text-[10px] font-medium block mb-1 text-content-muted">Reps</label>
                          <input id={`ex-reps-${slug}`} type="number" value={log.reps ?? ""} placeholder="#"
                            onChange={(e) => updateExercise(slug, "reps", e.target.value ? Number(e.target.value) : undefined)}
                            className="input-field w-full px-2 py-1.5 rounded-lg border border-border text-sm font-mono outline-none bg-surface-input text-content-primary" />
                        </div>
                        <div>
                          <label htmlFor={`ex-sets-${slug}`} className="text-[10px] font-medium block mb-1 text-content-muted">Sets</label>
                          <input id={`ex-sets-${slug}`} type="number" value={log.sets ?? ""} placeholder="#"
                            onChange={(e) => updateExercise(slug, "sets", e.target.value ? Number(e.target.value) : undefined)}
                            className="input-field w-full px-2 py-1.5 rounded-lg border border-border text-sm font-mono outline-none bg-surface-input text-content-primary" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="p-5 flex gap-3 border-t" style={{ borderColor: "var(--card-border)" }}>
        <button onClick={onClose} className="flex-1 h-11 rounded-button font-semibold text-[13px] leading-4 pressable bg-surface-elevated text-content-secondary ring-1 ring-[var(--card-border)]">Cancel</button>
        <button onClick={() => {
          const hasExerciseData = Object.values(exerciseLogs).some((l) => l.weight || l.reps || l.sets);
          onSave(logKey, {
            notes, duration, feeling,
            completedAt: new Date().toISOString(),
            ...(hasExerciseData ? { exerciseLogs } : {}),
          });
          onClose();
        }}
          className="flex-1 h-11 rounded-button font-bold text-[13px] leading-4 pressable bg-accent text-accent-contrast">Save workout</button>
      </div>
    </Sheet>
  );
}
