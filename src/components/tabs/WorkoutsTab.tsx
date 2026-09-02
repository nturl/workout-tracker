"use client";

import { useMemo, useCallback, useEffect, useState, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { weeklyPlan, type WorkoutSession } from "@/lib/workoutData";
import { weekKey, weekKeyForOffset, sessionKey, getTodayDayName, getWeekProgress, calculateStreak, getBestStreak, calculateDailyHabitStreak, getBestDailyHabitStreak, getLastNDays, todayKey, isSessionScheduled } from "@/lib/helpers";
import { useWorkoutStore } from "@/hooks/useWorkoutStore";
import { useTodayKey } from "@/hooks/useTodayKey";
import { SyncIndicator } from "@/components/ui/SyncIndicator";
import { Icon } from "@/components/ui/Icon";
import { SessionCard } from "@/components/dashboard/SessionCard";
import { ProgrammingNotes } from "@/components/dashboard/ProgrammingNotes";
import { LogModal } from "@/components/tracking/LogModal";
import { StreakCounter } from "@/components/progress/StreakCounter";
import { HabitCard } from "@/components/progress/HabitCard";
import { WeekRhythm } from "@/components/progress/WeekRhythm";
import { MomentumChart } from "@/components/progress/MomentumChart";
import { RecoveryBanner } from "@/components/recovery/RecoveryBanner";
import { SunBanner } from "@/components/dashboard/SunBanner";
import { useOuraStatus } from "@/hooks/useConnectedAccounts";
import { notifySessionComplete, notifyWeekComplete, maybeNotifyStreakMilestone } from "@/lib/pushNotify";
import type { SyncStatus } from "@/hooks/useSync";

// Same cap the Settings habit editor (HabitManager) enforces — the store
// itself doesn't reject over-limit adds, so both UIs guard it client-side.
const MAX_HABITS = 30;

interface WorkoutsTabProps {
  syncStatus: SyncStatus;
  syncNow: () => void;
  onOpenRecovery: () => void;
}

export function WorkoutsTab({ syncStatus, syncNow, onOpenRecovery }: WorkoutsTabProps) {
  const { user } = useUser();
  const completions = useWorkoutStore((s) => s.completions);
  const logs = useWorkoutStore((s) => s.logs);
  const level = useWorkoutStore((s) => s.level);
  const recoveryData = useWorkoutStore((s) => s.recoveryData);
  const selectedDay = useWorkoutStore((s) => s.selectedDay);
  const mounted = useWorkoutStore((s) => s.mounted);
  const toggleCompletion = useWorkoutStore((s) => s.toggleCompletion);
  const saveLog = useWorkoutStore((s) => s.saveLog);
  const setSelectedDay = useWorkoutStore((s) => s.setSelectedDay);
  const habitData = useWorkoutStore((s) => s.habits);
  const habitDefs = useWorkoutStore((s) => s.habitDefs);
  const setHabit = useWorkoutStore((s) => s.setHabit);
  const clearHabit = useWorkoutStore((s) => s.clearHabit);
  const addHabit = useWorkoutStore((s) => s.addHabit);
  const renameHabit = useWorkoutStore((s) => s.renameHabit);
  const removeHabit = useWorkoutStore((s) => s.removeHabit);
  const moveHabit = useWorkoutStore((s) => s.moveHabit);

  const [logModal, setLogModal] = useState<{ session: WorkoutSession; key: string } | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedHabit, setExpandedHabit] = useState<string | null>(null);

  // Flagship inline habit customization (mirrors HabitManager's store-action
  // pattern: mutate the store, then syncNow — no duplicated habit state).
  const [habitsEditMode, setHabitsEditMode] = useState(false);
  const [addingHabit, setAddingHabit] = useState(false);
  const [newHabitLabel, setNewHabitLabel] = useState("");
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [draftHabitLabel, setDraftHabitLabel] = useState("");
  const [confirmDeleteHabitId, setConfirmDeleteHabitId] = useState<string | null>(null);
  const addHabitInputRef = useRef<HTMLInputElement>(null);
  const atHabitLimit = habitDefs.length >= MAX_HABITS;
  const canDeleteHabit = habitDefs.length > 1;

  const startAddHabit = () => {
    setAddingHabit(true);
    setNewHabitLabel("");
  };

  const commitAddHabit = () => {
    const trimmed = newHabitLabel.trim();
    if (!trimmed || atHabitLimit) return;
    addHabit(trimmed);
    syncNow();
    setNewHabitLabel("");
    setAddingHabit(false);
  };

  const startRenameHabit = (id: string, label: string) => {
    // BUG-15: commit any in-progress, uncommitted rename before switching
    // the edit target — otherwise the typed draft is silently discarded.
    if (editingHabitId && editingHabitId !== id) {
      const trimmed = draftHabitLabel.trim();
      if (trimmed) {
        renameHabit(editingHabitId, trimmed);
        syncNow();
      }
    }
    setConfirmDeleteHabitId(null);
    setEditingHabitId(id);
    setDraftHabitLabel(label);
  };

  const commitRenameHabit = () => {
    if (!editingHabitId) return;
    const trimmed = draftHabitLabel.trim();
    if (trimmed) {
      renameHabit(editingHabitId, trimmed);
      syncNow();
    }
    setEditingHabitId(null);
    setDraftHabitLabel("");
  };

  const cancelRenameHabit = () => {
    setEditingHabitId(null);
    setDraftHabitLabel("");
  };

  const confirmDeleteHabit = (id: string) => {
    removeHabit(id);
    syncNow();
    setConfirmDeleteHabitId(null);
  };

  const moveHabitAndSync = (id: string, direction: "up" | "down") => {
    moveHabit(id, direction);
    syncNow();
  };

  const wk = weekOffset === 0 ? weekKey(new Date()) : weekKeyForOffset(weekOffset);
  const todayName = getTodayDayName();
  const isCurrentWeek = weekOffset === 0;
  const streak = useMemo(() => mounted ? calculateStreak(completions) : 0, [mounted, completions]);
  const bestStreak = useMemo(() => mounted ? getBestStreak(completions) : 0, [mounted, completions]);
  // BUG-30: reactive, unlike a bare todayKey() call — see useTodayKey.ts.
  const today = useTodayKey();

  // BUG-30: when the day actually rolls over, advance selectedDay along with
  // it — but only if the user hadn't manually picked a different day. Read
  // selectedDay from the store directly (not the reactive `selectedDay`
  // above) so this effect only fires on a real day change, not on every
  // manual day tap.
  const prevTodayNameRef = useRef(todayName);
  useEffect(() => {
    const prevDayName = prevTodayNameRef.current;
    prevTodayNameRef.current = todayName;
    if (todayName === prevDayName) return;
    if (useWorkoutStore.getState().selectedDay === prevDayName) {
      setSelectedDay(todayName);
    }
  }, [todayName, setSelectedDay]);

  const habits = useMemo(() => {
    if (!mounted) return [];
    const last7 = getLastNDays(7);
    return habitDefs.map(({ id, label }) => {
      const map = habitData[id] || {};
      return {
        key: id,
        label,
        statusToday: map[today],
        streak: calculateDailyHabitStreak(map),
        bestStreak: getBestDailyHabitStreak(map),
        recentDays: last7.map((d) => ({ ...d, logged: map[d.key] })),
        // BUG-14: history cells cycle unrecorded -> done -> missed ->
        // unrecorded, instead of a plain boolean toggle that can never
        // return to unrecorded.
        cycleDate: (date: string) => {
          const current = map[date];
          if (current === undefined) setHabit(id, date, true);
          else if (current === true) setHabit(id, date, false);
          else clearHabit(id, date);
        },
        setToday: (done: boolean) => setHabit(id, today, done),
        // BUG-14: a mistaken tap on today's active check/X is reversible.
        clearToday: () => clearHabit(id, today),
      };
    });
  }, [mounted, today, habitData, setHabit, clearHabit, habitDefs]);
  const { total: weekTotal, done: weekDone } = useMemo(() => getWeekProgress(completions, wk), [completions, wk]);
  const ouraStatus = useOuraStatus();

  useEffect(() => {
    if (!mounted || weekTotal === 0) return;
    if (weekDone === weekTotal) {
      const markerKey = `workout-push-week-${wk}`;
      try {
        if (localStorage.getItem(markerKey)) return;
        localStorage.setItem(markerKey, "1");
      } catch {}
      notifyWeekComplete(wk);
    }
  }, [mounted, weekDone, weekTotal, wk]);

  useEffect(() => {
    if (!mounted || streak === 0) return;
    maybeNotifyStreakMilestone(streak);
  }, [mounted, streak]);

  useEffect(() => {
    if (addingHabit) addHabitInputRef.current?.focus();
  }, [addingHabit]);

  const activePlan = weeklyPlan.find((d) => d.day === selectedDay);

  const handleToggle = useCallback((dayName: string, session: WorkoutSession) => {
    const key = sessionKey(wk, dayName, session);
    const wasCompleted = !!completions[key];
    toggleCompletion(key);
    syncNow();
    if (!wasCompleted) notifySessionComplete(session.title);
  }, [wk, toggleCompletion, syncNow, completions]);

  const handleSaveLog = useCallback((key: string, data: Parameters<typeof saveLog>[1]) => {
    saveLog(key, data);
    syncNow();
  }, [saveLog, syncNow]);

  return (
    <>
      <header className="glass sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-5 pt-6 pb-5">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h1 className="text-[26px] font-display font-bold gradient-text leading-none">Workouts</h1>
              <div className="flex items-center gap-2 mt-1.5">
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  {user?.firstName ? `Hey, ${user.firstName}` : "Your workouts"}
                </p>
                <SyncIndicator status={syncStatus} />
              </div>
            </div>
          </div>

          <div className="mb-5">
            <StreakCounter streak={streak} weekDone={weekDone} weekTotal={weekTotal} bestStreak={bestStreak} />
          </div>

          <WeekRhythm selectedDay={selectedDay} onSelectDay={setSelectedDay} weekOffset={weekOffset} onChangeWeek={setWeekOffset} />
        </div>
      </header>

      <div className="max-w-lg mx-auto px-5 mt-5 pb-24">
        {activePlan && (
          <>
            <div className="mb-5">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-display font-bold" style={{ color: "var(--text-primary)" }}>{activePlan.day}</h2>
                {isCurrentWeek && selectedDay === todayName && (
                  <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
                )}
                <span className="ml-auto text-xs font-semibold tracking-wide" style={{ color: "var(--text-muted)" }}>{activePlan.theme}</span>
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{activePlan.focus}</p>
              {activePlan.programmingNotes && <ProgrammingNotes notes={activePlan.programmingNotes} />}
            </div>

            {isCurrentWeek && selectedDay === todayName && (
              <div className="mb-4 space-y-3">
                <SunBanner />
                <RecoveryBanner data={recoveryData} onClick={onOpenRecovery} />
                {!ouraStatus.isLoading && !ouraStatus.data?.connected && !recoveryData[todayKey()]?.oura?.readinessScore && (
                  <div className="glass-card mt-3 rounded-card p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Connect Oura Ring</p>
                      <p className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>Auto-sync recovery data</p>
                    </div>
                    <a href="/api/oauth/oura/authorize" className="pressable px-4 py-2 rounded-full text-[13px] font-semibold"
                      style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}>
                      Connect
                    </a>
                  </div>
                )}
              </div>
            )}

            <div key={selectedDay} className="anim-stagger space-y-5">
              {activePlan.sessions.filter((s) => isSessionScheduled(s, wk)).map((session, si) => {
                const key = sessionKey(wk, activePlan.day, session);
                return (
                  <div key={key} className="anim-fade-up" style={{ "--stagger-i": si } as React.CSSProperties}>
                    <SessionCard session={session} level={level} completed={!!completions[key]}
                      onToggle={() => handleToggle(activePlan.day, session)} logKey={key} logs={logs}
                      onOpenLog={() => setLogModal({ session, key })} onSaveLog={handleSaveLog} showTimer={true} />
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-8">
          <div className="flex items-center mb-3">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-secondary)" }}>Daily Habits</h3>
            <button
              type="button"
              onClick={() => {
                // BUG-15: commit any in-progress, uncommitted rename before
                // leaving edit mode — otherwise the typed draft is silently
                // discarded.
                if (habitsEditMode && editingHabitId) {
                  const trimmed = draftHabitLabel.trim();
                  if (trimmed) {
                    renameHabit(editingHabitId, trimmed);
                    syncNow();
                  }
                }
                setHabitsEditMode((v) => !v);
                setConfirmDeleteHabitId(null);
                setEditingHabitId(null);
                setDraftHabitLabel("");
              }}
              className="pressable ml-auto text-[13px] font-semibold"
              style={{ color: "var(--accent)" }}
            >
              {habitsEditMode ? "Done" : "Edit"}
            </button>
          </div>
          <div className="space-y-1.5 anim-stagger">
            {habits.map((h, i) =>
              habitsEditMode ? (
                <div
                  key={h.key}
                  className="anim-fade-up glass-card flex items-center gap-2 rounded-card px-3 py-2"
                  style={{ "--stagger-i": i } as React.CSSProperties}
                >
                  <div className="flex flex-col -my-1">
                    <button
                      type="button"
                      onClick={() => moveHabitAndSync(h.key, "up")}
                      disabled={i === 0}
                      aria-label={`Move ${h.label} up`}
                      className="pressable w-6 h-4 flex items-center justify-center disabled:opacity-20"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <Icon name="arrow-up" size={13} strokeWidth={2.4} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveHabitAndSync(h.key, "down")}
                      disabled={i === habits.length - 1}
                      aria-label={`Move ${h.label} down`}
                      className="pressable w-6 h-4 flex items-center justify-center disabled:opacity-20"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <Icon name="arrow-down" size={13} strokeWidth={2.4} />
                    </button>
                  </div>

                  {editingHabitId === h.key ? (
                    <input
                      autoFocus
                      value={draftHabitLabel}
                      onChange={(e) => setDraftHabitLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRenameHabit();
                        if (e.key === "Escape") cancelRenameHabit();
                      }}
                      onBlur={() => {
                        // BUG-15: commit a non-empty draft on blur instead of
                        // silently discarding it (Escape still cancels).
                        if (!editingHabitId) return;
                        const trimmed = draftHabitLabel.trim();
                        if (trimmed) {
                          renameHabit(editingHabitId, trimmed);
                          syncNow();
                        }
                        setEditingHabitId(null);
                        setDraftHabitLabel("");
                      }}
                      maxLength={100}
                      aria-label="Habit name"
                      className="input-field flex-1 min-w-0 bg-transparent text-[15px] font-medium outline-none border-b"
                      style={{ color: "var(--text-primary)", borderColor: "var(--accent)" }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startRenameHabit(h.key, h.label)}
                      aria-label={`Rename ${h.label}`}
                      className="flex-1 min-w-0 text-left truncate text-[15px] font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {h.label}
                    </button>
                  )}

                  {editingHabitId === h.key ? (
                    <>
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={commitRenameHabit} aria-label="Save name"
                        className="pressable shrink-0 w-8 h-8 rounded-button flex items-center justify-center"
                        style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}>
                        <Icon name="check" size={15} strokeWidth={2.6} />
                      </button>
                      {/* B3: a plain mousedown blurs the input BEFORE this
                          button's click lands; the onBlur handler above
                          commits any non-empty draft, the row re-renders
                          without editingHabitId === h.key, and this whole
                          branch unmounts before the click can ever fire
                          cancelRenameHabit — so "Cancel" silently saved
                          instead. preventDefault on mousedown keeps focus on
                          the input (no blur), so the click reaches this
                          button and actually cancels. */}
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancelRenameHabit} aria-label="Cancel"
                        className="pressable shrink-0 w-8 h-8 rounded-button flex items-center justify-center"
                        style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                        <Icon name="close" size={14} strokeWidth={2.4} />
                      </button>
                    </>
                  ) : confirmDeleteHabitId === h.key ? (
                    <>
                      <button type="button" onClick={() => confirmDeleteHabit(h.key)} aria-label={`Confirm remove ${h.label}`}
                        onKeyDown={(e) => { if (e.key === "Escape") setConfirmDeleteHabitId(null); }}
                        className="pressable shrink-0 h-8 px-3 rounded-button text-[13px] font-semibold"
                        style={{ background: "var(--danger)", color: "#fff" }}>
                        Remove
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteHabitId(null)} aria-label="Cancel"
                        className="pressable shrink-0 w-8 h-8 rounded-button flex items-center justify-center"
                        style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                        <Icon name="close" size={14} strokeWidth={2.4} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteHabitId(h.key)}
                      disabled={!canDeleteHabit}
                      aria-label={canDeleteHabit ? `Remove ${h.label}` : "Keep at least one habit"}
                      title={canDeleteHabit ? undefined : "Keep at least one habit"}
                      className="pressable shrink-0 w-8 h-8 rounded-button flex items-center justify-center disabled:opacity-30"
                      style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
                    >
                      <Icon name="trash" size={14} strokeWidth={2.2} />
                    </button>
                  )}
                </div>
              ) : (
                <div key={h.key} className="anim-fade-up" style={{ "--stagger-i": i } as React.CSSProperties}>
                  <HabitCard
                    label={h.label}
                    statusToday={h.statusToday}
                    streak={h.streak}
                    bestStreak={h.bestStreak}
                    expanded={expandedHabit === h.key}
                    recentDays={h.recentDays}
                    onSetToday={(done) => {
                      h.setToday(done);
                      syncNow();
                    }}
                    onClearToday={() => {
                      h.clearToday();
                      syncNow();
                    }}
                    onCycleDate={(date) => {
                      h.cycleDate(date);
                      syncNow();
                    }}
                    onExpandToggle={() => setExpandedHabit(expandedHabit === h.key ? null : h.key)}
                  />
                </div>
              )
            )}

            {/* Persistent add-habit ghost row — one tap reveals the inline input. */}
            {addingHabit ? (
              <div className="glass-card flex items-center gap-2 rounded-card px-3 py-2">
                <input
                  ref={addHabitInputRef}
                  value={newHabitLabel}
                  onChange={(e) => setNewHabitLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitAddHabit();
                    if (e.key === "Escape") { setAddingHabit(false); setNewHabitLabel(""); }
                  }}
                  onBlur={() => { if (!newHabitLabel.trim()) setAddingHabit(false); }}
                  placeholder={atHabitLimit ? "Habit limit reached" : "New habit…"}
                  disabled={atHabitLimit}
                  maxLength={100}
                  aria-label="New habit name"
                  className="input-field flex-1 min-w-0 bg-transparent text-[15px] font-medium outline-none disabled:opacity-50"
                  style={{ color: "var(--text-primary)" }}
                />
                <button
                  type="button"
                  onClick={commitAddHabit}
                  disabled={!newHabitLabel.trim() || atHabitLimit}
                  aria-label="Add habit"
                  className="pressable shrink-0 w-8 h-8 rounded-button flex items-center justify-center disabled:opacity-30"
                  style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
                >
                  <Icon name="check" size={15} strokeWidth={2.6} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startAddHabit}
                disabled={atHabitLimit}
                aria-label="Add habit"
                className="pressable w-full flex items-center gap-2 rounded-card px-3 py-2.5 text-[13px] font-semibold disabled:opacity-40"
                style={{ color: "var(--text-muted)" }}
              >
                <Icon name="plus" size={14} strokeWidth={2.6} />
                {atHabitLimit ? "Habit limit reached" : "Add habit"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-8">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] mb-3" style={{ color: "var(--text-secondary)" }}>8-Week Momentum</h3>
          <div className="glass-card rounded-card p-5">
            <MomentumChart completions={completions} />
          </div>
        </div>
      </div>

      {logModal && (
        <LogModal session={logModal.session} logKey={logModal.key} logs={logs} level={level}
          onSave={handleSaveLog} onClose={() => setLogModal(null)} />
      )}
    </>
  );
}
