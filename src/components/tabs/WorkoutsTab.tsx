"use client";

import { useMemo, useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { weeklyPlan, type WorkoutSession } from "@/lib/workoutData";
import { weekKey, weekKeyForOffset, sessionKey, getTodayDayName, getWeekProgress, calculateStreak, getBestStreak, calculateDailyHabitStreak, getBestDailyHabitStreak, getLastNDays, todayKey, isSessionScheduled } from "@/lib/helpers";
import { useWorkoutStore } from "@/hooks/useWorkoutStore";
import { HABITS } from "@/lib/habits";
import { SyncIndicator } from "@/components/ui/SyncIndicator";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer } from "@/lib/motion";
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

interface WorkoutsTabProps {
  syncStatus: "idle" | "syncing" | "error";
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
  const toggleHabit = useWorkoutStore((s) => s.toggleHabit);

  const [logModal, setLogModal] = useState<{ session: WorkoutSession; key: string } | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedHabit, setExpandedHabit] = useState<string | null>(null);

  const wk = weekOffset === 0 ? weekKey(new Date()) : weekKeyForOffset(weekOffset);
  const todayName = getTodayDayName();
  const isCurrentWeek = weekOffset === 0;
  const streak = useMemo(() => mounted ? calculateStreak(completions) : 0, [mounted, completions]);
  const bestStreak = useMemo(() => mounted ? getBestStreak(completions) : 0, [mounted, completions]);
  const today = todayKey();
  const habits = useMemo(() => {
    if (!mounted) return [];
    const last7 = getLastNDays(7);
    return HABITS.map(({ id, label }) => {
      const map = habitData[id] || {};
      return {
        key: id,
        label,
        doneToday: !!map[today],
        streak: calculateDailyHabitStreak(map),
        bestStreak: getBestDailyHabitStreak(map),
        recentDays: last7.map((d) => ({ ...d, logged: !!map[d.key] })),
        toggle: (date: string) => toggleHabit(id, date),
      };
    });
  }, [mounted, today, habitData, toggleHabit]);
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
              <h1 className="text-[26px] font-display font-bold gradient-text leading-none">Boundless</h1>
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
                  <div className="mt-3 rounded-2xl p-4 flex items-center justify-between" style={{ background: "var(--bg-card)" }}>
                    <div>
                      <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Connect Oura Ring</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Auto-sync recovery data</p>
                    </div>
                    <a href="/api/oauth/oura/authorize" className="px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105"
                      style={{ background: "var(--accent)", color: "#fff" }}>
                      Connect
                    </a>
                  </div>
                )}
              </div>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={selectedDay}
                className="space-y-5"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {activePlan.sessions.filter((s) => isSessionScheduled(s, wk)).map((session, si) => {
                  const key = sessionKey(wk, activePlan.day, session);
                  return (
                    <SessionCard key={si} session={session} level={level} completed={!!completions[key]}
                      onToggle={() => handleToggle(activePlan.day, session)} logKey={key} logs={logs}
                      onOpenLog={() => setLogModal({ session, key })} onSaveLog={handleSaveLog} showTimer={true} />
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </>
        )}

        <div className="mt-8">
          <h3 className="text-xs font-display font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Daily Habits</h3>
          <div className="space-y-1.5">
            {habits.map((h) => (
              <HabitCard
                key={h.key}
                label={h.label}
                doneToday={h.doneToday}
                streak={h.streak}
                bestStreak={h.bestStreak}
                expanded={expandedHabit === h.key}
                recentDays={h.recentDays}
                onToggleToday={() => {
                  h.toggle(today);
                  syncNow();
                }}
                onToggleDate={(date) => {
                  h.toggle(date);
                  syncNow();
                }}
                onExpandToggle={() => setExpandedHabit(expandedHabit === h.key ? null : h.key)}
              />
            ))}
          </div>
        </div>

        <div className="mt-8">
          <h3 className="text-xs font-display font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>8-Week Momentum</h3>
          <div className="glass-card rounded-2xl p-5">
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
