# Fix lane S5 — habit data & cross-lane glue (2026-09-01)

Branch: master. Scope: `src/hooks/useWorkoutStore.ts`, `src/components/progress/HabitCard.tsx`,
`src/components/tabs/WorkoutsTab.tsx`, `src/components/settings/HabitManager.tsx`,
`src/app/page.tsx`, `src/hooks/useConnectedAccounts.ts`, plus owned test files. Read
`notes/bugs/fix-s1.md` and `notes/bugs/fix-s3.md` in full before starting, per the brief.

---

## BUG-14 (P2) — no way back to unrecorded; a mistaken tap zeroes the streak

**History strip → three-state cycle.** `src/components/progress/HabitCard.tsx:110-140`:
the history cell's `onClick` now calls a new `onCycleDate(d.key)` prop instead of the old
`onToggleDate` (plain boolean negation). The cycling logic lives in
`src/components/tabs/WorkoutsTab.tsx:130-155` (the `habits` `useMemo`), per habit:

```ts
cycleDate: (date: string) => {
  const current = map[date];
  if (current === undefined) setHabit(id, date, true);
  else if (current === true) setHabit(id, date, false);
  else clearHabit(id, date);
},
```

`clearHabit` is S1's deletion entry point (`src/hooks/useWorkoutStore.ts`): it removes the
date key (so it reads back `undefined`) and marks the date dirty as a deletion, which
`getSyncDelta` turns into a tombstone on the next push. `toggleHabit` (the old pure
negation) is untouched and still exists on the store — WorkoutsTab just no longer calls it
for habit dates; nothing else in the codebase referenced it, so it's now dead from the UI's
perspective but left in place since it's exported store surface.

**Today's row → reversible active tap.** `HabitCard.tsx:52,66`: the check/X buttons keep
their explicit `onSetToday(true|false)` behavior when tapped while inactive, but tapping the
button that's already the ACTIVE one now calls a new `onClearToday()` prop instead of
re-firing `onSetToday` with the same value:

```tsx
onClick={() => (statusToday === true ? onClearToday() : onSetToday(true))}   // check
onClick={() => (statusToday === false ? onClearToday() : onSetToday(false))} // X
```

`onClearToday` is wired in WorkoutsTab (`h.clearToday = () => clearHabit(id, today)`,
`WorkoutsTab.tsx:143` + the render-site wrapper at ~`:416-419`) to the same `clearHabit`
store action, so a mistaken tap is now reversible and goes through the identical
tombstone path.

**aria-pressed/aria-label**: today's row buttons are unchanged (aria-pressed still
`statusToday === true` / `=== false`; aria-label text unchanged — `lane-b.test.tsx`'s ARIA
regression-guard tests pin this and stay green as written). History cells: aria-pressed
stays `d.logged === true`; aria-label now names the correct next action across all three
states — "done" when unrecorded, "missed" when done, **"unrecorded"** when missed (was a
binary done/missed label before).

**Store-level dirty/tombstone test** (required by the brief):
`src/__tests__/lib/habits.test.ts`, "useWorkoutStore habits" describe block — new test
"clearHabit after toggleHabit removes the date and marks it dirty for the tombstone path":
toggles a date, asserts it reads `true` and is dirty; clears it, asserts it reads
`undefined` (key absent) and is *still* dirty (now a deletion); calls `getSyncDelta()` and
asserts `delta.tombstones.habits` contains it. Also added `dirty: emptyDirty()` to that
describe's `beforeEach` — S1's report flagged this exact isolation gap (a dirty mark
leaking between tests in the neighboring "hydrateFromSync merges..." test); needed it
clean for the new test and it's a strict improvement, not a behavior change.

### Tests changed
- `src/__tests__/bugs/lane-b.test.tsx`:
  - **REWRITTEN** ("re-tapping the already-active check button…" → two new tests). The
    original pinned the *bug itself* (tapping the active check button re-fired
    `onSetToday(true)` "with no visible affordance it's a no-op") — that's exactly what
    BUG-14 asks to fix, so the old assertion is now false. Replaced with one test that the
    active button calls `onClearToday` and not `onSetToday`, and one that the inactive
    button still calls `onSetToday` and not `onClearToday`.
  - **BUG-B2 `it.fails` → `it`, REWRITTEN.** The original exercised a synthetic local
    `toggle` function pinned to the *old* reducer shape and asserted (failing) that
    repeated toggling could reach `undefined` — it never could, by construction. The fix
    doesn't change that reducer (`toggleHabit` is still a pure negation); it changes which
    store action the UI calls at each step of the cycle. Rewrote it to exercise the real
    three-step cycle (`setHabit`/`setHabit`/`clearHabit`) and flipped it to a passing `it`.
  - Added: a cycle-call test ("tapping an unlogged (undefined) day calls onCycleDate") and
    an aria-state test across all three history-cell states.
  - `baseProps` in "HabitCard: today row ARIA state" updated: `onToggleDate` → `onCycleDate`,
    added `onClearToday`.
- `src/__tests__/lib/habits.test.ts`: new test described above; `dirty` added to the
  existing `beforeEach`.

---

## BUG-13 (P2) — pre-tri-state `false` habit dates render as a false "missed"

**Fix:** `src/hooks/useWorkoutStore.ts`, `migrateHabitsState`, new `if (version < 5)` block
(after the existing v3→v4 block). Persist version bumped `4 → 5`
(`useWorkoutStore.ts`, the `persist(...)` config's `version:` field).

```ts
if (version < 5) {
  const CUTOFF = "2026-08-25";
  // for every habits[id][date] === false with date <= CUTOFF:
  //   delete it, and mark dirtyHabits[id][date] = true
  s.habits = habits;
  s.dirty = { ...dirty, habits: dirtyHabits };
}
```

Date-string comparison (`date <= CUTOFF`) is safe because habit-date keys are
`YYYY-MM-DD`, where lexicographic order equals chronological order. `2026-08-25` and
everything before it is removed; `2026-08-26` (the redesign's commit date) onward is left
untouched as a genuine explicit miss. The removed keys are added to `dirty.habits[id]`
(reusing the same `withKey` helper the store actions use), so the *next* push's
`getSyncDelta()` naturally emits them as tombstones (`dirty`-but-absent-from-map is
already S1's tombstone signal) — no new sync-side code needed, this migration just
produces the same shape `clearHabit` does.

**One user, one device, so:** as noted in the brief, a server-side copy on a device that
never runs this migration would only be re-merged if that device *pushed* it dirty — and
the delta design means a device that never touched that key never mentions it. Since
there's exactly one user, this migration runs once on their one real device and the
tombstone push clears the server copy; there's no second device to leave stale.

### Test
`src/__tests__/lib/habits.test.ts`, new `describe("migrateHabitsState (v4 -> v5)")`:
- fixture with dates on both sides of 2026-08-25 (and the cutoff date itself) across two
  habits, `false` and `true` values — asserts pre-cutoff `false` dates are removed and
  marked dirty, `2026-08-26` `false` is kept and not marked dirty, `true` dates are kept
  regardless of date.
- a second test asserting a *pre-existing* dirty mark unrelated to the migration survives
  the merge (dirty state is additive, not replaced).
- no-op-at-current-version test, matching the pattern of the other migration blocks.

---

## BUG-15 (P2) — HabitManager half (WorkoutsTab half already done by S3)

Per `fix-s3.md`'s exact prescription, applied to `src/components/settings/HabitManager.tsx`:

1. `startEdit(id, label)` (~line 42): before reassigning the edit target, if a different
   row is currently being edited and its trimmed draft is non-empty, commits it
   (`renameHabit` + `syncNow`) first — same pattern as WorkoutsTab's `startRenameHabit`.
2. The rename `<input>` (~line 128): added an `onBlur` handler that commits a non-empty
   trimmed draft the same way Enter does, then clears editing state. Escape still cancels
   via `cancelEdit` without triggering the blur-commit path in practice (same
   focus-moves-before-blur-fires ordering S3 documented for WorkoutsTab).

HabitManager has no separate persistent "Edit/Done" mode toggle (confirmed by reading the
file — `editingId`/`confirmDeleteId` are the only mode-like state), so only these two
sites needed the fix, matching fix-s3.md's note.

No new test added here — `HabitManager.tsx` isn't in this lane's test-file allowlist
(`lane-a.test.ts`, `lane-b.test.tsx`, `integration/*`, `lib/habits.test.ts`), and
`lane-b.test.tsx`'s existing BUG-15 test only source-checks `WorkoutsTab.tsx` (S3's half).
Verified this half by reading the diff against the same pattern S3 already proved out and
by `tsc`/`eslint`.

---

## Glue from fix-s1.md

**(a) BUG-20's `SyncStatus` type reaches the screen.**
- `src/components/tabs/WorkoutsTab.tsx`: added `import type { SyncStatus } from
  "@/hooks/useSync";`, changed `WorkoutsTabProps.syncStatus` from
  `"idle" | "syncing" | "error"` to `SyncStatus`.
- `src/app/page.tsx`: removed the `syncStatus === "delayed" ? "syncing" : syncStatus`
  narrowing (and its comment) — `<WorkoutsTab syncStatus={syncStatus} .../>` now passes
  the real 4-state value straight through.
- **`SyncIndicator` already handles `"delayed"`** — checked
  `src/components/ui/SyncIndicator.tsx:6-21`: its `colors` and `labels` records both
  already have `delayed` entries (`var(--warning)` / "Sync delayed"), and the pulsing
  animation condition already includes `status === "delayed"`. S1 built it fully; no gap,
  no edit needed (per the brief, this file belongs to S1 and wasn't touched).

**(b) BUG-26 — `useOuraStatus` gets an `enabled` option; page.tsx uses it.**
Took the "cleaner fix" path fix-s1.md offered, since S1's inline duplicate in page.tsx
(a second `useQuery` with the same query key, fetcher, and `staleTime` re-typed by hand)
was strictly messier than centralizing the gate:
- `src/hooks/useConnectedAccounts.ts`: `useOuraStatus(enabled = true)`, passes `enabled`
  into the `useQuery` config. Default preserves every existing call site
  (`WorkoutsTab.tsx` still calls it with no args).
- `src/app/page.tsx`: replaced the inline `useQuery<{connected...}>({...})` block with
  `useOuraStatus(authLoaded && !!isSignedIn)`; removed the now-unused `useQuery` import
  (kept `useQueryClient`, still used); added `useOuraStatus` to the existing
  `useConnectedAccounts` import alongside `useOuraSync`.

---

## Test run tails

`npx tsc --noEmit`: clean, no output.

`npx eslint <all files touched by this lane>`: 0 errors, 0 warnings.

`npx vitest run` (full suite):
```
 Test Files  2 failed | 49 passed (51)
      Tests  3 failed | 459 passed | 2 skipped (464)
```
All 3 failures are in `lane-c.test.tsx` (BUG-C3, CircuitTimer concurrency) and
`lane-d.test.tsx` (BUG-D1a, RepTimer font) — both in `src/components/tracking/*`, the
timers lane's territory, explicitly out of this lane's scope and still being edited
concurrently. Not investigated further per the brief.

This lane's own files, run in isolation:
```
npx vitest run src/__tests__/bugs/lane-a.test.ts src/__tests__/bugs/lane-b.test.tsx \
  src/__tests__/lib/habits.test.ts src/__tests__/integration/
 Test Files  8 passed (8)
      Tests  87 passed (87)
```

---

## Not done / follow-ups

- Nothing from the assigned task list was skipped. `HabitManager.tsx`'s BUG-15 fix has no
  dedicated new test (file not in this lane's test allowlist — see above).
- `toggleHabit` (the store action) is no longer called from any UI after this change
  (WorkoutsTab's history cells and today's row now go through `setHabit`/`clearHabit`
  directly). Left in place since it's exported store API and `lib/habits.test.ts` /
  `lane-a.test.ts` exercise it directly; flagging in case a later lane wants to prune it.
- Did not touch `src/hooks/useSync.ts` — no type export was needed beyond the already-
  exported `SyncStatus`.
