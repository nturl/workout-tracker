// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSync } from "@/hooks/useSync";
import { useWorkoutStore, emptyDirty, seedDefaultHabits } from "@/hooks/useWorkoutStore";

// Audit SYNC-1 / F9: the 500ms debounced push must not be lost when the page
// is hidden or closed, must not fire after unmount, and a tab coming back to
// the foreground must refetch once the data is older than the stale time.

function resetStore() {
  useWorkoutStore.setState({
    completions: {}, logs: {}, level: "beginner", recoveryData: {}, habits: {},
    habitDefs: seedDefaultHabits(), habitDefsVersion: 0, habitDefsDirty: false,
    dirty: emptyDirty(), habitFalseBackupV5: {}, ouraLastSynced: null, eightSleepLastSynced: null,
  });
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSync(true), { wrapper });
}

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useSync page lifecycle", () => {
  let posts: number;
  let gets: number;

  beforeEach(() => {
    resetStore();
    posts = 0;
    gets = 0;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts += 1;
        return new Response(JSON.stringify({ habitDefs: [], habitDefsVersion: 1 }), { status: 200 });
      }
      gets += 1;
      return new Response(JSON.stringify({ data: null }), { status: 200 });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setVisibility("visible");
    resetStore();
  });

  async function hydrated() {
    const hook = setup();
    await waitFor(() => expect(gets).toBe(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    return hook;
  }

  it("flushes the pending push immediately when the page is hidden", async () => {
    await hydrated();
    act(() => { useWorkoutStore.getState().toggleCompletion("set-a"); });
    expect(posts).toBe(0);
    act(() => setVisibility("hidden"));
    await waitFor(() => expect(posts).toBe(1), { timeout: 200 });
  });

  it("flushes the pending push on pagehide", async () => {
    await hydrated();
    act(() => { useWorkoutStore.getState().toggleCompletion("set-a"); });
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await waitFor(() => expect(posts).toBe(1), { timeout: 200 });
  });

  it("does not push after unmount", async () => {
    const { unmount } = await hydrated();
    act(() => { useWorkoutStore.getState().toggleCompletion("set-a"); });
    unmount();
    await new Promise((r) => setTimeout(r, 700));
    expect(posts).toBe(0);
  });

  it("refetches on becoming visible only when the data is older than the stale time", async () => {
    await hydrated();
    act(() => setVisibility("visible"));
    await new Promise((r) => setTimeout(r, 50));
    expect(gets).toBe(1);

    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + 301_000);
    act(() => setVisibility("visible"));
    await waitFor(() => expect(gets).toBe(2));
  });
});
