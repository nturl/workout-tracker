// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSync } from "@/hooks/useSync";
import { useWorkoutStore, emptyDirty, seedDefaultHabits } from "@/hooks/useWorkoutStore";

// ---------------------------------------------------------------------------
// S1 (SHOULD-FIX, pre-ship review): `hydrated.current` in useSync never reset
// when the account changed. `useSync` is one instance owned by page.tsx and
// is never remounted across a sign-out/sign-in — only its `enabled` argument
// flips (page.tsx: false while it re-points persistence at the new account's
// key, true once it settles + clears the query cache). With `hydrated.current`
// stuck `true` from the first account, the second account's hydrate effect
// falls into the `else if (serverData && serverTs && serverTs !==
// lastServerUpdate.current)` branch instead of the `!hydrated.current`
// first-load branch — so a coincidental (or, per BUG-09, a brand-new
// account's `null`/undefined-updatedAt) match against the STALE
// `lastServerUpdate.current` left over from the previous account silently
// skips hydrateFromSync entirely.
//
// This test picks two accounts whose server payloads happen to share the
// same `updatedAt`, which is exactly the condition that exposes the bug: it
// fails against the pre-fix code (second account never hydrates) and passes
// against the fix (the falling edge of `enabled` resets `hydrated.current`
// and `lastServerUpdate.current`, so the second account re-enters the
// first-load branch and hydrates unconditionally).
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

describe("useSync resets hydrated state across an account switch", () => {
  let queryClient: QueryClient;
  let fetchMock: ReturnType<typeof vi.fn>;
  let getResponses: Array<Record<string, unknown>>;

  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    resetStore();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    getResponses = [];
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ habitDefs: [], habitDefsVersion: 1 }), { status: 200 });
      }
      const next = getResponses.shift();
      return new Response(JSON.stringify({ data: next ?? null }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetStore();
  });

  it("hydrates a second account whose serverTs matches the first account's stale lastServerUpdate", async () => {
    // Account A's server payload.
    getResponses.push({ completions: { old: true }, updatedAt: 100 });

    const { rerender } = renderHook(({ enabled }) => useSync(enabled), {
      wrapper,
      initialProps: { enabled: true },
    });

    await waitFor(() => expect(useWorkoutStore.getState().completions.old).toBe(true));

    // page.tsx: disable sync while it re-points persistence at the new
    // account, and clears the query cache before re-enabling.
    rerender({ enabled: false });
    queryClient.clear();

    // Account B's server payload — deliberately the SAME updatedAt as A's.
    getResponses.push({ completions: { new: true }, updatedAt: 100 });
    rerender({ enabled: true });

    await waitFor(() => expect(useWorkoutStore.getState().completions.new).toBe(true));
  });
});
