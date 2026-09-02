# Lane B report

Area: Habit tracker UI (WorkoutsTab Daily Habits inline edit, HabitCard, HabitManager,
StreakCounter, Heatmap, WeekRhythm, MomentumChart, store habit actions, lib/helpers,
lib/habits). No browser tool used; findings via Read + component tests
(`src/__tests__/bugs/lane-b.test.tsx`, happy-dom + @testing-library/react).

## Findings (VERIFIED)

### 1. `mergeHabitDefs` can discard a not-yet-pushed local habit-list edit
Severity: P0 data loss
Status: VERIFIED (test)
Where: `src/hooks/useWorkoutStore.ts:90-100` (`mergeHabitDefs`), called from `hydrateFromSync` at `src/hooks/useWorkoutStore.ts:433-441`; edit actions that set `habitDefsDirty: true` without bumping `habitDefsVersion`: `addHabit` (`src/hooks/useWorkoutStore.ts:312-327`), `renameHabit` (`:329-337`), `removeHabit` (`:339-350`), `moveHabit` (`:352-361`).
Repro (unit-level, see test):
1. Local store is at `habitDefsVersion: 4` and the user renames a habit (`renameHabit`), which sets `habitDefsDirty: true` but leaves `habitDefsVersion` at 4 (version is server-assigned only, per the file's own doc comment at lines 66-67 — the rename hasn't been acked yet).
2. Before that edit is pushed/acked, `hydrateFromSync` runs again with a `serverData` snapshot at `habitDefsVersion: 5` that does not contain the edit (this is exactly what happens on every mount of the second, independent `useSync()` instance in Settings — see finding 3 below, or simply a different device's earlier-acked edit landing via the periodic GET).
3. `mergeHabitDefs` code:
```
const serverWins =
  localEmpty ||
  serverV > localV ||
  (!local.habitDefsDirty &&
    serverV === localV &&
    JSON.stringify(incoming.habitDefs) > JSON.stringify(local.habitDefs));
```
`serverV > localV` (5 > 4) is `true` **unconditionally** — `habitDefsDirty` only gates the *equal-version* tiebreaker on the third line, not this branch. The renamed/added/removed/reordered local list is silently replaced by the older-content-but-higher-numbered server list, and `habitDefsDirty` is reset to `false` (line 99), so the edit is not just overwritten in the UI, it stops being tracked as "needs to be re-sent" and is gone for good.
Expected: a dirty local edit should never be replaced by server data until that specific edit has been acked (or at minimum the CAS should be evaluated relative to the edit's own base version, not "any higher version wins").
Actual: any strictly-newer server version wins outright, dirty or not.
Root cause: the dirty-guard was written to protect only the deterministic-tiebreaker branch (added for the "equal version, different content" case) and was never extended to the "strictly newer version" branch, even though a locally dirty edit's version doesn't change until it's acked, so a genuinely newer version from elsewhere always beats it.
Evidence: `src/__tests__/bugs/lane-b.test.tsx`, test `BUG-B1: mergeHabitDefs clobbers a dirty edit on a strictly-newer server version` (`it.fails`, confirmed failing on HEAD):
```
✓ BUG-B1: mergeHabitDefs clobbers a dirty edit on a strictly-newer server version >
  keeps the local dirty edit when the server version is merely newer, not the
  edit's own ack (BUG-B1) 7ms
```
(green because `it.fails` — the assertion `expect(out.habitDefs).toEqual(A)` fails as predicted; `out.habitDefs` is `B`, the stale server copy).
Proposed fix: gate the `serverV > localV` branch on `!local.habitDefsDirty` too (or better: track the version each dirty edit was based on and only adopt server data whose version is newer than *that*, deferring adoption until the in-flight push resolves). Touches the sync/version-merge contract in `mergeHabitDefs` and the `applyHabitDefsAck` reconciliation path.

### 2. HabitManager and the WorkoutsTab inline habit editor run two independent `useSync()` instances
Severity: P1 wrong behaviour user will hit
Status: VERIFIED (trace)
Where: `src/app/page.tsx:32` (`const { syncNow, syncStatus } = useSync(!!isSignedIn && clerkLoaded);`, passed as a prop into `WorkoutsTab`) vs. `src/components/tabs/SettingsTab.tsx:24` (`const { syncNow } = useSync(!!isSignedIn);`, its own separate call) — `HabitManager` (`src/components/settings/HabitManager.tsx:19`) only ever receives `SettingsTab`'s local `syncNow`. `SettingsTab` is unmounted/remounted on every tab switch (`src/app/page.tsx`: `{activeTab === "settings" && <Suspense>...<SettingsTab/></Suspense>}` — no `display:none` keep-alive like `WorkoutsTab` gets one comment above it).
Repro (trace): confirmed by source-check test in `src/__tests__/bugs/lane-b.test.tsx` (`BUG-B3`, passing — both files independently call `useSync(...)`).
1. `useSync` (`src/hooks/useSync.ts:29`) creates a fresh `hydrated` ref (`useRef(false)`) and a fresh `useMutation` per call.
2. Every time the user opens Settings, a brand-new `useSync()` instance mounts with `hydrated.current === false`.
3. Its effect at `src/hooks/useSync.ts:63-79` runs the `!hydrated.current` branch on the very first `serverData` it sees — which, because the underlying `useQuery` cache key `["sync-data"]` is shared app-wide (react-query caches by key), is immediately the *already-cached* response from the initial page load (subject to the 300s `staleTime`, `src/hooks/useSync.ts:38`), not a fresh fetch.
4. That branch unconditionally calls `hydrateFromSync(serverData)` **and** `pushSync(getSyncPayload())` (`src/hooks/useSync.ts:70-73`) — i.e. every single time the user opens the Settings tab, the app fires an extra, unnecessary full-state `POST /api/sync`, and re-runs the merge in finding 1 against a snapshot that can be up to 5 minutes stale.
Expected: opening Settings should not by itself trigger a sync push; there should be exactly one `useSync` instance (or the "first load" push/hydrate should be owned by a single source of truth, e.g. lifted to `page.tsx` and shared via context/props like `syncNow` already is for `WorkoutsTab`).
Actual: two independent `hydrated` flags, two independent debounce timers, two independent `useMutation`s, both driving the same global zustand store's `applyHabitDefsAck`/`hydrateFromSync` actions — this is also the realistic real-world trigger for finding 1 (a stale-but-higher-or-equal-version snapshot re-entering the merge on Settings-tab open, mid-edit).
Root cause: `useSync` was designed as a page-level singleton (comment at `src/hooks/useSync.ts:33` even says "V14 bandwidth diet") but is instantiated per-consumer instead of being lifted once and threaded down, unlike every other cross-tab piece of state in this app.
Proposed fix: lift the single `useSync()` call to `page.tsx` (already done for `WorkoutsTab`) and pass `syncNow`/`syncStatus` down into `SettingsTab`/`HabitManager` as props instead of calling `useSync` again there.

### 3. Exiting habit-list edit mode ("Done") or switching the rename target silently discards an in-progress, uncommitted rename
Severity: P2 visual/UX (silent data loss of unsaved typed text, not persisted data)
Status: VERIFIED (trace)
Where: `src/components/tabs/WorkoutsTab.tsx:253-264` (the "Edit"/"Done" toggle button):
```
onClick={() => {
  setHabitsEditMode((v) => !v);
  setConfirmDeleteHabitId(null);
  setEditingHabitId(null);
}}
```
and `startRenameHabit` at `src/components/tabs/WorkoutsTab.tsx:82-86`:
```
const startRenameHabit = (id: string, label: string) => {
  setConfirmDeleteHabitId(null);
  setEditingHabitId(id);
  setDraftHabitLabel(label);
};
```
Repro:
1. Tap "Edit" to enter `habitsEditMode`, tap the rename (pencil-equivalent, the label button) on habit A, type a new draft label but do **not** press Enter or tap the check/save button.
2. Either (a) tap "Done" to leave edit mode, or (b) tap the rename control on a different habit B while A's edit is still open.
3. In case (a): `habitsEditMode` flips to `false` and the render switches straight from the edit-row branch to `<HabitCard>` (`src/components/tabs/WorkoutsTab.tsx:267-268`, `habitsEditMode ? (...) : (<HabitCard .../>)`); `editingHabitId`/`draftHabitLabel` are left dangling in React state (only `editingHabitId` is nulled, and only on the *next* "Edit" tap has any user-visible effect) — the typed draft is never passed to `renameHabit`, so it's lost with no confirm/discard prompt.
   In case (b): `startRenameHabit(B, ...)` immediately reassigns the single global `editingHabitId`/`draftHabitLabel` state to B's values, again discarding A's unsaved draft with no warning.
Expected: leaving edit mode or switching rename targets while a rename is in progress should either commit the draft (matching Enter's behavior) or explicitly prompt/discard, not silently vanish.
Actual: silent discard in both paths, with no `onBlur` handler on the rename `<input>` (`src/components/tabs/WorkoutsTab.tsx:298-310`) to catch it either — there is no code path that commits a rename except clicking the small check icon or pressing Enter.
Note: `HabitManager.tsx` (`src/components/settings/HabitManager.tsx:48-57`) has the identical `commitEdit`/`startEdit` pattern (no persistent edit-mode toggle, but switching `startEdit` to a different row while one is open discards the same way), so this is not specific to the inline WorkoutsTab editor — it's the shared pattern both surfaces copy.
Proposed fix: either commit the current draft (if non-empty after trim) before reassigning `editingHabitId`/before toggling `habitsEditMode` off, or block the "Done"/other-row-rename action while a draft differs from the original label until the user explicitly confirms/cancels.

### 4. History-strip day toggle is a pure boolean negation with no path back to "unlogged," including for today
Severity: P2 visual/UX (recoverable but confusing; can transiently zero a streak)
Status: VERIFIED (test + trace)
Where: `HabitCard.tsx:97-125` renders every day in the expanded history strip — including the `isToday` cell — with the same handler, `onClick={() => onToggleDate(d.key)}` (line 101), which for **all** days (not just past ones) routes to the store's `toggleHabit` action:
```
toggleHabit: (habitId, date) =>
  set((state) => ({
    habits: {
      ...state.habits,
      [habitId]: { ...(state.habits[habitId] || {}), [date]: !state.habits[habitId]?.[date] },
    },
  })),
```
(`src/hooks/useWorkoutStore.ts:296-302`). This is a plain `!value` negation: `!undefined === true` and `!false === true`, so once any day (today included) has been tapped once, it can only ever alternate `true`/`false` — nothing in the UI (top-row check/X use `setHabit`, an absolute setter, not a clearer; history strip uses only this toggle) can put a day back to `undefined`.
Why it matters specifically for today: `calculateDailyHabitStreak` (`src/lib/helpers.ts:118-131`) has an explicit distinction:
```
if (habit[key]) streak++;
else if (i > 0 || habit[key] === false) break;
// i === 0 and undefined (not logged yet): don't break the prior streak.
// i === 0 and explicitly false (marked missed): break immediately.
```
So a single accidental tap on today's history-strip cell that lands on `false` immediately zeroes the displayed streak (until the user taps "done" again to restore it) — there is no way to get back to the "not logged yet, streak still intact" state.
Expected: either the history-strip toggle should be a genuine tri-state cycle (undefined → true → false → undefined), or there should be some way to clear a day's entry.
Actual: two-state alternation only, `undefined` is a one-way-only initial value.
Evidence: `src/__tests__/bugs/lane-b.test.tsx`, `describe("HabitCard: history strip toggle semantics (BUG-B2)")` — the informational test passes showing `undefined → true → false → true → …`, and the `it.fails` test confirms no sequence of toggles returns to `undefined`.
Proposed fix: either add a distinct "clear" affordance (e.g. long-press, or a third tap state) that calls something like `setHabit(id, date, undefined)` (would need a new store action, since `setHabit`'s signature is `(habitId, date, done: boolean)`), or make the history-strip toggle three-state to match the semantic weight `calculateDailyHabitStreak` already gives `undefined` vs `false`.

## Hypotheses killed

- **H1 (partial) — "two CRUD surfaces, do they share validation and call syncNow after every mutation?"**: Validation IS shared — both `WorkoutsTab`'s inline editor and `HabitManager` delegate every mutation (`addHabit`/`renameHabit`/`removeHabit`/`moveHabit`) to the same store actions (`src/hooks/useWorkoutStore.ts:312-361`), which apply identical trim/empty checks, and both UIs call `syncNow()` immediately after every store mutation (`WorkoutsTab.tsx:73-113`, `HabitManager.tsx:48-79`). Neither surface enforces a duplicate-label check or an emoji restriction, but that's *symmetric*, not a divergence. The real, more serious divergence is architectural, not validation: they don't share the same `syncNow` *instance* at all — see Finding 2.
- **H1 (label 64-char cap)**: FALSE as stated — the 64-char cap (`src/lib/habits.ts:38,47`) applies only to the derived **id** (`makeHabitId`), which both UIs never expose to the user; the **label** cap is 100 chars everywhere: input `maxLength={100}` in both `WorkoutsTab.tsx:306` and `HabitManager.tsx:136`/`:201`, and server-side `z.string().min(1).max(100)` in `src/lib/validators.ts:64`. No divergence, no bug.
- **H3 (missing aria-pressed/aria-label makes check/X indistinguishable to a screen reader)**: FALSE. `HabitCard.tsx:40-41` (`aria-pressed={statusToday === true}`, `aria-label="Mark {label} today as done"`) and `:54-55` (`aria-pressed={statusToday === false}`, `aria-label="Mark {label} today as missed"`) are distinct and correctly reflect each button's own state independently, verified in `src/__tests__/bugs/lane-b.test.tsx` (`describe("HabitCard: today row ARIA state")`, all pass on HEAD — these are regression guards, not bug reports).
- **H2 (quick-succession/double-tap races)**: No race exists. `onSetToday` routes to the store's `setHabit`, an absolute assignment (`useWorkoutStore.ts:304-310`), not a toggle — every click is synchronous and idempotent-safe; the last click always wins deterministically (`src/__tests__/bugs/lane-b.test.tsx`, "check then X in quick succession" test, passes). The "no-op with no affordance" half of H2 (re-tapping an already-active button still fires the callback) is real but is a P3 nit at most, not a race — see the passing (non-`it.fails`) test documenting it; not written up as a separate numbered finding since it has no observable effect on state.
- **H5 (recent-days strip orientation vs. Heatmap)**: Consistent, not a bug. `getLastNDays(7)` (`src/lib/helpers.ts:139-151`) returns oldest-first with `isToday` on the last (rightmost, since `HabitCard.tsx:97` renders `recentDays.map` left-to-right) element — verified in `src/__tests__/bugs/lane-b.test.tsx`. `ConsistencyHeatmap` (`Heatmap.tsx:27-46`) likewise lays out weeks oldest-to-newest left-to-right with the current week rightmost (`weekIdx = weeks - 1` is most recent). Same orientation, no mismatch. (Note: `ConsistencyHeatmap` tracks weekly *workout-session* completion, not daily habits, so it isn't the same data as `HabitCard`'s strip — but the axis convention matches.)
- **H7 (index keys causing state misassignment on reorder/delete)**: FALSE for every habit-related list. `WorkoutsTab.tsx:270` (edit-mode row) and `HabitManager.tsx:99` both key on the stable habit id (`h.key`/`h.id`), not array index; `HabitCard.tsx:99` keys the history strip on the date string `d.key`. The only index-keyed lists (`StreakCounter.tsx:51`, `MomentumChart.tsx:126/128/135`) are fixed-length, non-reorderable, non-habit lists (3 stat rings; 8 fixed weekly chart points) where index-as-key is safe.
- **H6 (rename input Enter/blur/Escape/stale closures)**: Enter and Escape both work correctly and consistently in both editors (`WorkoutsTab.tsx:302-305`, `HabitManager.tsx:132-135`). No stale-closure bug found — `commitRenameHabit`/`commitEdit` both read `editingHabitId`/`draftHabitLabel` from current render-time state, not a captured stale value. Blur is simply unhandled (see Finding 3) — that's a missing affordance, not a stale-closure bug.
- **H4 (reorder-arrow disabled/off-by-one)**: FALSE. Both editors correctly disable "up" at `i === 0` and "down" at `i === habits.length - 1` / `i === habitDefs.length - 1` (`WorkoutsTab.tsx:278,288`; `HabitManager.tsx:107,117`), and the store's `moveHabit` (`useWorkoutStore.ts:352-361`) bounds-checks `target` before swapping. No wraparound, no off-by-one. (The "delete confirm then cancel" and "rename mid-flight on Done" halves of H4 are covered — the latter is Finding 3; delete-confirm-then-cancel correctly resets `confirmDeleteHabitId` to `null` with no side effect in both files.)
- **H8 (todayKey recomputed once per render vs mount)**: Not a bug as implemented. `WorkoutsTab.tsx:120` calls `todayKey()` fresh on every render (not memoized to mount), and the `habits` `useMemo` (`:121-137`) lists `today` in its dependency array, so any render after a midnight rollover recomputes correctly. The only caveat (not a bug per se) is that nothing forces a re-render exactly at midnight if the tab is left idle — the recompute only happens on the *next* render trigger (any store change, e.g. a habit tap), which is the same caveat every client-side "today" computation in this codebase shares.

## Not covered

- `MomentumChart.tsx` and `StreakCounter.tsx` were read fully but are workout-session (not daily-habit) widgets; no habit-specific bugs sought there beyond the key-safety check under H7.
- Did not attempt a full `render(<WorkoutsTab/>)`/`render(<SettingsTab/>)` integration test (would require mocking `@clerk/nextjs`, `@tanstack/react-query`'s `QueryClientProvider`, `fetch`, and `lib/pushNotify`); Findings 2 and 3 are traced instead, per the proof standard's allowance for `VERIFIED (trace)`, with an exact-line source-check test (`BUG-B3`) pinning the duplicate-instance fact so it can't silently regress.
- Did not chase the emoji/duplicate-label question further than confirming symmetry (H1) — neither editor nor the server schema rejects duplicate labels or emoji-only labels; this is presumably by design (no evidence it's treated as invalid anywhere) so not written up as a bug.
- Did not investigate the cron habit-status export (`a1fc72f`) or `src/app/api/cron/habit-status/route.ts` — out of UI scope per the lane split.
- Roughly 22 of the ~25-turn budget used; stopped after writing the report rather than starting a new investigation thread.

## Test run tail

`npx vitest run src/__tests__/bugs/lane-b.test.tsx`:
```
 RUN  v3.2.4 /Users/noelturlington/dev/workout-tracker
 ✓ src/__tests__/bugs/lane-b.test.tsx (10 tests) 36ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

`npm test` (full suite):
```
 ✓ src/__tests__/lib/oauthTokens.test.ts (8 tests) 4ms
 ✓ src/__tests__/lib/oura.test.ts (2 tests) 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/__tests__/bugs/_debug/lane-c-debug2.test.tsx > BUG-C1: CircuitTimer never requests a screen wake lock > ...
 FAIL  src/__tests__/bugs/_debug/lane-c-debug2.test.tsx > BUG-C2: RepTimer's wake-lock re-acquire-on-visible path is dead code > ...
 FAIL  src/__tests__/bugs/_debug/lane-c-debug2.test.tsx > BUG-C3: two SessionCard-mounted CircuitTimers can run concurrently with no mutual exclusion > ...
 FAIL  src/__tests__/bugs/_debug/lane-c-debug2.test.tsx > BUG-C4: CountdownIntro restarts from the full duration if timerSettings identity changes mid-count > ...
TypeError: Cannot read properties of undefined (reading 'setItem')
 ❯ Object.setItem node_modules/zustand/esm/middleware.mjs:298:42

 Test Files  1 failed | 45 passed (46)
      Tests  4 failed | 409 passed | 2 skipped (415)
```
Note: the 4 failures are pre-existing in another lane's scratch file (`src/__tests__/bugs/_debug/lane-c-debug2.test.tsx`, a different lane's timer-related work, not part of lane B's scope and not modified by this session — a localStorage-mock setup issue in that file, unrelated to habit tracking). `src/__tests__/bugs/lane-b.test.tsx` itself passes cleanly within the full run.
