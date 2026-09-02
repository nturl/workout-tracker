// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSync } from "@/hooks/useSync";
import { useWorkoutStore, emptyDirty, seedDefaultHabits } from "@/hooks/useWorkoutStore";

// ---------------------------------------------------------------------------
// S6 item 7 — accepted-risk #2: "the bootstrap push after first hydrate is
// still a full-map push". S1's design (BUG-01) made every OTHER push a delta
// carrying only dirty keys + tombstones; the one-per-load bootstrap push in
// useSync.ts's `!hydrated.current` branch kept sending the whole store via
// getSyncPayload(), unconditionally, even when nothing local was actually
// unpushed. Fixed to send getSyncDelta() and to skip the push entirely when
// nothing is dirty.
// ---------------------------------------------------------------------------

function resetStore() {
  useWorkoutStore.setState({
    completions: {},
    logs: {},
    level: "beginner",
    recoveryData: {},
    habits: {},
    habitDefs: seedDefaultHabits(),
    habitDefsVersion: 0,
    habitDefsDirty: false,
    dirty: emptyDirty(),
    habitFalseBackupV5: {},
    ouraLastSynced: null,
    eightSleepLastSynced: null,
  });
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useSync bootstrap push", () => {
  let postBodies: Array<Record<string, unknown>>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetStore();
    postBodies = [];
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        postBodies.push(JSON.parse(init.body as string));
        return new Response(JSON.stringify({ habitDefs: [], habitDefsVersion: 1 }), { status: 200 });
      }
      // GET — no server data for this account.
      return new Response(JSON.stringify({ data: null }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetStore();
  });

  it("skips the bootstrap push entirely when nothing is dirty", async () => {
    renderHook(() => useSync(true), { wrapper: makeWrapper() });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Give the post-hydrate effect a moment to have fired a push, if it were
    // going to.
    await new Promise((r) => setTimeout(r, 50));

    expect(postBodies).toHaveLength(0);
  });

  it("sends a delta, not a full-map snapshot, when the bootstrap push does fire", async () => {
    // Local, unpushed work predating this load (an offline gym tap).
    useWorkoutStore.getState().toggleCompletion("mon-squat");

    renderHook(() => useSync(true), { wrapper: makeWrapper() });

    await waitFor(() => expect(postBodies.length).toBeGreaterThan(0));

    const body = postBodies[0];
    expect(body.syncMode).toBe("delta");
    expect(body.completions).toEqual({ "mon-squat": true });
    // A full-map bootstrap push (the old behavior) would have sent every
    // top-level field unconditionally, including an explicit `logs`/`recovery`
    // key even when nothing there had changed. The delta omits untouched maps.
    expect(body.logs).toBeUndefined();
    expect(body.recovery).toBeUndefined();
  });
});
