"use client";

import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWorkoutStore } from "./useWorkoutStore";
import type { SyncData, SyncPushResponse } from "@/types/workout";

async function fetchSyncData(): Promise<SyncData | null> {
  const res = await fetch("/api/sync", { cache: "no-store" });
  if (!res.ok) throw new Error("Sync fetch failed");
  const { data } = await res.json();
  return data;
}

/**
 * A failed push, carrying the HTTP status (BUG-20). Without it every non-2xx
 * looked identical: a permanent 400/401 was retried three times like a
 * transient one, and a 429 that told us exactly how long to wait was ignored.
 */
export class SyncPushError extends Error {
  readonly status: number;
  /** Server-supplied Retry-After, in ms, when it sent one. */
  readonly retryAfterMs?: number;

  constructor(status: number, retryAfterMs?: number) {
    super(`Sync push failed (${status})`);
    this.name = "SyncPushError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }

  /** 4xx that will never succeed on retry — 408/429 excluded, they're transient. */
  get isPermanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

async function pushSyncData(payload: SyncData): Promise<SyncPushResponse> {
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new SyncPushError(res.status, parseRetryAfter(res.headers.get("Retry-After")));
  return res.json();
}

/** "delayed" is a transient failure (429/5xx/offline) the hook retries on
 *  its own; "error" is a permanent one that needs a reload or a re-auth. */
export type SyncStatus = "idle" | "syncing" | "error" | "delayed";

export function useSync(enabled: boolean) {
  const hydrateFromSync = useWorkoutStore((s) => s.hydrateFromSync);
  const getSyncDelta = useWorkoutStore((s) => s.getSyncDelta);
  const clearDirty = useWorkoutStore((s) => s.clearDirty);
  const applyHabitDefsAck = useWorkoutStore((s) => s.applyHabitDefsAck);
  const hydrated = useRef(false);
  // Bounds the habitDefs conflict retry (see onSuccess) so two devices editing
  // the habit list at once can't ping-pong rejections indefinitely.
  const defsRetries = useRef(0);
  // debouncedPush is declared below the mutation (it needs pushSync), so
  // onSuccess reaches it through this.
  const debouncedPushRef = useRef<(() => void) | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Initial fetch - 5 min staleness, no window-focus refetch (V14 bandwidth diet)
  const { data: serverData, isSuccess: fetched } = useQuery({
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
  const { mutate: pushSync, isPending: isSyncing, error: syncError } = useMutation({
    mutationFn: pushSyncData,
    // BUG-20: a permanent 4xx (bad payload, signed out, CSRF) will fail
    // identically every time — retrying it three times just delays the error
    // the UI needs to show. Transient statuses keep the old 3-attempt budget.
    retry: (failureCount, error) => {
      if (error instanceof SyncPushError && error.isPermanent) return false;
      return failureCount < 3;
    },
    // Honour the server's own Retry-After (rateLimitResponse sends 60s) instead
    // of hammering it back inside the window we were just told to wait out.
    retryDelay: (attempt, error) => {
      if (error instanceof SyncPushError && error.retryAfterMs !== undefined) {
        return Math.max(error.retryAfterMs, 1000);
      }
      return Math.min(1000 * Math.pow(2, attempt), 10000);
    },
    // Adopt the server's canonical habit list + version so a clock-skewed device
    // can't strand this device's edit, and so a rejected (stale) push converges.
    onSuccess: (res, variables) => {
      applyHabitDefsAck(
        { habitDefs: res?.habitDefs, habitDefsVersion: res?.habitDefsVersion },
        variables.habitDefs ?? [],
      );
      // Everything this push carried is now on the server; anything the user
      // changed while it was in flight stays dirty for the next one.
      clearDirty(variables);
      // BUG-02: a habit-list edit the server REJECTED on a stale CAS base is
      // still dirty here, now rebased onto the canonical version. Re-send it,
      // or the protected edit would simply never land.
      if (useWorkoutStore.getState().habitDefsDirty && defsRetries.current < 3) {
        defsRetries.current += 1;
        debouncedPushRef.current?.();
      } else {
        defsRetries.current = 0;
      }
    },
  });

  // Hydrate store from server data - initial load + subsequent refreshes (e.g. after Oura sync)
  const lastServerUpdate = useRef<number | null>(null);

  // S1 (SHOULD-FIX): `useSync` is a single instance owned by the page and is
  // never remounted across a sign-out/sign-in — only `enabled` flips (false
  // while page.tsx re-points persistence at the new account, true once it
  // settles). Without this reset, `hydrated.current` stayed true forever
  // after the first account, so a second account's `else if` branch below
  // never fires for a brand-new account (serverData === null) and NEITHER
  // the first hydrate NOR the bootstrap push ever runs — while the auto-push
  // subscription (armed on `hydrated.current`) stays open, so the new
  // account starts pushing deltas without ever having read the server.
  // Resetting on the falling edge means the rising edge re-enters the
  // `!hydrated.current` branch exactly like a fresh mount. The query cache
  // entry itself (`["sync-data"]`) is cleared by page.tsx via
  // `queryClient.clear()` before it re-enables sync for the new account, so
  // `fetched`/`serverData` are already guaranteed to be re-fetched.
  useEffect(() => {
    if (!enabled) {
      hydrated.current = false;
      lastServerUpdate.current = null;
    }
  }, [enabled]);

  useEffect(() => {
    // BUG-09: "the GET hasn't resolved yet" and "the GET resolved and this
    // account has nothing stored" are different things. The old `if
    // (!serverData) return;` collapsed them, so a brand-new account never set
    // `hydrated` and the auto-push subscription below stayed shut for the whole
    // mount — their taps only ever synced if they found the manual button.
    if (!fetched) return;
    const serverTs = (serverData as Record<string, unknown> | null)?.updatedAt as number | undefined;

    if (!hydrated.current) {
      // First load: hydrate, then push merged data back through the mutation
      // so any failure shows up in syncStatus (V19: previously swallowed
      // silently).
      //
      // S6 item 7 (was: "the one FULL-map push per load", accepted-risk #2
      // in the pre-ship review): this used to send getSyncPayload() — the
      // whole store, unconditionally — the same last-write-wins hazard S1's
      // delta design (BUG-01) fixed for every push after it. hydrateFromSync
      // above has already settled dirty-wins for every key, so getSyncDelta()
      // now correctly captures exactly the local work the server hasn't seen
      // (offline edits, a fresh install) with no special-casing. When
      // nothing is dirty there is nothing to send, so the push is skipped
      // entirely rather than round-tripping an empty-ish payload. The server
      // (route.ts) still accepts a legacy full-map push (no `syncMode`) from
      // an older cached PWA bundle — nothing on this client needs that path
      // anymore.
      hydrated.current = true;
      lastServerUpdate.current = serverTs ?? null;
      if (serverData) hydrateFromSync(serverData);
      const delta = getSyncDelta();
      const hasDirtyData =
        delta.completions !== undefined ||
        delta.logs !== undefined ||
        delta.recovery !== undefined ||
        delta.habits !== undefined ||
        delta.level !== undefined ||
        delta.tombstones !== undefined ||
        useWorkoutStore.getState().habitDefsDirty;
      if (hasDirtyData) pushSync(delta);
    } else if (serverData && serverTs && serverTs !== lastServerUpdate.current) {
      // Server data changed (e.g. Oura cron/manual sync wrote new data) - re-hydrate
      lastServerUpdate.current = serverTs;
      hydrateFromSync(serverData);
    }
  }, [fetched, serverData, hydrateFromSync, getSyncDelta, pushSync]);

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
      // BUG-01: send only what this device actually changed. Sending the whole
      // store made every push a blind overwrite of keys it had merely read.
      pushSync(getSyncDelta());
    }, 500);
  };
  debouncedPushRef.current = debouncedPush;

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
      habitDefs: useWorkoutStore.getState().habitDefs,
    };
    const unsubscribe = useWorkoutStore.subscribe((state) => {
      if (!hydrated.current) return;
      const changed =
        state.completions !== prev.completions ||
        state.logs !== prev.logs ||
        state.level !== prev.level ||
        state.recoveryData !== prev.recoveryData ||
        state.habits !== prev.habits ||
        state.habitDefs !== prev.habitDefs;
      if (!changed) return;
      prev = {
        completions: state.completions,
        logs: state.logs,
        level: state.level,
        recoveryData: state.recoveryData,
        habits: state.habits,
        habitDefs: state.habitDefs,
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

  // BUG-20: a rate limit or a server blip is not the same failure as a rejected
  // payload or a signed-out session — the first clears itself, the second needs
  // the user to do something.
  const syncStatus: SyncStatus = syncError
    ? syncError instanceof SyncPushError && !syncError.isPermanent
      ? "delayed"
      : "error"
    : isSyncing
      ? "syncing"
      : "idle";

  return { syncNow, syncStatus };
}
