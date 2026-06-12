"use client";

import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWorkoutStore } from "./useWorkoutStore";
import type { SyncData } from "@/types/workout";

async function fetchSyncData(): Promise<SyncData | null> {
  const res = await fetch("/api/sync", { cache: "no-store" });
  if (!res.ok) throw new Error("Sync fetch failed");
  const { data } = await res.json();
  return data;
}

async function pushSyncData(payload: SyncData): Promise<void> {
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Sync push failed");
}

export function useSync(enabled: boolean) {
  const hydrateFromSync = useWorkoutStore((s) => s.hydrateFromSync);
  const getSyncPayload = useWorkoutStore((s) => s.getSyncPayload);
  const hydrated = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Initial fetch - 5 min staleness, no window-focus refetch (V14 bandwidth diet)
  const { data: serverData } = useQuery({
    queryKey: ["sync-data"],
    queryFn: fetchSyncData,
    enabled,
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Push mutation with retry
  // V14: don't invalidate on success - trust local store, avoid redundant GET after every POST
  // V19: declared above the hydrate effect so the initial post-hydrate push can
  // route through the mutation and surface failures via syncStatus.
  const { mutate: pushSync, isPending: isSyncing, isError: syncError } = useMutation({
    mutationFn: pushSyncData,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 10000),
  });

  // Hydrate store from server data - initial load + subsequent refreshes (e.g. after Oura sync)
  const lastServerUpdate = useRef<number | null>(null);
  useEffect(() => {
    if (!serverData) return;
    const serverTs = (serverData as Record<string, unknown>).updatedAt as number | undefined;

    if (!hydrated.current) {
      // First load: hydrate and push merged data back through the mutation so
      // any failure shows up in syncStatus (V19: previously swallowed silently).
      hydrated.current = true;
      lastServerUpdate.current = serverTs ?? null;
      hydrateFromSync(serverData);
      pushSync(getSyncPayload());
    } else if (serverTs && serverTs !== lastServerUpdate.current) {
      // Server data changed (e.g. Oura cron/manual sync wrote new data) - re-hydrate
      lastServerUpdate.current = serverTs;
      hydrateFromSync(serverData);
    }
  }, [serverData, hydrateFromSync, getSyncPayload, pushSync]);

  // Debounced sync on store changes
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingSync = useRef(false);

  const debouncedPush = () => {
    if (!enabledRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      pendingSync.current = true;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // V19: dropped from 3000ms to 500ms so gym taps survive an early app
    // suspend on iOS. Short enough that a burst of rapid toggles still coalesces.
    debounceRef.current = setTimeout(() => {
      const payload = getSyncPayload();
      pushSync(payload);
    }, 500);
  };

  // Auto-sync: subscribe to Zustand store changes and only push on
  // workout-data changes (completions, logs, level, recoveryData).
  // Ignores UI-only state (selectedDay, mounted, theme, notifSettings).
  useEffect(() => {
    if (!enabled) return;
    let prev = {
      completions: useWorkoutStore.getState().completions,
      logs: useWorkoutStore.getState().logs,
      level: useWorkoutStore.getState().level,
      recoveryData: useWorkoutStore.getState().recoveryData,
      habits: useWorkoutStore.getState().habits,
    };
    const unsubscribe = useWorkoutStore.subscribe((state) => {
      if (!hydrated.current) return;
      const changed =
        state.completions !== prev.completions ||
        state.logs !== prev.logs ||
        state.level !== prev.level ||
        state.recoveryData !== prev.recoveryData ||
        state.habits !== prev.habits;
      if (!changed) return;
      prev = {
        completions: state.completions,
        logs: state.logs,
        level: state.level,
        recoveryData: state.recoveryData,
        habits: state.habits,
      };
      debouncedPush();
    });
    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Flush pending sync when coming back online
  useEffect(() => {
    const handleOnline = () => {
      if (pendingSync.current) {
        pendingSync.current = false;
        debouncedPush();
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncNow = () => {
    debouncedPush();
  };

  const syncStatus: "idle" | "syncing" | "error" = syncError ? "error" : isSyncing ? "syncing" : "idle";

  return { syncNow, syncStatus };
}
