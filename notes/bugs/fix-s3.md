# Lane S3 fix report — habit UI + theme (2026-09-01)

Scope: src/components/tabs/WorkoutsTab.tsx, src/components/progress/HabitCard.tsx,
src/components/progress/Heatmap.tsx, src/components/progress/WeekRhythm.tsx,
src/components/progress/StreakCounter.tsx, src/components/dashboard/SunBanner.tsx,
src/components/layout/LandingPage.tsx, src/hooks/useTheme.ts, src/app/layout.tsx,
src/lib/habits.ts, src/lib/helpers.ts, plus the owned test files.

## BUG-08 (P1) — theme never bootstraps outside Settings

Fix: `src/app/layout.tsx:42-79`. Added `suppressHydrationWarning` on `<html>` and
an inline pre-hydration `<script>` in `<head>` (before body) that:
- scans `localStorage` for any key starting with `"workout-store"` (the legacy
  fixed key, or an account-scoped variant like `workout-store:<userId>` if
  another lane lands that scoping) and reads `parsed.state.theme`;
- resolves `"system"`/missing to `matchMedia('(prefers-color-scheme: dark)')`;
- sets `document.documentElement.classList.toggle('dark', resolved === 'dark')`
  before first paint.

`useTheme.ts`'s `applyTheme` (`src/hooks/useTheme.ts:12-15`) was already
idempotent — it's a plain `classList.toggle(...)`, so re-running it on mount
with the same resolved theme the bootstrap script already applied is a no-op.
No change needed there.

Verified: `npx tsc --noEmit` clean; `npx vitest run` green (no test exercises
`layout.tsx`'s inline script — it's server-rendered markup, out of vitest's
happy-dom reach — verification is by inspection + tsc). Did not run
`next build`/browser preview per the lane's rules.

## BUG-11 (P1) — WorkoutsTab keys session cards by array index

Fix: `src/components/tabs/WorkoutsTab.tsx:248` (was line 239 pre-edit) —
changed `<div key={si} ...>` to `<div key={key} ...>`, using the already-computed
`const key = sessionKey(wk, activePlan.day, session);` one line above (already
passed to `SessionCard` as `logKey`).

Test: added `src/__tests__/bugs/lane-f.test.ts` — new `describe("BUG-F3: ...")`
source-check test (no pre-existing `it.fails` existed for this bug; the ledger
itself notes F3 was `VERIFIED (trace)` only). Asserts the wrapper `div` uses
`key={key}` and never regresses to `key={si}`. A full `render(<WorkoutsTab/>)`
repro would need mocking Clerk/TanStack Query/push-notify, out of this lane's
budget — same call the ledger made.

## BUG-15 (P2, WorkoutsTab half) — in-progress rename discarded

Fix, three sites in `src/components/tabs/WorkoutsTab.tsx`:
1. `startRenameHabit` (~82-95): if `editingHabitId` is set and differs from the
   new target `id`, commits the current trimmed `draftHabitLabel` via
   `renameHabit` + `syncNow()` before reassigning `editingHabitId`/`draftHabitLabel`.
2. The Edit/Done toggle button (~253-273): if `habitsEditMode` is currently on
   and `editingHabitId` is set, commits the trimmed draft before flipping
   `habitsEditMode` off and clearing `editingHabitId`/`draftHabitLabel`.
3. The rename `<input>` (~298-321): added an `onBlur` handler that commits a
   non-empty trimmed draft (mirrors Enter's `commitRenameHabit`), then clears
   `editingHabitId`/`draftHabitLabel`. Escape still cancels via
   `cancelRenameHabit` without triggering blur-commit (focus stays on the
   input on Escape). Note: this means clicking "Cancel" while a non-empty
   draft differs from the original will now commit-on-blur before the Cancel
   click's own handler runs (blur fires before click) — accepted per the
   lane brief's "commit on blur" instruction; `commitRenameHabit`/
   `cancelRenameHabit` are both guarded by `if (!editingHabitId) return`, so
   there's no double-commit, just Cancel becoming a no-op once blur already
   committed.

Test: added `src/__tests__/bugs/lane-b.test.tsx` — new
`describe("BUG-15: ...")` source-check test (no pre-existing `it.fails`
existed for this bug either; the ledger notes BUG-15/BUG-05 both lack a full
render repro for the same Clerk/TanStack-Query/push-notify mocking cost).
Asserts all three commit sites are present and reference
`renameHabit(editingHabitId, trimmed)`.

**HabitManager.tsx change needed (NOT applied — out of this lane's file
ownership; report only, per the brief):**
`src/components/settings/HabitManager.tsx:~48-57` has the identical
`commitEdit`/`startEdit` pattern with no persistent edit-mode toggle, but
switching `startEdit` rows while one is open discards the same way. The
matching fix there:
- In `startEdit(id, label)`: before reassigning the currently-editing id,
  check if an edit is already in progress for a *different* row and, if its
  trimmed draft is non-empty, call the equivalent of `commitEdit` for that
  row first.
- Add an `onBlur` handler to the rename `<input>` that commits a non-empty
  trimmed draft the same way Enter does, then clears the editing state.
- `HabitManager` has no separate "Edit/Done" mode toggle (per the BUG-15
  ledger entry, "no persistent edit-mode toggle"), so only these two sites
  need the fix there, not three.

## BUG-23 (P3, my files only) — hardcoded colours

- `src/components/progress/HabitCard.tsx:77,80`: `#f97316` (flame streak
  color) → `var(--warning)`.
- `src/components/progress/Heatmap.tsx:120`: `DOT_COLORS[category] ||
  "#6b7280"` fallback → `var(--text-muted)`.
- `src/components/progress/WeekRhythm.tsx:49`: same `#6b7280` fallback →
  `var(--text-muted)`.
- `src/components/progress/StreakCounter.tsx:43`: streak ring gradient
  `#f97316`/`#fb923c` → `var(--warning)` /
  `color-mix(in srgb, var(--warning) 100%, white 25%)` (matches the
  `color-mix` tinting pattern already used elsewhere in the codebase, e.g.
  `src/components/ui/OfflineBanner.tsx:24`).
- `src/components/progress/StreakCounter.tsx:45` ("Best" ring,
  `#a855f7`/`#c084fc`, purple): **left as-is.** No purple token exists
  anywhere in `DESIGN_SPEC.md`'s palette (only accent/warning/danger/muted) —
  there's nothing to map it to without inventing a new brand color, which the
  spec explicitly forbids ("no new hardcoded hex except in data-viz").
- `src/components/dashboard/SunBanner.tsx:55-58` (daylight progress bar
  gradient): the `#f97316` (orange, "near sunset") stop now uses
  `var(--warning)`. The `#fbbf24` (yellow) and `#60a5fa` (blue) stops are
  **left as-is** — same reasoning as the purple ring above, no yellow/blue
  tokens exist in the design spec.
- `src/components/layout/LandingPage.tsx`: **left unchanged.** Per the lane
  brief ("it is a deliberately dark marketing surface … only fix what is
  clearly wrong"), and per BUG-08's own resolution (the app's only
  `useTheme()`/`.dark`-class mechanism never reaches this page — it's a
  fixed-dark unauthenticated route, not meant to react to the app's
  light/dark toggle), swapping its background/text colors to
  `var(--bg-primary)`/`var(--text-*)` tokens would be actively wrong: those
  tokens resolve to the *light* palette by default (`:root`) and would break
  this page's intentional black background whenever `.dark` isn't set (i.e.
  always, since it's unreachable by the theme bootstrap). Nothing else on the
  page reads as a clear bug (no broken contrast, no theme-reactive tokens
  fighting with hardcoded values) — I did not find anything here that is
  "clearly wrong" rather than "deliberately off-token for a fixed-dark page."

## Not attempted

- BUG-13, BUG-14 — explicitly out of scope per the brief (second wave, need
  the sync deletion path another lane is building).
- Everything outside my file list (BUG-01/02/03/04/05/06/07/09/10/12/16-22,
  and the CircuitTimer/RepTimer/ConfettiBurst portion of BUG-23) — owned by
  other lanes, untouched.

## Test run tails

`npx vitest run` (full suite):
```
Test Files  2 failed | 44 passed (46)
     Tests  2 failed | 412 passed | 2 skipped (416)
```
The 2 failures are both outside this lane's scope and pre-existing/other-lane
territory:
- `src/__tests__/bugs/lane-c.test.tsx > BUG-C3` (CircuitTimer concurrency —
  Area C, not owned here)
- `src/__tests__/bugs/lane-e.test.ts > BUG-E3` (sync route schema — Area E,
  not owned here)

All tests in my owned files (`lane-b.test.tsx`, `lane-f.test.ts`,
`components/Heatmap.test.tsx`, `helpers.test.ts`) pass: 45/45 when run in
isolation, same in the full run.

`npx tsc --noEmit`: clean, no output.

`npx eslint <owned files>`: 0 errors, 1 pre-existing warning in
`lane-f.test.ts` (`_opts` unused var, not in code I added).
