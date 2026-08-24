"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { useWorkoutStore } from "@/hooks/useWorkoutStore";
import { useSync } from "@/hooks/useSync";
import { todayKey } from "@/lib/helpers";
import { useOuraStatus, useOuraSync } from "@/hooks/useConnectedAccounts";
import { LandingPage } from "@/components/layout/LandingPage";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { InstallBanner } from "@/components/ui/InstallBanner";
import { LiveRegionProvider } from "@/components/ui/LiveRegion";
import { BottomNav, type TabId } from "@/components/layout/BottomNav";
import { Icon } from "@/components/ui/Icon";
import { WorkoutsTab } from "@/components/tabs/WorkoutsTab";

const LabsTab = lazy(() => import("@/components/labs/LabsTab").then((m) => ({ default: m.LabsTab })));
const RecoveryTab = lazy(() => import("@/components/tabs/RecoveryTab").then((m) => ({ default: m.RecoveryTab })));
const SettingsTab = lazy(() => import("@/components/tabs/SettingsTab").then((m) => ({ default: m.SettingsTab })));
const ChatSheet = lazy(() => import("@/components/chat/ChatSheet").then((m) => ({ default: m.ChatSheet })));

export default function Home() {
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { user, isLoaded: clerkLoaded } = useUser();

  const recoveryData = useWorkoutStore((s) => s.recoveryData);
  const mounted = useWorkoutStore((s) => s.mounted);
  const setMounted = useWorkoutStore((s) => s.setMounted);
  const mergeRecoveryData = useWorkoutStore((s) => s.mergeRecoveryData);

  const { syncNow, syncStatus } = useSync(!!isSignedIn && clerkLoaded);

  const [activeTab, setActiveTab] = useState<TabId>("workouts");
  const [chatState, setChatState] = useState<{ open: boolean; context?: import("@/components/chat/ChatSheet").ChatContext | null }>({ open: false });

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  // Init
  useEffect(() => {
    if (clerkLoaded && user) {
      setMounted(true);
      fetch(`/api/recovery?date=${todayKey()}`)
        .then((r) => r.json())
        .then((result) => {
          if (result.data?.eightSleep?.autoImported) {
            const today = todayKey();
            mergeRecoveryData({
              [today]: {
                ...recoveryData[today],
                date: today,
                eightSleep: { ...(recoveryData[today]?.eightSleep || {}), ...result.data.eightSleep },
              },
            });
          }
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkLoaded, user]);

  // Auto-sync Oura
  const ouraStatus = useOuraStatus();
  const ouraSync = useOuraSync();
  useEffect(() => {
    if (!mounted || !ouraStatus.data?.connected) return;
    const today = todayKey();
    const ouraData = recoveryData[today]?.oura;
    if (ouraData?.hrv && ouraData?.totalSleep) return;
    ouraSync.mutate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, ouraStatus.data?.connected]);

  // Auth gate
  if (authLoaded && !isSignedIn) return <LandingPage />;
  if (!mounted) return <DashboardSkeleton />;

  return (
    <LiveRegionProvider>
      <main className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
        <OfflineBanner />

        {/* WorkoutsTab stays mounted across tab switches so a running
            CircuitTimer/RepTimer survives a peek at Recovery or Settings
            mid-workout. The lazy tabs below stay conditional. */}
        <div style={{ display: activeTab === "workouts" ? undefined : "none" }}>
          <WorkoutsTab
            syncStatus={syncStatus}
            syncNow={syncNow}
            onOpenRecovery={() => setActiveTab("recovery")}
          />
        </div>

        {activeTab === "labs" && (
          <Suspense fallback={<TabSkeleton />}>
            <LabsTab onAskAI={(context) => setChatState({ open: true, context })} />
          </Suspense>
        )}

        {activeTab === "recovery" && (
          <Suspense fallback={<TabSkeleton />}>
            <RecoveryTab />
          </Suspense>
        )}

        {activeTab === "settings" && (
          <Suspense fallback={<TabSkeleton />}>
            <SettingsTab />
          </Suspense>
        )}

        <InstallBanner />

        {/* Floating chat button */}
        <button
          onClick={() => setChatState({ open: true })}
          className="fixed z-40 w-12 h-12 rounded-full flex items-center justify-center pressable"
          style={{
            background: "linear-gradient(135deg, var(--accent), var(--accent-light))",
            color: "var(--accent-contrast)",
            bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))",
            right: "1.25rem",
            boxShadow: "0 4px 16px var(--accent-glow), var(--shadow-md)",
          }}
          aria-label="Open chat"
        >
          <Icon name="chat" size={21} strokeWidth={2.1} />
        </button>

        <Suspense>
          {chatState.open && (
            <ChatSheet
              open={chatState.open}
              onClose={() => setChatState({ open: false })}
              initialContext={chatState.context}
            />
          )}
        </Suspense>

        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </main>
    </LiveRegionProvider>
  );
}

function TabSkeleton() {
  return (
    <div className="max-w-lg mx-auto px-5 pt-8 space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 rounded-card animate-pulse bg-surface-elevated" />
      ))}
    </div>
  );
}
