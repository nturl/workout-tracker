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

interface CompletionRecord { [key: string]: boolean }
interface WorkoutLog {
  [key: string]: {
    notes?: string;
    duration?: number;
    feeling?: 1 | 2 | 3 | 4 | 5;
    completedAt?: string;
  };
}
interface NotificationSettings {
  enabled: boolean;
  times: { [day: string]: string }; // e.g. { Monday: "17:00" }
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Theme ────────────────────────────────────────────────────────────

type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

// ── Notifications ────────────────────────────────────────────────────

async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function scheduleNotifications(settings: NotificationSettings) {
  if (!settings.enabled || !("Notification" in window) || Notification.permission !== "granted") return;

  // Clear existing
  if ((window as unknown as Record<string, unknown>).__notifTimers) {
    ((window as unknown as Record<string, ReturnType<typeof setTimeout>[]>).__notifTimers).forEach(clearTimeout);
  }

  const timers: ReturnType<typeof setTimeout>[] = [];
  const now = new Date();
  const todayName = DAYS[now.getDay()];
  const timeStr = settings.times[todayName];

  if (timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);

    if (target > now) {
      const delay = target.getTime() - now.getTime();
      const plan = weeklyPlan.find((d) => d.day === todayName);
      const timer = setTimeout(() => {
        new Notification("Workout Tracker", {
          body: `Time for today's ${plan?.sessions[0]?.title || "workout"}! 💪`,
          icon: "/icon-192.png",
        });
      }, delay);
      timers.push(timer);
    }
  }

  (window as unknown as Record<string, unknown>).__notifTimers = timers;
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
    const allDone = plan.sessions.every((_, si) => completions[`${wk}:${dayName}:${si}`]);
    if (allDone) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function getBestStreak(completions: CompletionRecord): number {
  let best = 0, current = 0;
  const today = new Date();
  for (let i = 365; i >= 0; i--) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const dayName = DAYS[checkDate.getDay()];
    const wk = weekKey(checkDate);
    const plan = weeklyPlan.find((d) => d.day === dayName);
    if (!plan) continue;
    const allDone = plan.sessions.every((_, si) => completions[`${wk}:${dayName}:${si}`]);
    if (allDone) { current++; best = Math.max(best, current); }
    else current = 0;
  }
  return best;
}

// ── Helpers ──────────────────────────────────────────────────────────

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getTodayDayName() { return DAYS[new Date().getDay()]; }

function getWeekDates() {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  return DAYS.map((_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return { day: DAYS[i], date: d, dateLabel: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
  });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Confetti ─────────────────────────────────────────────────────────

function ConfettiBurst({ active }: { active: boolean }) {
  if (!active) return null;
  const particles = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * 360;
    const distance = 40 + Math.random() * 60;
    const clrs = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
    return { angle, distance, color: clrs[i % clrs.length], size: 4 + Math.random() * 4, delay: Math.random() * 0.15 };
  });
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {particles.map((p, i) => (
        <div key={i} className="absolute left-1/2 top-1/2 rounded-full" style={{
          width: p.size, height: p.size, backgroundColor: p.color,
          animation: `confetti-burst 0.6s ease-out ${p.delay}s forwards`,
          transform: "translate(-50%, -50%)",
          // @ts-expect-error CSS custom properties
          "--tx": `${Math.cos((p.angle * Math.PI) / 180) * p.distance}px`,
          "--ty": `${Math.sin((p.angle * Math.PI) / 180) * p.distance}px`,
        }} />
      ))}
    </div>
  );
}

// ── Timer ────────────────────────────────────────────────────────────

function RepTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"up" | "down">("up");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s >= 9) { setPhase((p) => (p === "up" ? "down" : "up")); return 0; }
          return s + 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  return (
    <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: "var(--timer-bg)" }}>
      <div className="flex-1">
        <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">Super-Slow Timer</div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-mono font-bold tabular-nums text-white">{seconds + 1}</span>
          <span className="text-lg text-gray-400">/ 10s</span>
          <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${
            phase === "up" ? "bg-blue-500/20 text-blue-400" : "bg-amber-500/20 text-amber-400"
          }`}>
            {phase === "up" ? "↑ LIFTING" : "↓ LOWERING"}
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setRunning(!running)}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all ${
            running ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
          } text-white`}>
          {running ? "⏸" : "▶"}
        </button>
        <button onClick={() => { setRunning(false); setSeconds(0); setPhase("up"); }}
          className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-all text-white">
          ↺
        </button>
      </div>
    </div>
  );
}

// ── Log Modal ────────────────────────────────────────────────────────

function LogModal({ session, logKey, logs, onSave, onClose }: {
  session: WorkoutSession; logKey: string; logs: WorkoutLog;
  onSave: (key: string, data: WorkoutLog[string]) => void; onClose: () => void;
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm" style={{ backgroundColor: "var(--modal-overlay)" }}>
      <div className="rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" style={{ background: "var(--bg-card)" }}>
        <div className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{session.title} — Log</h3>
            <button onClick={onClose} className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>&times;</button>
          </div>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <label className="text-sm font-semibold block mb-2" style={{ color: "var(--text-secondary)" }}>How did it feel?</label>
            <div className="flex gap-2">
              {feelings.map((f) => (
                <button key={f.value} onClick={() => setFeeling(f.value)}
                  className={`flex-1 py-2 rounded-xl text-center transition-all ${
                    feeling === f.value ? "scale-105 shadow-lg" : ""
                  }`}
                  style={{
                    background: feeling === f.value ? "var(--text-primary)" : "var(--bg-elevated)",
                    color: feeling === f.value ? "var(--bg-primary)" : "var(--text-primary)",
                  }}>
                  <div className="text-xl">{f.emoji}</div>
                  <div className="text-[10px] mt-0.5 font-medium">{f.label}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold block mb-2" style={{ color: "var(--text-secondary)" }}>Duration (minutes)</label>
            <input type="number" value={duration || ""} onChange={(e) => setDuration(parseInt(e.target.value) || 0)} placeholder="e.g. 20"
              className="w-full px-4 py-3 rounded-xl border outline-none transition-all text-lg"
              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
          </div>
          <div>
            <label className="text-sm font-semibold block mb-2" style={{ color: "var(--text-secondary)" }}>
              Notes <span className="font-normal" style={{ color: "var(--text-muted)" }}>(weights, reps, observations)</span>
            </label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Chest press: 135lbs, ~100s TUT..." rows={4}
              className="w-full px-4 py-3 rounded-xl border outline-none transition-all resize-none"
              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
          </div>
        </div>
        <div className="p-5 flex gap-3 border-t" style={{ borderColor: "var(--border)" }}>
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border font-medium transition-all hover:opacity-80"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>Cancel</button>
          <button onClick={() => { onSave(logKey, { notes, duration, feeling, completedAt: new Date().toISOString() }); onClose(); }}
            className="flex-1 py-3 rounded-xl font-medium transition-all hover:opacity-90"
            style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>Save Log</button>
        </div>
      </div>
    </div>
  );
}

// ── Settings Panel ───────────────────────────────────────────────────

function SettingsPanel({ level, setLevel, theme, setTheme, notifSettings, setNotifSettings }: {
  level: Level; setLevel: (l: Level) => void;
  theme: Theme; setTheme: (t: Theme) => void;
  notifSettings: NotificationSettings; setNotifSettings: (s: NotificationSettings) => void;
}) {
  const handleNotifToggle = async () => {
    if (!notifSettings.enabled) {
      const granted = await requestNotificationPermission();
      if (granted) {
        const newSettings = { ...notifSettings, enabled: true };
        setNotifSettings(newSettings);
      }
    } else {
      setNotifSettings({ ...notifSettings, enabled: false });
    }
  };

  const updateTime = (day: string, time: string) => {
    setNotifSettings({
      ...notifSettings,
      times: { ...notifSettings.times, [day]: time },
    });
  };

  const defaultTimes: Record<string, string> = {
    Monday: "17:00", Tuesday: "17:00", Wednesday: "07:00",
    Thursday: "12:00", Friday: "17:00", Saturday: "09:00", Sunday: "10:00",
  };

  return (
    <div className="mb-5 p-4 rounded-2xl space-y-5" style={{ background: "var(--bg-elevated)" }}>
      {/* Level */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Level</p>
        <div className="flex gap-2">
          {([
            { value: "beginner" as Level, label: "Beginner", icon: "🌱" },
            { value: "intermediate" as Level, label: "Intermediate", icon: "🔥" },
            { value: "advanced" as Level, label: "Advanced", icon: "⚡" },
          ]).map((l) => (
            <button key={l.value} onClick={() => setLevel(l.value)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                level === l.value ? "shadow-lg" : "border hover:opacity-80"
              }`}
              style={{
                background: level === l.value ? "var(--text-primary)" : "var(--bg-card)",
                color: level === l.value ? "var(--bg-primary)" : "var(--text-secondary)",
                borderColor: level !== l.value ? "var(--border)" : undefined,
              }}>
              {l.icon} {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Appearance</p>
        <div className="flex gap-2">
          {([
            { value: "light" as Theme, label: "Light", icon: "☀️" },
            { value: "dark" as Theme, label: "Dark", icon: "🌙" },
            { value: "system" as Theme, label: "System", icon: "💻" },
          ]).map((t) => (
            <button key={t.value} onClick={() => setTheme(t.value)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                theme === t.value ? "shadow-lg" : "border hover:opacity-80"
              }`}
              style={{
                background: theme === t.value ? "var(--text-primary)" : "var(--bg-card)",
                color: theme === t.value ? "var(--bg-primary)" : "var(--text-secondary)",
                borderColor: theme !== t.value ? "var(--border)" : undefined,
              }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Reminders</p>
          <button onClick={handleNotifToggle}
            className={`w-12 h-7 rounded-full transition-all relative ${notifSettings.enabled ? "bg-green-500" : ""}`}
            style={{ background: notifSettings.enabled ? undefined : "var(--border)" }}>
            <div className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-1 transition-all ${
              notifSettings.enabled ? "left-6" : "left-1"
            }`} />
          </button>
        </div>
        {notifSettings.enabled && (
          <div className="space-y-2">
            {DAYS.filter(d => d !== "Sunday" || true).map((day) => {
              const plan = weeklyPlan.find((p) => p.day === day);
              if (!plan) return null;
              return (
                <div key={day} className="flex items-center justify-between py-1.5">
                  <div>
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{day}</span>
                    <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>{plan.sessions[0]?.title}</span>
                  </div>
                  <input type="time" value={notifSettings.times[day] || defaultTimes[day] || "17:00"}
                    onChange={(e) => updateTime(day, e.target.value)}
                    className="text-sm rounded-lg px-2 py-1 border outline-none"
                    style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Session Card ─────────────────────────────────────────────────────

function SessionCard({ session, level, completed, onToggle, logKey, logs, onOpenLog, showTimer }: {
  session: WorkoutSession; level: Level; completed: boolean; onToggle: () => void;
  logKey: string; logs: WorkoutLog; onOpenLog: () => void; showTimer: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const detail = session.levels[level];
  const colors = categoryColors[session.category];
  const log = logs[logKey];

  const handleToggle = () => {
    if (!completed) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 800); }
    onToggle();
  };

  return (
    <div className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden relative ${
      completed ? "border-green-400/60" : ""
    }`} style={{
      background: completed ? undefined : "var(--bg-card)",
      borderColor: completed ? undefined : "var(--border)",
      backgroundColor: completed ? "rgba(34, 197, 94, 0.08)" : undefined,
    }}>
      <ConfettiBurst active={showConfetti} />
      <div className={`h-1 bg-gradient-to-r ${colors.gradient}`} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl">{session.icon}</span>
              <h3 className={`font-bold text-lg ${completed ? "text-green-600 dark:text-green-400" : ""}`}
                style={{ color: completed ? undefined : "var(--text-primary)" }}>
                {session.title}
              </h3>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
                {categoryLabels[session.category]}
              </span>
            </div>
            {session.subtitle && <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{session.subtitle}</p>}
            <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <span>🕐 {session.timeOfDay}</span>
            </div>
            {detail.duration && <span className="inline-flex items-center gap-1 mt-1 text-xs" style={{ color: "var(--text-muted)" }}>⏱️ {detail.duration}</span>}
          </div>
          <button onClick={handleToggle}
            className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold transition-all duration-300 ${
              completed ? "bg-green-500 text-white shadow-lg shadow-green-500/30 scale-110" : "border"
            }`}
            style={completed ? {} : { background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
            {completed ? "✓" : ""}
          </button>
        </div>
        {log && (
          <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            {log.feeling && <span>{["", "😫", "😓", "😊", "💪", "🔥"][log.feeling]}</span>}
            {log.duration ? <span>{log.duration} min</span> : null}
            {log.notes && <span className="truncate max-w-[200px]">— {log.notes}</span>}
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => setExpanded(!expanded)}
            className="text-sm font-medium flex items-center gap-1 transition-colors hover:opacity-70"
            style={{ color: "var(--text-secondary)" }}>
            {expanded ? "Hide details" : "Details"}
            <span className={`transition-transform inline-block ${expanded ? "rotate-180" : ""}`}>▾</span>
          </button>
          <button onClick={onOpenLog} className="text-sm font-medium flex items-center gap-1 transition-colors hover:opacity-70"
            style={{ color: "var(--text-secondary)" }}>📝 Log</button>
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-5 pt-4 space-y-4 border-t" style={{ borderColor: "var(--border)" }}>
          {showTimer && session.category === "strength" && <RepTimer />}
          {detail.warmup && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Warm-up</p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{detail.warmup}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Instructions</p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{detail.instructions}</p>
          </div>
          {detail.exercises && detail.exercises.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Exercises</p>
              <div className="space-y-2">
                {detail.exercises.map((ex, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl p-3" style={{ background: "var(--bg-elevated)" }}>
                    <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                      style={{ background: "var(--border)", color: "var(--text-secondary)" }}>{i + 1}</span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{ex.name}</p>
                      {ex.alternatives && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>or {ex.alternatives.join(" · ")}</p>}
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
          <button key={day} onClick={() => onSelectDay(day)}
            className={`flex-1 flex flex-col items-center py-2 px-1 rounded-xl transition-all ${
              isSelected ? "shadow-lg" : ""
            }`}
            style={{
              background: isSelected ? "var(--text-primary)" : isToday ? "var(--bg-elevated)" : "transparent",
              color: isSelected ? "var(--bg-primary)" : isToday ? "var(--text-primary)" : "var(--text-muted)",
            }}>
            <span className="text-[10px] font-bold uppercase">{day.slice(0, 3)}</span>
            <span className="text-xs mt-0.5">{dateLabel.split(" ")[1]}</span>
            <div className={`w-2 h-2 rounded-full mt-1.5 ${isSelected ? "bg-current opacity-60" : `bg-gradient-to-r ${colors.gradient}`}`} />
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
  const cells: { date: Date; pct: number }[] = [];
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const dayName = DAYS[d.getDay()]; const wk = weekKey(d);
    const plan = weeklyPlan.find((p) => p.day === dayName);
    if (!plan) { cells.push({ date: d, pct: 0 }); continue; }
    const total = plan.sessions.length;
    const done = plan.sessions.filter((_, si) => completions[`${wk}:${dayName}:${si}`]).length;
    cells.push({ date: d, pct: total > 0 ? done / total : 0 });
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Last {weeks} Weeks</span>
        <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <div key={v} className="w-3 h-3 rounded-sm" style={{
              backgroundColor: v === 0 ? "var(--heatmap-empty)" : `rgba(var(--heatmap-fill), ${0.2 + v * 0.8})`,
            }} />
          ))}
          <span>More</span>
        </div>
      </div>
      <div className="gap-[3px]" style={{ display: "grid", gridTemplateColumns: `repeat(${weeks}, 1fr)`, gridTemplateRows: "repeat(7, 1fr)" }}>
        {Array.from({ length: 7 }).map((_, dayIdx) =>
          Array.from({ length: weeks }).map((_, weekIdx) => {
            const cellIdx = weekIdx * 7 + dayIdx;
            const cell = cells[cellIdx];
            if (!cell) return <div key={`${dayIdx}-${weekIdx}`} className="w-full aspect-square" />;
            const isToday = cell.date.toDateString() === today.toDateString();
            return (
              <div key={`${dayIdx}-${weekIdx}`}
                className={`w-full aspect-square rounded-sm transition-colors ${isToday ? "ring-2 ring-offset-1" : ""}`}
                style={{
                  backgroundColor: cell.pct === 0 ? "var(--heatmap-empty)" : `rgba(var(--heatmap-fill), ${0.2 + cell.pct * 0.8})`,
                  ...(isToday ? { ["--tw-ring-color" as string]: "var(--text-primary)", ["--tw-ring-offset-color" as string]: "var(--ring-offset)" } : {}),
                }}
                title={`${cell.date.toLocaleDateString()} — ${Math.round(cell.pct * 100)}%`} />
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────

export default function Home() {
  const [level, setLevel] = useState<Level>("beginner");
  const [completions, setCompletions] = useState<CompletionRecord>({});
  const [logs, setLogs] = useState<WorkoutLog>({});
  const [selectedDay, setSelectedDay] = useState(getTodayDayName());
  const [mounted, setMounted] = useState(false);
  const [logModal, setLogModal] = useState<{ session: WorkoutSession; key: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setThemeState] = useState<Theme>("system");
  const [notifSettings, setNotifSettingsState] = useState<NotificationSettings>({
    enabled: false,
    times: { Monday: "17:00", Tuesday: "17:00", Wednesday: "07:00", Thursday: "12:00", Friday: "17:00", Saturday: "09:00", Sunday: "10:00" },
  });

  useEffect(() => {
    setLevel(load("workout-level", "beginner" as Level));
    setCompletions(load("workout-completions", {}));
    setLogs(load("workout-logs", {}));
    const savedTheme = load<Theme>("workout-theme", "system");
    setThemeState(savedTheme);
    applyTheme(savedTheme);
    setNotifSettingsState(load("workout-notifications", {
      enabled: false,
      times: { Monday: "17:00", Tuesday: "17:00", Wednesday: "07:00", Thursday: "12:00", Friday: "17:00", Saturday: "09:00", Sunday: "10:00" },
    }));
    setMounted(true);
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Schedule notifications when settings change
  useEffect(() => {
    if (mounted) scheduleNotifications(notifSettings);
  }, [notifSettings, mounted]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t); save("workout-theme", t); applyTheme(t);
  }, []);

  const setLevelAndSave = useCallback((l: Level) => { setLevel(l); save("workout-level", l); }, []);

  const setNotifSettings = useCallback((s: NotificationSettings) => {
    setNotifSettingsState(s); save("workout-notifications", s);
  }, []);

  const wk = weekKey(new Date());
  const todayName = getTodayDayName();
  const streak = mounted ? calculateStreak(completions) : 0;
  const bestStreak = mounted ? getBestStreak(completions) : 0;

  const toggleCompletion = useCallback((dayName: string, si: number) => {
    const key = `${wk}:${dayName}:${si}`;
    setCompletions((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      save("workout-completions", next);
      return next;
    });
  }, [wk]);

  const saveLog = useCallback((key: string, data: WorkoutLog[string]) => {
    setLogs((prev) => { const next = { ...prev, [key]: data }; save("workout-logs", next); return next; });
  }, []);

  const activePlan = weeklyPlan.find((d) => d.day === selectedDay);

  let weekTotal = 0, weekDone = 0;
  weeklyPlan.forEach((day) => {
    day.sessions.forEach((_, si) => { weekTotal++; if (completions[`${wk}:${day.day}:${si}`]) weekDone++; });
  });
  const weekPct = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--text-primary)" }} />
      </div>
    );
  }

  return (
    <main className="min-h-screen pb-12" style={{ background: "var(--bg-primary)" }}>
      {/* Hero */}
      <header className="border-b" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="max-w-lg mx-auto px-5 pt-6 pb-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>{getGreeting()}</p>
              <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>Workout Tracker</h1>
            </div>
            <button onClick={() => setShowSettings(!showSettings)}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
              style={{ background: "var(--bg-elevated)" }}>
              <span className="text-lg">{showSettings ? "✕" : "⚙️"}</span>
            </button>
          </div>

          {showSettings && (
            <SettingsPanel level={level} setLevel={setLevelAndSave}
              theme={theme} setTheme={setTheme}
              notifSettings={notifSettings} setNotifSettings={setNotifSettings} />
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { value: streak, label: "Day Streak" },
              { value: `${weekDone}`, sub: `/${weekTotal}`, label: "This Week" },
              { value: bestStreak, label: "Best Streak" },
            ].map((s, i) => (
              <div key={i} className="rounded-2xl p-3 text-center" style={{ background: "var(--bg-elevated)" }}>
                <p className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>
                  {s.value}
                  {s.sub && <span className="text-lg" style={{ color: "var(--text-muted)" }}>{s.sub}</span>}
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Progress */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Weekly Progress</span>
              <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{weekPct}%</span>
            </div>
            <div className="w-full rounded-full h-2.5 overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
              <div className="h-full rounded-full transition-all duration-700 ease-out" style={{
                width: `${weekPct}%`,
                background: weekPct === 100 ? "#22c55e" : `linear-gradient(90deg, var(--text-primary), var(--text-secondary))`,
              }} />
            </div>
          </div>

          <WeekRhythm selectedDay={selectedDay} onSelectDay={setSelectedDay} />
        </div>
      </header>

      {/* Day Content */}
      <div className="max-w-lg mx-auto px-5 mt-5">
        {activePlan && (
          <>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{activePlan.day}</h2>
                {selectedDay === todayName && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider"
                    style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>Today</span>
                )}
                <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>{activePlan.theme}</span>
              </div>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>{activePlan.focus}</p>
            </div>
            <div className="space-y-4">
              {activePlan.sessions.map((session, si) => {
                const key = `${wk}:${activePlan.day}:${si}`;
                return (
                  <SessionCard key={si} session={session} level={level} completed={!!completions[key]}
                    onToggle={() => toggleCompletion(activePlan.day, si)} logKey={key} logs={logs}
                    onOpenLog={() => setLogModal({ session, key })} showTimer={level !== "advanced"} />
                );
              })}
            </div>
          </>
        )}

        <div className="mt-8 rounded-2xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <ConsistencyHeatmap completions={completions} />
        </div>

        <div className="mt-4 rounded-2xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <p className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Weekly Rhythm</p>
          <div className="grid grid-cols-7 gap-2">
            {weeklyPlan.map((day) => {
              const cat = day.sessions[0]?.category || "recovery";
              const colors = categoryColors[cat];
              return (
                <div key={day.day} className="text-center">
                  <div className={`w-full h-1.5 rounded-full bg-gradient-to-r ${colors.gradient} mb-1.5`} />
                  <p className="text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>{day.day.slice(0, 3)}</p>
                  <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>{day.theme}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {logModal && (
        <LogModal session={logModal.session} logKey={logModal.key} logs={logs}
          onSave={saveLog} onClose={() => setLogModal(null)} />
      )}

    </main>
  );
}
