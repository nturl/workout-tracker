"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  weeklyPlan,
  categoryColors,
  categoryLabels,
  type Level,
  type DayPlan,
  type WorkoutSession,
} from "@/lib/workoutData";

// ── Persistence ──────────────────────────────────────────────────────

function weekKey(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

interface CompletionRecord {
  [key: string]: boolean;
}

interface WorkoutLog {
  [key: string]: {
    notes?: string;
    duration?: number; // minutes
    feeling?: 1 | 2 | 3 | 4 | 5;
    completedAt?: string;
  };
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Streak calculation ───────────────────────────────────────────────

function calculateStreak(completions: CompletionRecord): number {
  let streak = 0;
  const today = new Date();

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const dayName = DAYS[checkDate.getDay()];
    const wk = weekKey(checkDate);
    const plan = weeklyPlan.find((d) => d.day === dayName);
    if (!plan) continue;

    const allDone = plan.sessions.every(
      (_, si) => completions[`${wk}:${dayName}:${si}`]
    );

    if (allDone) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

function getBestStreak(completions: CompletionRecord): number {
  let best = 0;
  let current = 0;
  const today = new Date();

  for (let i = 365; i >= 0; i--) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const dayName = DAYS[checkDate.getDay()];
    const wk = weekKey(checkDate);
    const plan = weeklyPlan.find((d) => d.day === dayName);
    if (!plan) continue;

    const allDone = plan.sessions.every(
      (_, si) => completions[`${wk}:${dayName}:${si}`]
    );

    if (allDone) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

// ── Helpers ──────────────────────────────────────────────────────────

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getTodayDayName(): string {
  return DAYS[new Date().getDay()];
}

function getWeekDates(): { day: string; date: Date; dateLabel: string }[] {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  return DAYS.map((_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return {
      day: DAYS[i],
      date: d,
      dateLabel: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  });
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Confetti burst ───────────────────────────────────────────────────

function ConfettiBurst({ active }: { active: boolean }) {
  if (!active) return null;
  const particles = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * 360;
    const distance = 40 + Math.random() * 60;
    const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
    const color = colors[i % colors.length];
    const size = 4 + Math.random() * 4;
    return { angle, distance, color, size, delay: Math.random() * 0.15 };
  });

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animation: `confetti-burst 0.6s ease-out ${p.delay}s forwards`,
            transform: `translate(-50%, -50%)`,
            // @ts-expect-error CSS custom properties
            "--tx": `${Math.cos((p.angle * Math.PI) / 180) * p.distance}px`,
            "--ty": `${Math.sin((p.angle * Math.PI) / 180) * p.distance}px`,
          }}
        />
      ))}
    </div>
  );
}

// ── Timer Component ──────────────────────────────────────────────────

function RepTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"up" | "down">("up");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s >= 9) {
            setPhase((p) => (p === "up" ? "down" : "up"));
            return 0;
          }
          return s + 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const reset = () => {
    setRunning(false);
    setSeconds(0);
    setPhase("up");
  };

  return (
    <div className="bg-gray-900 text-white rounded-2xl p-4 flex items-center gap-4">
      <div className="flex-1">
        <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">
          Super-Slow Timer
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-mono font-bold tabular-nums">
            {seconds + 1}
          </span>
          <span className="text-lg text-gray-400">/ 10s</span>
          <span
            className={`text-sm font-semibold px-2 py-0.5 rounded-full ${
              phase === "up"
                ? "bg-blue-500/20 text-blue-400"
                : "bg-amber-500/20 text-amber-400"
            }`}
          >
            {phase === "up" ? "↑ LIFTING" : "↓ LOWERING"}
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setRunning(!running)}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all ${
            running
              ? "bg-red-500 hover:bg-red-600"
              : "bg-green-500 hover:bg-green-600"
          }`}
        >
          {running ? "⏸" : "▶"}
        </button>
        <button
          onClick={reset}
          className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-all"
        >
          ↺
        </button>
      </div>
    </div>
  );
}

// ── Workout Log Modal ────────────────────────────────────────────────

function LogModal({
  session,
  logKey,
  logs,
  onSave,
  onClose,
}: {
  session: WorkoutSession;
  logKey: string;
  logs: WorkoutLog;
  onSave: (key: string, data: WorkoutLog[string]) => void;
  onClose: () => void;
}) {
  const existing = logs[logKey] || {};
  const [notes, setNotes] = useState(existing.notes || "");
  const [duration, setDuration] = useState(existing.duration || 0);
  const [feeling, setFeeling] = useState<1 | 2 | 3 | 4 | 5>(existing.feeling || 3);

  const feelings = [
    { value: 1 as const, emoji: "😫", label: "Exhausted" },
    { value: 2 as const, emoji: "😓", label: "Tough" },
    { value: 3 as const, emoji: "😊", label: "Good" },
    { value: 4 as const, emoji: "💪", label: "Strong" },
    { value: 5 as const, emoji: "🔥", label: "On Fire" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">{session.title} — Log</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* How did it feel */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">How did it feel?</label>
            <div className="flex gap-2">
              {feelings.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFeeling(f.value)}
                  className={`flex-1 py-2 rounded-xl text-center transition-all ${
                    feeling === f.value
                      ? "bg-gray-900 text-white shadow-lg scale-105"
                      : "bg-gray-50 hover:bg-gray-100"
                  }`}
                >
                  <div className="text-xl">{f.emoji}</div>
                  <div className="text-[10px] mt-0.5 font-medium">{f.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">Duration (minutes)</label>
            <input
              type="number"
              value={duration || ""}
              onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
              placeholder="e.g. 20"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all text-lg"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">
              Notes
              <span className="font-normal text-gray-400 ml-1">(weights, reps, observations)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Chest press: 135lbs, ~100s TUT&#10;Pull-down: 120lbs, ~90s TUT&#10;Felt stronger than Monday..."
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all resize-none"
            />
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 font-medium hover:bg-gray-50 transition-all">
            Cancel
          </button>
          <button
            onClick={() => {
              onSave(logKey, {
                notes,
                duration,
                feeling,
                completedAt: new Date().toISOString(),
              });
              onClose();
            }}
            className="flex-1 py-3 rounded-xl bg-gray-900 text-white font-medium hover:bg-gray-800 transition-all"
          >
            Save Log
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Session Card ─────────────────────────────────────────────────────

function SessionCard({
  session,
  level,
  completed,
  onToggle,
  logKey,
  logs,
  onOpenLog,
  showTimer,
}: {
  session: WorkoutSession;
  level: Level;
  completed: boolean;
  onToggle: () => void;
  logKey: string;
  logs: WorkoutLog;
  onOpenLog: () => void;
  showTimer: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const detail = session.levels[level];
  const colors = categoryColors[session.category];
  const log = logs[logKey];

  const handleToggle = () => {
    if (!completed) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 800);
    }
    onToggle();
  };

  return (
    <div
      className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden relative ${
        completed
          ? "border-green-300 bg-green-50/80"
          : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-md"
      }`}
    >
      <ConfettiBurst active={showConfetti} />

      {/* Category color bar */}
      <div className={`h-1 bg-gradient-to-r ${colors.gradient}`} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl">{session.icon}</span>
              <h3 className={`font-bold text-lg ${completed ? "text-green-800" : ""}`}>
                {session.title}
              </h3>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
                {categoryLabels[session.category]}
              </span>
            </div>
            {session.subtitle && (
              <p className="text-sm text-gray-500 mt-1">{session.subtitle}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
              <span className="flex items-center gap-1">🕐 {session.timeOfDay}</span>
            </div>
            {detail.duration && (
              <span className="inline-flex items-center gap-1 mt-1 text-xs text-gray-400">
                ⏱️ {detail.duration}
              </span>
            )}
          </div>

          {/* Completion button */}
          <button
            onClick={handleToggle}
            className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold transition-all duration-300 ${
              completed
                ? "bg-green-500 text-white shadow-lg shadow-green-200 scale-110"
                : "bg-gray-50 text-gray-300 hover:bg-gray-100 hover:text-gray-500 border border-gray-200"
            }`}
          >
            {completed ? "✓" : ""}
          </button>
        </div>

        {/* Log summary if exists */}
        {log && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            {log.feeling && (
              <span>
                {["", "😫", "😓", "😊", "💪", "🔥"][log.feeling]}
              </span>
            )}
            {log.duration ? <span>{log.duration} min</span> : null}
            {log.notes && (
              <span className="truncate max-w-[200px] text-gray-400">
                — {log.notes}
              </span>
            )}
          </div>
        )}

        {/* Action row */}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-gray-500 font-medium hover:text-gray-900 flex items-center gap-1 transition-colors"
          >
            {expanded ? "Hide details" : "Details"}
            <span className={`transition-transform inline-block ${expanded ? "rotate-180" : ""}`}>
              ▾
            </span>
          </button>
          <button
            onClick={onOpenLog}
            className="text-sm text-gray-500 font-medium hover:text-gray-900 flex items-center gap-1 transition-colors"
          >
            📝 Log
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
          {showTimer && session.category === "strength" && <RepTimer />}

          {detail.warmup && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                Warm-up
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">{detail.warmup}</p>
            </div>
          )}

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
              Instructions
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{detail.instructions}</p>
          </div>

          {detail.exercises && detail.exercises.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                Exercises
              </p>
              <div className="space-y-2">
                {detail.exercises.map((ex, i) => (
                  <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
                    <span className="w-6 h-6 bg-gray-200 rounded-lg flex items-center justify-center text-xs font-bold text-gray-600 shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{ex.name}</p>
                      {ex.alternatives && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          or {ex.alternatives.join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Week Rhythm Bar ──────────────────────────────────────────────────

function WeekRhythm({ selectedDay, onSelectDay }: { selectedDay: string; onSelectDay: (d: string) => void }) {
  const todayName = getTodayDayName();
  const weekDates = getWeekDates();

  return (
    <div className="flex gap-1 w-full">
      {weekDates.map(({ day, dateLabel }) => {
        const plan = weeklyPlan.find((d) => d.day === day);
        const isToday = day === todayName;
        const isSelected = day === selectedDay;
        const mainCategory = plan?.sessions[0]?.category || "recovery";
        const colors = categoryColors[mainCategory];

        return (
          <button
            key={day}
            onClick={() => onSelectDay(day)}
            className={`flex-1 flex flex-col items-center py-2 px-1 rounded-xl transition-all ${
              isSelected
                ? "bg-gray-900 text-white shadow-lg"
                : isToday
                ? "bg-gray-100 text-gray-900"
                : "text-gray-400 hover:bg-gray-50"
            }`}
          >
            <span className="text-[10px] font-bold uppercase">{day.slice(0, 3)}</span>
            <span className="text-xs mt-0.5">{dateLabel.split(" ")[1]}</span>
            <div
              className={`w-2 h-2 rounded-full mt-1.5 ${
                isSelected ? "bg-white" : `bg-gradient-to-r ${colors.gradient}`
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

// ── Heatmap ──────────────────────────────────────────────────────────

function ConsistencyHeatmap({ completions }: { completions: CompletionRecord }) {
  const weeks = 8;
  const today = new Date();
  const cells: { date: Date; dayName: string; pct: number }[] = [];

  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dayName = DAYS[d.getDay()];
    const wk = weekKey(d);
    const plan = weeklyPlan.find((p) => p.day === dayName);
    if (!plan) {
      cells.push({ date: d, dayName, pct: 0 });
      continue;
    }
    const total = plan.sessions.length;
    const done = plan.sessions.filter((_, si) => completions[`${wk}:${dayName}:${si}`]).length;
    cells.push({ date: d, dayName, pct: total > 0 ? done / total : 0 });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-700">Last {weeks} Weeks</span>
        <div className="flex items-center gap-1 text-[10px] text-gray-400">
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <div
              key={v}
              className="w-3 h-3 rounded-sm"
              style={{
                backgroundColor:
                  v === 0 ? "#f3f4f6" : `rgba(34, 197, 94, ${0.2 + v * 0.8})`,
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,_1fr)] gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)`, gridTemplateRows: `repeat(7, 1fr)` }}>
        {/* Render by column (week), row (day) */}
        {Array.from({ length: 7 }).map((_, dayIdx) =>
          Array.from({ length: weeks }).map((_, weekIdx) => {
            const cellIdx = weekIdx * 7 + dayIdx;
            const cell = cells[cellIdx];
            if (!cell) return <div key={`${dayIdx}-${weekIdx}`} className="w-full aspect-square" />;
            const isToday =
              cell.date.toDateString() === today.toDateString();
            return (
              <div
                key={`${dayIdx}-${weekIdx}`}
                className={`w-full aspect-square rounded-sm transition-colors ${isToday ? "ring-2 ring-gray-900 ring-offset-1" : ""}`}
                style={{
                  backgroundColor:
                    cell.pct === 0
                      ? "#f3f4f6"
                      : `rgba(34, 197, 94, ${0.2 + cell.pct * 0.8})`,
                }}
                title={`${cell.date.toLocaleDateString()} — ${Math.round(cell.pct * 100)}%`}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────

export default function Home() {
  const [level, setLevel] = useState<Level>("beginner");
  const [completions, setCompletions] = useState<CompletionRecord>({});
  const [logs, setLogs] = useState<WorkoutLog>({});
  const [selectedDay, setSelectedDay] = useState(getTodayDayName());
  const [mounted, setMounted] = useState(false);
  const [logModal, setLogModal] = useState<{ session: WorkoutSession; key: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    setLevel(load("workout-level", "beginner" as Level));
    setCompletions(load("workout-completions", {}));
    setLogs(load("workout-logs", {}));
    setMounted(true);
  }, []);

  const wk = weekKey(new Date());
  const todayName = getTodayDayName();
  const streak = mounted ? calculateStreak(completions) : 0;
  const bestStreak = mounted ? getBestStreak(completions) : 0;

  const setLevelAndSave = useCallback((l: Level) => {
    setLevel(l);
    save("workout-level", l);
  }, []);

  const toggleCompletion = useCallback(
    (dayName: string, si: number) => {
      const key = `${wk}:${dayName}:${si}`;
      setCompletions((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        save("workout-completions", next);
        return next;
      });
    },
    [wk]
  );

  const saveLog = useCallback((key: string, data: WorkoutLog[string]) => {
    setLogs((prev) => {
      const next = { ...prev, [key]: data };
      save("workout-logs", next);
      return next;
    });
  }, []);

  const activePlan = weeklyPlan.find((d) => d.day === selectedDay);

  // Weekly stats
  let weekTotal = 0;
  let weekDone = 0;
  weeklyPlan.forEach((day) => {
    day.sessions.forEach((_, si) => {
      weekTotal++;
      if (completions[`${wk}:${day.day}:${si}`]) weekDone++;
    });
  });
  const weekPct = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      {/* ── Hero Section ── */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-5 pt-6 pb-5">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-sm text-gray-400 font-medium">{getGreeting()}</p>
              <h1 className="text-2xl font-black tracking-tight text-gray-900">
                Workout Tracker
              </h1>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-10 h-10 rounded-xl bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-all"
            >
              <span className="text-lg">⚙️</span>
            </button>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="mb-5 p-4 bg-gray-50 rounded-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Level</p>
              <div className="flex gap-2">
                {([
                  { value: "beginner" as Level, label: "Beginner", icon: "🌱" },
                  { value: "intermediate" as Level, label: "Intermediate", icon: "🔥" },
                  { value: "advanced" as Level, label: "Advanced", icon: "⚡" },
                ]).map((l) => (
                  <button
                    key={l.value}
                    onClick={() => setLevelAndSave(l.value)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      level === l.value
                        ? "bg-gray-900 text-white shadow-lg"
                        : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {l.icon} {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-gray-50 rounded-2xl p-3 text-center">
              <p className="text-2xl font-black text-gray-900">{streak}</p>
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Day Streak</p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-3 text-center">
              <p className="text-2xl font-black text-gray-900">{weekDone}<span className="text-gray-300 text-lg">/{weekTotal}</span></p>
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">This Week</p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-3 text-center">
              <p className="text-2xl font-black text-gray-900">{bestStreak}</p>
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Best Streak</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-500">Weekly Progress</span>
              <span className="text-xs font-bold text-gray-900">{weekPct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${weekPct}%`,
                  background: weekPct === 100 ? "#22c55e" : "linear-gradient(90deg, #1f2937, #374151)",
                }}
              />
            </div>
          </div>

          {/* Week nav */}
          <WeekRhythm selectedDay={selectedDay} onSelectDay={setSelectedDay} />
        </div>
      </header>

      {/* ── Day Content ── */}
      <div className="max-w-lg mx-auto px-5 mt-5">
        {activePlan && (
          <>
            {/* Day header */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-black text-gray-900">{activePlan.day}</h2>
                {selectedDay === todayName && (
                  <span className="px-2 py-0.5 bg-gray-900 text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                    Today
                  </span>
                )}
                <span className="ml-auto px-2.5 py-1 bg-gray-100 rounded-full text-xs font-semibold text-gray-500">
                  {activePlan.theme}
                </span>
              </div>
              <p className="text-sm text-gray-400">{activePlan.focus}</p>
            </div>

            {/* Session cards */}
            <div className="space-y-4">
              {activePlan.sessions.map((session, si) => {
                const key = `${wk}:${activePlan.day}:${si}`;
                return (
                  <SessionCard
                    key={si}
                    session={session}
                    level={level}
                    completed={!!completions[key]}
                    onToggle={() => toggleCompletion(activePlan.day, si)}
                    logKey={key}
                    logs={logs}
                    onOpenLog={() => setLogModal({ session, key })}
                    showTimer={level !== "advanced"}
                  />
                );
              })}
            </div>
          </>
        )}

        {/* Heatmap */}
        <div className="mt-8 bg-white rounded-2xl border border-gray-100 p-5">
          <ConsistencyHeatmap completions={completions} />
        </div>

        {/* Weekly Rhythm Legend */}
        <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Weekly Rhythm</p>
          <div className="grid grid-cols-7 gap-2">
            {weeklyPlan.map((day) => {
              const cat = day.sessions[0]?.category || "recovery";
              const colors = categoryColors[cat];
              return (
                <div key={day.day} className="text-center">
                  <div className={`w-full h-1.5 rounded-full bg-gradient-to-r ${colors.gradient} mb-1.5`} />
                  <p className="text-[10px] font-bold text-gray-500">{day.day.slice(0, 3)}</p>
                  <p className="text-[9px] text-gray-400">{day.theme}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Log Modal */}
      {logModal && (
        <LogModal
          session={logModal.session}
          logKey={logModal.key}
          logs={logs}
          onSave={saveLog}
          onClose={() => setLogModal(null)}
        />
      )}

      {/* Confetti keyframe */}
      <style jsx global>{`
        @keyframes confetti-burst {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(
              calc(-50% + var(--tx)),
              calc(-50% + var(--ty))
            ) scale(0);
            opacity: 0;
          }
        }
      `}</style>
    </main>
  );
}
