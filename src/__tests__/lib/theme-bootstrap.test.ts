import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// S2 (pre-ship review): the pre-hydration theme bootstrap script in
// src/app/layout.tsx used to wrap the localStorage scan, the JSON.parse of
// each matched key, AND the matchMedia fallback + classList.toggle in ONE
// try. Any `workout-store*` key that isn't JSON (e.g.
// "workout-store:adopted-by", a bare account id string written by
// useWorkoutStore.ts's legacy-key claim) throws on JSON.parse and takes the
// fallback down with it — a dark-OS visitor with no readable persisted theme
// got stuck on the light theme (the exact defect BUG-08 was opened for).
//
// This test extracts the actual inline script from layout.tsx (not a copy)
// and executes it against mock localStorage/document/window globals, so a
// future edit that reintroduces one shared try is caught by running the real
// code, not by a source regex.
// ---------------------------------------------------------------------------

function extractBootstrapScript(): string {
  const src = fs.readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
  const marker = "Pre-hydration theme bootstrap";
  const markerIdx = src.indexOf(marker);
  expect(markerIdx).toBeGreaterThan(-1);
  const htmlKey = "__html: `";
  const start = src.indexOf(htmlKey, markerIdx);
  expect(start).toBeGreaterThan(-1);
  const scriptStart = start + htmlKey.length;
  const end = src.indexOf("`,", scriptStart);
  expect(end).toBeGreaterThan(scriptStart);
  return src.slice(scriptStart, end);
}

function runBootstrapScript(
  script: string,
  localStorageEntries: Record<string, string>,
  prefersDark: boolean,
): boolean {
  const keys = Object.keys(localStorageEntries);
  const localStorage = {
    length: keys.length,
    key: (i: number) => keys[i],
    getItem: (k: string) => localStorageEntries[k] ?? null,
  };
  const classes = new Set<string>();
  const document = {
    documentElement: {
      classList: {
        toggle: (name: string, force: boolean) => {
          if (force) classes.add(name);
          else classes.delete(name);
        },
      },
    },
  };
  const window = { matchMedia: () => ({ matches: prefersDark }) };
  const fn = new Function("localStorage", "document", "window", script);
  fn(localStorage, document, window);
  return classes.has("dark");
}

describe("theme bootstrap script (S2)", () => {
  it("falls back to matchMedia instead of dying when a workout-store* key isn't JSON", () => {
    const script = extractBootstrapScript();
    // Only a non-JSON key present — exactly the shape of
    // "workout-store:adopted-by" once the legacy key has been claimed and no
    // scoped key with a readable theme exists yet.
    const isDark = runBootstrapScript(script, { "workout-store:adopted-by": "user-a" }, true);
    expect(isDark).toBe(true);
  });

  it("still finds a valid persisted theme after skipping a non-JSON key", () => {
    const script = extractBootstrapScript();
    const isDark = runBootstrapScript(
      script,
      {
        "workout-store:adopted-by": "user-a",
        "workout-store:user-a": JSON.stringify({ state: { theme: "light" } }),
      },
      /* prefersDark */ true,
    );
    expect(isDark).toBe(false);
  });

  it("resolves 'system' via matchMedia", () => {
    const script = extractBootstrapScript();
    const isDark = runBootstrapScript(
      script,
      { "workout-store:user-a": JSON.stringify({ state: { theme: "system" } }) },
      /* prefersDark */ true,
    );
    expect(isDark).toBe(true);
  });
});
