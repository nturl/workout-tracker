"use client";

import { useState, useEffect, useCallback } from "react";
import {
  weeklyPlan,
  dayColors,
  dayEmojis,
  type Level,
  type DayPlan,
  type WorkoutSession,
} from "@/lib/workoutData";

// ── Persistence helpers ──────────────────────────────────────────────

function weekKey(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

interface CompletionRecord {
  [weekAndSession: string]: boolean;
}

function loadCompletions(): CompletionRecord {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem("workout-completions") || "{}");
  } catch {
    return {};
  }
}

function saveCompletions(c: CompletionRecord) {
  localStorage.setItem("workout-completions", JSON.stringify(c));
}

function loadLevel(): Level {
  if (typeof window === "undefined") return "beginner";
  return (localStorage.getItem("workout-level") as Level) || "beginner";
}

function saveLevel(l: Level) {
  localStorage.setItem("workout-level", l);
}

// ── Helpers ──────────────────────────────────────────────────────────

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function getTodayDayName(): string {
  return DAYS[new Date().getDay()];
}

function getWeekDates(): { day: string; date: Date; dateLabel: string }[] {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());

  return DAYS.map((day, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return {
      day,
      date: d,
      dateLabel: d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    };
  });
}

// ── Components ──────────────────────────────────────────────────────

function LevelSelector({
  level,
  setLevel,
}: {
  level: Level;
  setLevel: (l: Level) => void;
}) {
  const levels: { value: Level; label: string; icon: string }[] = [
    { value: "beginner", label: "Beginner", icon: "🌱" },
    { value: "intermediate", label: "Intermediate", icon: "🔥" },
    { value: "advanced", label: "Advanced", icon: "⚡" },
  ];

  return (
    <div className="flex gap-2">
      {levels.map((l) => (
        <button
          key={l.value}
          onClick={() => setLevel(l.value)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            level === l.value
              ? "bg-[var(--accent)] text-white shadow-md"
              : "bg-white text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--accent)]"
          }`}
        >
          {l.icon} {l.label}
        </button>
      ))}
    </div>
  );
}

function SessionCard({
  session,
  level,
  completed,
  onToggle,
}: {
  session: WorkoutSession;
  level: Level;
  completed: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detail = session.levels[level];

  return (
    <div
      className={`bg-white rounded-xl border transition-all ${
        completed
          ? "border-[var(--success)] bg-green-50/50"
          : "border-[var(--border)]"
      }`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{session.title}</h3>
              {completed && (
                <span className="text-[var(--success)] text-xl">✓</span>
              )}
            </div>
            {session.subtitle && (
              <p className="text-sm text-[var(--muted)] mt-0.5">
                {session.subtitle}
              </p>
            )}
            <p className="text-xs text-[var(--muted)] mt-1 flex items-center gap-1">
              <span>🕐</span> {session.timeOfDay}
            </p>
            {detail.duration && (
              <p className="text-xs text-[var(--muted)] mt-0.5 flex items-center gap-1">
                <span>⏱️</span> {detail.duration}
              </p>
            )}
          </div>
          <button
            onClick={onToggle}
            className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold transition-all ${
              completed
                ? "bg-[var(--success)] text-white"
                : "bg-gray-100 text-gray-400 hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
            }`}
            aria-label={completed ? "Mark incomplete" : "Mark complete"}
          >
            {completed ? "✓" : "○"}
          </button>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-sm text-[var(--accent)] font-medium hover:underline flex items-center gap-1"
        >
          {expanded ? "Hide details ▲" : "Show details ▼"}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[var(--border)] pt-3">
          {detail.warmup && (
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase text-[var(--muted)] mb-1">
                Warm-up
              </p>
              <p className="text-sm">{detail.warmup}</p>
            </div>
          )}

          <div className="mb-3">
            <p className="text-xs font-semibold uppercase text-[var(--muted)] mb-1">
              Instructions
            </p>
            <p className="text-sm leading-relaxed">{detail.instructions}</p>
          </div>

          {detail.exercises && detail.exercises.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--muted)] mb-2">
                Exercises
              </p>
              <ul className="space-y-2">
                {detail.exercises.map((ex, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{ex.name}</span>
                    {ex.alternatives && ex.alternatives.length > 0 && (
                      <span className="text-[var(--muted)]">
                        {" "}
                        — or {ex.alternatives.join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WeeklyProgress({
  completions,
  wk,
}: {
  completions: CompletionRecord;
  wk: string;
}) {
  let total = 0;
  let done = 0;
  weeklyPlan.forEach((day) => {
    day.sessions.forEach((_, si) => {
      total++;
      if (completions[`${wk}:${day.day}:${si}`]) done++;
    });
  });

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Weekly Progress</span>
        <span className="text-sm font-bold text-[var(--accent)]">
          {done}/{total} sessions
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background:
              pct === 100 ? "var(--success)" : "var(--accent)",
          }}
        />
      </div>
      <p className="text-xs text-[var(--muted)] mt-1.5 text-right">{pct}%</p>
    </div>
  );
}

function DayTab({
  dayName,
  dateLabel,
  isActive,
  isToday,
  sessionsCompleted,
  totalSessions,
  onClick,
}: {
  dayName: string;
  dateLabel: string;
  isActive: boolean;
  isToday: boolean;
  sessionsCompleted: number;
  totalSessions: number;
  onClick: () => void;
}) {
  const colors = dayColors[dayName];
  const allDone = totalSessions > 0 && sessionsCompleted === totalSessions;

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center py-2 px-3 rounded-xl text-xs font-medium transition-all min-w-[52px] ${
        isActive
          ? `${colors.bg} ${colors.text} ring-2 ring-offset-1 ring-current`
          : isToday
          ? `${colors.bg} ${colors.text}`
          : "bg-white text-gray-500 hover:bg-gray-50"
      } ${allDone ? "ring-2 ring-green-400 ring-offset-1" : ""}`}
    >
      <span className="text-lg mb-0.5">{dayEmojis[dayName]}</span>
      <span className="font-semibold">{dayName.slice(0, 3)}</span>
      <span className="text-[10px] opacity-70">{dateLabel}</span>
      {totalSessions > 0 && (
        <span
          className={`text-[10px] mt-1 ${
            allDone ? "text-green-600 font-bold" : "opacity-50"
          }`}
        >
          {sessionsCompleted}/{totalSessions}
        </span>
      )}
    </button>
  );
}

// ── Main App ─────────────────────────────────────────────────────────

export default function Home() {
  const [level, setLevel] = useState<Level>("beginner");
  const [completions, setCompletions] = useState<CompletionRecord>({});
  const [selectedDay, setSelectedDay] = useState<string>(getTodayDayName());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLevel(loadLevel());
    setCompletions(loadCompletions());
    setMounted(true);
  }, []);

  const handleSetLevel = useCallback((l: Level) => {
    setLevel(l);
    saveLevel(l);
  }, []);

  const wk = weekKey(new Date());

  const toggleCompletion = useCallback(
    (dayName: string, sessionIndex: number) => {
      const key = `${wk}:${dayName}:${sessionIndex}`;
      setCompletions((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        saveCompletions(next);
        return next;
      });
    },
    [wk]
  );

  const weekDates = getWeekDates();
  const todayName = getTodayDayName();

  const activePlan: DayPlan | undefined = weeklyPlan.find(
    (d) => d.day === selectedDay
  );

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-[var(--muted)]">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen pb-8">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[var(--background)]/95 backdrop-blur-sm border-b border-[var(--border)] px-4 pt-4 pb-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold tracking-tight">
              Workout Tracker
            </h1>
            <LevelSelector level={level} setLevel={handleSetLevel} />
          </div>

          {/* Day tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {weekDates.map(({ day, dateLabel }) => {
              const plan = weeklyPlan.find((d) => d.day === day);
              const total = plan ? plan.sessions.length : 0;
              const done = plan
                ? plan.sessions.filter(
                    (_, si) => completions[`${wk}:${day}:${si}`]
                  ).length
                : 0;
              return (
                <DayTab
                  key={day}
                  dayName={day}
                  dateLabel={dateLabel}
                  isActive={selectedDay === day}
                  isToday={todayName === day}
                  sessionsCompleted={done}
                  totalSessions={total}
                  onClick={() => setSelectedDay(day)}
                />
              );
            })}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 mt-4 space-y-4">
        <WeeklyProgress completions={completions} wk={wk} />

        {/* Day heading */}
        {activePlan && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{dayEmojis[activePlan.day]}</span>
              <h2 className="text-xl font-bold">{activePlan.day}</h2>
              {selectedDay === todayName && (
                <span className="px-2 py-0.5 bg-[var(--accent)] text-white text-xs rounded-full font-medium">
                  Today
                </span>
              )}
            </div>

            {/* Session cards */}
            <div className="space-y-3">
              {activePlan.sessions.map((session, si) => {
                const key = `${wk}:${activePlan.day}:${si}`;
                return (
                  <SessionCard
                    key={si}
                    session={session}
                    level={level}
                    completed={!!completions[key]}
                    onToggle={() => toggleCompletion(activePlan.day, si)}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
