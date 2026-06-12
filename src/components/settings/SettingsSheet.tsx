"use client";

import { Sheet } from "@/components/ui/Sheet";
import { type Level } from "@/lib/workoutData";
import { PushSetup } from "./PushSetup";
import { ConnectedAccounts } from "./ConnectedAccounts";
import { useWorkoutStore } from "@/hooks/useWorkoutStore";
import type { Theme } from "@/types/workout";

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  level: Level;
  setLevel: (l: Level) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export function SettingsSheet({ open, onClose, level, setLevel, theme, setTheme }: SettingsSheetProps) {
  const timerSettings = useWorkoutStore((s) => s.timerSettings);
  const setTimerSettings = useWorkoutStore((s) => s.setTimerSettings);

  const toggleTimerSetting = (key: keyof typeof timerSettings) => {
    setTimerSettings({ ...timerSettings, [key]: !timerSettings[key] });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Settings" subtitle="Customize your experience">
      <div className="p-5 space-y-6">
        {/* Level */}
        <div>
          <p className="text-xs font-semibold tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>Level</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Difficulty level">
            {([
              { value: "beginner" as Level, label: "Beginner", icon: "🌱" },
              { value: "intermediate" as Level, label: "Intermediate", icon: "🔥" },
              { value: "advanced" as Level, label: "Advanced", icon: "⚡" },
            ]).map((l) => (
              <button key={l.value} onClick={() => setLevel(l.value)}
                role="radio" aria-checked={level === l.value}
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
          <p className="text-xs font-semibold tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>Appearance</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Theme">
            {([
              { value: "light" as Theme, label: "Light", icon: "☀️" },
              { value: "dark" as Theme, label: "Dark", icon: "🌙" },
              { value: "system" as Theme, label: "System", icon: "💻" },
            ]).map((t) => (
              <button key={t.value} onClick={() => setTheme(t.value)}
                role="radio" aria-checked={theme === t.value}
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

        {/* Notifications (Web Push) */}
        <PushSetup />

        {/* Timer */}
        <div>
          <p className="text-xs font-semibold tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>Timer</p>
          <div className="space-y-3">
            {([
              { key: "audio", label: "Audio cues", description: "Beeps on rep boundaries and set complete" },
              { key: "countdownTicks", label: "Countdown ticks", description: "Low ticks at 3-2-1 before each phase ends", disabled: !timerSettings.audio },
              { key: "haptics", label: "Haptics", description: "Vibration on rep and set events" },
              { key: "wakeLock", label: "Keep screen awake", description: "Prevent sleep while a timer is running" },
            ] as const).map((opt) => {
              const enabled = timerSettings[opt.key];
              const disabled = "disabled" in opt && opt.disabled;
              return (
                <div key={opt.key} className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: disabled ? "var(--text-muted)" : "var(--text-primary)" }}>
                      {opt.label}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{opt.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => !disabled && toggleTimerSetting(opt.key)}
                    role="switch"
                    aria-checked={enabled}
                    aria-label={opt.label}
                    disabled={disabled}
                    className={`shrink-0 w-12 h-7 rounded-full transition-all relative ${enabled && !disabled ? "bg-green-500" : ""} ${disabled ? "opacity-40" : ""}`}
                    style={{ background: enabled && !disabled ? undefined : "var(--border)" }}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-1 transition-all ${enabled ? "left-6" : "left-1"}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Connected Accounts */}
        <ConnectedAccounts />
      </div>
    </Sheet>
  );
}
