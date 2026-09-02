// @vitest-environment happy-dom
//
// NOTE: this repo's happy-dom test env does not expose window.localStorage,
// and zustand's `persist` middleware (used by useWorkoutStore) resolves its
// storage getter eagerly the first time the store module is evaluated, so a
// stub assigned after that module has already been statically imported is
// too late (see src/__tests__/bugs/lane-c.test.tsx for the same pattern).
// ExportButton/useWorkoutStore are therefore imported dynamically below,
// after the stub is installed, instead of via a top-level static import.
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import "../mocks/clerk";
import { clearMockRedis, seedMockRedis } from "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { NextRequest } from "next/server";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { POST as labsPost } from "@/app/api/labs/route";
import { GET as healthGoalsGet } from "@/app/api/health-goals/route";

function installLocalStorageStub() {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
  Object.defineProperty(window, "localStorage", { value: stub, configurable: true, writable: true });
  Object.defineProperty(globalThis, "localStorage", { value: stub, configurable: true, writable: true });
}

let ExportButton: typeof import("@/components/recovery/ExportButton")["ExportButton"];
let useWorkoutStore: typeof import("@/hooks/useWorkoutStore")["useWorkoutStore"];

beforeAll(async () => {
  installLocalStorageStub();
  ({ ExportButton } = await import("@/components/recovery/ExportButton"));
  ({ useWorkoutStore } = await import("@/hooks/useWorkoutStore"));
});

function makeLabsImportRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/labs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      "X-Forwarded-For": `test-${Math.random()}`,
    },
    body: JSON.stringify({
      action: "import",
      data: {
        date: "2026-08-01",
        source: "Quest",
        name: "Annual panel",
        importMethod: "manual",
        markers: [{ biomarkerId: "hrv", value: 999, unit: "ms" }],
      },
    }),
  });
}

// BUG-F1: /api/labs "import" never invalidates the cached user:{userId}:health-goals
// key the way /api/extract-labs does (see src/app/api/extract-labs/route.ts, which
// explicitly `redis.del`s the health-goals cache after import). A manual lab import
// via POST /api/labs { action: "import" } silently leaves stale, pre-import goals
// cached for up to 24h (src/app/api/health-goals/route.ts EX 86400).
describe("BUG-F1: labs import does not invalidate health-goals cache", () => {
  beforeEach(() => {
    clearMockRedis();
    setMockUserId("test-user-123");
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("clears the cached health-goals after a new lab import", async () => {
    // Seed a stale cached goals response, as if generated before this import.
    seedMockRedis({
      "user:test-user-123:health-goals": JSON.stringify([{ id: "stale-goal", title: "Stale" }]),
    });

    const importRes = await labsPost(makeLabsImportRequest());
    expect(importRes.status).toBe(200);

    // After importing new lab data, the cached goals should have been invalidated
    // so the next GET recomputes from fresh data instead of serving the stale entry.
    const goalsRes = await healthGoalsGet(
      new NextRequest("http://localhost:3000/api/health-goals", {
        headers: { "X-Forwarded-For": `test-${Math.random()}` },
      }),
    );
    const goalsJson = await goalsRes.json();
    expect(goalsJson.goals?.[0]?.id).not.toBe("stale-goal");
  });
});

// BUG-F2: ExportButton's CSV writer (src/components/recovery/ExportButton.tsx)
// escapes commas and newlines in workout notes but never escapes embedded
// double-quote characters before wrapping the field in quotes. A note like
// `He said "great"` becomes the CSV field `"He said "great""`, which is
// malformed CSV per RFC 4180 (an unescaped quote inside a quoted field) and
// corrupts the row when reopened in Excel/Sheets.
describe("BUG-F2: ExportButton does not escape quotes in workout notes CSV", () => {
  it("escapes embedded double quotes in notes so the CSV field stays valid", () => {
    useWorkoutStore.setState({
      completions: { "mon-strength": true },
      logs: {
        "mon-strength": {
          feeling: "good",
          duration: 45,
          notes: 'He said "great" session',
          completedAt: "2026-08-01T12:00:00.000Z",
        },
      },
    } as never);

    let capturedWorkoutCsv = "";
    class FakeBlob {
      constructor(parts: string[], _opts: unknown) {
        const content = parts.join("");
        // The component writes recovery CSV first, then workout CSV.
        if (content.startsWith("Key,Completed")) capturedWorkoutCsv = content;
      }
    }
    vi.stubGlobal("Blob", FakeBlob as unknown as typeof Blob);
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:mock",
      revokeObjectURL: () => {},
    } as unknown as typeof URL);

    const { getByRole } = render(React.createElement(ExportButton, { data: {} }));
    fireEvent.click(getByRole("button", { name: /export/i }));

    // A correctly-escaped field would contain `""great""`; the buggy output
    // contains a single embedded `"great"` inside the outer quotes.
    expect(capturedWorkoutCsv).toContain('""great""');

    vi.unstubAllGlobals();
  });
});

// BUG-F3: WorkoutsTab.tsx keyed each day's session card by the post-filter
// array index (`si`) even though a stable, session-specific key (`sessionKey`)
// is computed one line above and already passed to SessionCard as `logKey`.
// Index keys break React's reconciliation identity across re-renders that
// change which sessions are scheduled (e.g. switching to/from a bi-weekly
// "off" week), carrying a SessionCard's local expand/confetti state onto the
// wrong session. Fixed by using the stable `key` variable as the React key.
// No full render() is used here (mocking Clerk/TanStack Query/push-notify for
// WorkoutsTab is out of this lane's scope, matching the ledger's own
// VERIFIED (trace) status) — this is a source-check pinning the exact fix so
// a future edit can't silently regress back to `key={si}`.
describe("BUG-F3: WorkoutsTab keys session cards by stable sessionKey, not array index", () => {
  it("uses the computed `key` variable, not `si`, as the SessionCard wrapper's React key", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/tabs/WorkoutsTab.tsx"), "utf8");
    expect(src).toMatch(/const key = sessionKey\(wk, activePlan\.day, session\);/);
    expect(src).toMatch(/<div key=\{key\} className="anim-fade-up"/);
    expect(src).not.toMatch(/<div key=\{si\} className="anim-fade-up"/);
  });
});
