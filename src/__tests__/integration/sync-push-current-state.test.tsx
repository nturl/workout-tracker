// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSync } from "@/hooks/useSync";
import { useWorkoutStore, emptyDirty, seedDefaultHabits } from "@/hooks/useWorkoutStore";

// A push builds its delta when each attempt is sent, so a TanStack retry
// carries what is dirty now, not the snapshot taken when the push was queued.

function resetStore() {
  useWorkoutStore.setState({
    completions: {}, logs: {}, level: "beginner", recoveryData: {}, habits: {},
    habitDefs: seedDefaultHabits(), habitDefsVersion: 0, habitDefsDirty: false,
    dirty: emptyDirty(), habitFalseBackupV5: {}, ouraLastSynced: null, eightSleepLastSynced: null,
  });
}

describe("useSync push payload", () => {
  const posts: Array<{ body: Record<string, unknown>; keepalive?: boolean }> = [];
  let gets = 0;
  let failFirstPost = false;

  beforeEach(() => {
    resetStore();
    posts.length = 0;
    gets = 0;
    failFirstPost = false;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push({ body: JSON.parse(init.body as string), keepalive: init.keepalive });
        if (failFirstPost && posts.length === 1) return new Response("{}", { status: 500 });
        return new Response(JSON.stringify({ habitDefs: [], habitDefsVersion: 1 }), { status: 200 });
      }
      gets += 1;
      return new Response(JSON.stringify({ data: null }), { status: 200 });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetStore();
  });

  function setup() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => useSync(true), { wrapper });
  }

  it("a retried push sends the current dirty state, not the snapshot from when it was queued", async () => {
    failFirstPost = true;
    const hook = setup();
    await waitFor(() => expect(gets).toBe(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    act(() => { useWorkoutStore.getState().toggleCompletion("set-a"); });
    await waitFor(() => expect(posts.length).toBe(1), { timeout: 2000 });
    expect(Object.keys(posts[0].body.completions as object)).toEqual(["set-a"]);

    // While the failed push waits out its retry delay, the user taps again.
    act(() => { useWorkoutStore.getState().toggleCompletion("set-b"); });

    await waitFor(() => expect(posts.length).toBeGreaterThanOrEqual(2), { timeout: 4000 });
    expect(Object.keys(posts[1].body.completions as object).sort()).toEqual(["set-a", "set-b"]);
    hook.unmount();
  });

  it("sends the push with keepalive so the pagehide flush survives suspension", async () => {
    setup();
    await waitFor(() => expect(gets).toBe(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    act(() => { useWorkoutStore.getState().toggleCompletion("set-a"); });
    await waitFor(() => expect(posts.length).toBe(1), { timeout: 2000 });
    expect(posts[0].keepalive).toBe(true);
  });
});
