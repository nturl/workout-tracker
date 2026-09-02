"use client";

import type { CSSProperties } from "react";
import { type Level } from "@/lib/workoutData";
import { PushSetup } from "@/components/settings/PushSetup";
import { ConnectedAccounts } from "@/components/settings/ConnectedAccounts";
import { HabitManager } from "@/components/settings/HabitManager";
import { useWorkoutStore } from "@/hooks/useWorkoutStore";
import { useTheme } from "@/hooks/useTheme";
import { UserButton } from "@clerk/nextjs";
import type { Theme } from "@/types/workout";

const sectionLabel =
  "text-[12px] leading-[16px] font-semibold tracking-[0.08em] uppercase text-content-secondary mb-3";

interface SettingsTabProps {
  /** Push pending changes (debounced). Owned by the page, which runs the one
   *  useSync() instance — BUG-05: this tab used to create a second one, and
   *  since it unmounts on every tab switch, each Settings visit re-ran the
   *  first-load hydrate+full-push against a cached, possibly stale snapshot. */
  syncNow: () => void;
}

export function SettingsTab({ syncNow }: SettingsTabProps) {
  const level = useWorkoutStore((s) => s.level);
  const setLevel = useWorkoutStore((s) => s.setLevel);
  const timerSettings = useWorkoutStore((s) => s.timerSettings);
  const setTimerSettings = useWorkoutStore((s) => s.setTimerSettings);
  const { theme, setTheme } = useTheme();

  const handleSetLevel = (l: Level) => {
    setLevel(l);
    syncNow();
  };

  const toggleTimerSetting = (key: keyof typeof timerSettings) => {
    setTimerSettings({ ...timerSettings, [key]: !timerSettings[key] });
  };

  return (
    <div className="max-w-lg mx-auto px-5 pt-5 pb-24">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-[28px] leading-[34px] font-bold tracking-[-0.03em] text-content-primary">Settings</h2>
          <p className="text-[15px] leading-[22px] text-content-muted">Customize your experience</p>
        </div>
        <UserButton />
      </div>

      <div className="space-y-6 anim-stagger">
        {/* Level */}
        <div className="glass-card rounded-card p-4 anim-fade-up" style={{ "--stagger-i": 0 } as CSSProperties}>
          <p className={sectionLabel}>Level</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Difficulty level">
            {([
              { value: "beginner" as Level, label: "Beginner", icon: "🌱" },
              { value: "intermediate" as Level, label: "Intermediate", icon: "🔥" },
              { value: "advanced" as Level, label: "Advanced", icon: "⚡" },
            ]).map((l) => (
              <button key={l.value} onClick={() => handleSetLevel(l.value)}
                role="radio" aria-checked={level === l.value}
                className={`flex-1 h-11 rounded-button text-[13px] leading-[16px] font-medium pressable ${
                  level === l.value
                    ? "bg-accent text-accent-contrast"
                    : "bg-surface-elevated text-content-secondary hover:opacity-80"
                }`}>
                {l.icon} {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div className="glass-card rounded-card p-4 anim-fade-up" style={{ "--stagger-i": 1 } as CSSProperties}>
          <p className={sectionLabel}>Appearance</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Theme">
            {([
              { value: "light" as Theme, label: "Light", icon: "☀️" },
              { value: "dark" as Theme, label: "Dark", icon: "🌙" },
              { value: "system" as Theme, label: "System", icon: "💻" },
            ]).map((t) => (
              <button key={t.value} onClick={() => setTheme(t.value)}
                role="radio" aria-checked={theme === t.value}
                className={`flex-1 h-11 rounded-button text-[13px] leading-[16px] font-medium pressable ${
                  theme === t.value
                    ? "bg-accent text-accent-contrast"
                    : "bg-surface-elevated text-content-secondary hover:opacity-80"
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div className="glass-card rounded-card p-4 anim-fade-up" style={{ "--stagger-i": 2 } as CSSProperties}>
          <PushSetup />
        </div>

        {/* Daily Habits */}
        <div className="glass-card rounded-card p-4 anim-fade-up" style={{ "--stagger-i": 3 } as CSSProperties}>
          <HabitManager syncNow={syncNow} />
        </div>

        {/* Timer */}
        <div className="glass-card rounded-card p-4 anim-fade-up" style={{ "--stagger-i": 4 } as CSSProperties}>
          <p className={sectionLabel}>Timer</p>
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
                    <p className={`text-sm font-semibold ${disabled ? "text-content-muted" : "text-content-primary"}`}>
                      {opt.label}
                    </p>
                    <p className="text-[12px] leading-[16px] font-medium text-content-muted">{opt.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => !disabled && toggleTimerSetting(opt.key)}
                    role="switch"
                    aria-checked={enabled}
                    aria-label={opt.label}
                    disabled={disabled}
                    className={`shrink-0 w-12 h-7 rounded-full transition-colors relative pressable ${
                      enabled && !disabled ? "bg-accent" : "bg-border-active"
                    } ${disabled ? "opacity-40" : ""}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-1 transition-all ${enabled ? "left-6" : "left-1"}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Connected Accounts */}
        <div className="glass-card rounded-card p-4 anim-fade-up" style={{ "--stagger-i": 5 } as CSSProperties}>
          <ConnectedAccounts />
        </div>
      </div>
    </div>
  );
}
