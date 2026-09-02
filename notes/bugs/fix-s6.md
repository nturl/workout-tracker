# Fix lane S6 — pre-ship blockers (2026-09-01)

Branch: master, uncommitted tree. No build, no commit/push/deploy, no `rm`, no git
history commands were run, per the brief.

Final gates (run after all seven items landed):

- `npx tsc --noEmit` → exit 0, no output.
- `npx vitest run` → **55 files, 478 passed, 2 skipped (pre-existing, unrelated:
  `lane-a.test.ts:124` and two `lane-d.test.tsx` placeholders), 0 failed.**
- `npx eslint <every file touched>` → 0 errors, 0 warnings (two warnings from the
  first pass — an unused eslint-disable in `useSync.ts` and an unused param +
  unused eslint-disable in the new theme-bootstrap test — were cleaned up; see
  per-item notes below).

For B1 specifically, I verified the new test actually catches the bug: I
temporarily reverted `setPersistAccount`'s ordering to the pre-fix code, re-ran
`src/__tests__/bugs/b1-account-switch.test.ts` and watched both tests fail with
the exact symptom the review described (`afterSwitch.state.completions["mon-squat"]`
== `undefined` instead of `true`), then restored the fix and re-ran to green.

---

## 1. B1 — `setPersistAccount()` wiped the outgoing account's data

**Where:** `src/hooks/useWorkoutStore.ts:879-893` (was `:846-874` before the other
edits below shifted line numbers).

**Root cause (confirmed by trace, matching the review):** `useWorkoutStore.setState`
is persist-wrapped — it calls `accountStorage.setItem` against whatever
`persistApi.getOptions().name` is at the moment `setState` runs. The old code called
`useWorkoutStore.setState(freshAccountState())` *before* `persistApi.setOptions({name:
key})`, so the empty reset blob was serialized straight over the **outgoing**
account's real key, erasing its data and its unpushed `dirty` marks (which is what
BUG-13's tombstones ride on). `rehydrate()` never repaired it because v5 -> v5 isn't a
migration.

**Fix:** point persist at a throwaway scratch key (`RESET_SCRATCH_KEY =
"workout-store:__scratch__"`, new constant at `:247-250`) for the duration of the
reset, so neither the outgoing key nor the not-yet-rehydrated incoming key can ever
be clobbered:

```ts
persistApi.setOptions({ name: RESET_SCRATCH_KEY });
useWorkoutStore.setState(freshAccountState());
persistApi.setOptions({ name: key });
await persistApi.rehydrate();
```

This also fixes the review's secondary finding ("also hits the very first load of
the new bundle") — the legacy key is likewise never touched by the reset now.

**Test:** new file `src/__tests__/bugs/b1-account-switch.test.ts` (happy-dom, real
`window.localStorage`, dynamic import of `useWorkoutStore` after installing the
stub — same pattern `lane-c.test.tsx` already uses, since persist's storage getter
resolves at module-eval time).
- "account A's dirty data and dirty marks survive switching to account B, and
  rehydrate back to A": signs A in, makes dirty edits, asserts A's raw localStorage
  key still holds the data + dirty marks after switching to B, then signs A back in
  and asserts the in-memory store recovers exactly what was left (not the old
  empty-blob regression).
- "legacy key adoption still works, and the legacy key itself is left intact":
  seeds the legacy `workout-store` key, adopts it via a first sign-in, and asserts
  both the new scoped key AND the legacy key itself still hold the original data.
- Verified fail-before/pass-after by hand (see gates note above).

---

## 2. SHOULD-FIX — `useSync`'s `hydrated.current` never reset across an account switch

**Where:** `src/hooks/useSync.ts` (new effect after the `lastServerUpdate` ref
declaration, ~`:130-151`).

**Fix:** reset `hydrated.current` and `lastServerUpdate.current` whenever `enabled`
goes false (the falling edge — page.tsx sets `syncReady`/`enabled` to false while it
re-points persistence at the new account and clears the query cache):

```ts
useEffect(() => {
  if (!enabled) {
    hydrated.current = false;
    lastServerUpdate.current = null;
  }
}, [enabled]);
```

So the next rising edge (the new account) re-enters the `!hydrated.current`
first-load branch from scratch instead of falling into the stale `else if`
comparison against the previous account's `lastServerUpdate`.

**Test:** new file `src/__tests__/integration/sync-account-switch.test.tsx`
(happy-dom, `renderHook` + a real `@tanstack/react-query` `QueryClientProvider`,
mocked `fetch`). Mounts `useSync(true)` for account A (server payload
`updatedAt: 100`), disables it (simulating the mid-switch window) + clears the
query client (matching what `page.tsx` does), then re-enables for account B whose
server payload **deliberately shares the same `updatedAt: 100`** — the exact
condition that exposes the bug (without the reset, `hydrated.current` stays true,
the effect falls into `else if (... serverTs !== lastServerUpdate.current)`, and
`100 !== 100` is false, so B's `hydrateFromSync` never runs). Asserts B's data does
land in the store.

---

## 3. B3 — "Cancel" on a habit rename saved instead of cancelling

**Where:** `src/components/tabs/WorkoutsTab.tsx:368-390` (Save/Cancel buttons) and
`src/components/settings/HabitManager.tsx:171-182` (same pair).

**Root cause (confirmed by trace):** mousedown on Cancel blurs the `<input>` before
the click lands; `onBlur` commits any non-empty draft and unmounts the edit row
(`editingHabitId`/`editingId` goes back to `null`) before the click event can ever
reach `cancelRenameHabit`/`cancelEdit`.

**Fix:** `onMouseDown={(e) => e.preventDefault()}` on both the Save and Cancel
buttons in both files, which suppresses the browser's default blur-on-mousedown so
the click reaches the button normally. Enter/Escape are untouched (they don't move
focus, so this doesn't affect them).

**Test:** `src/__tests__/bugs/lane-b.test.tsx`, new
`describe("B3: Cancel on a habit rename does not save the draft")`. Renders
`HabitManager` directly (it takes only a `syncNow` prop and reads the real store, so
no Clerk/TanStack-Query shell is needed — WorkoutsTab's other tests in this file
document why *that* component can't be rendered standalone). The test types a
draft, then reproduces the real mousedown-before-click race precisely:
`fireEvent.mouseDown(cancelBtn)` returns `false` when the handler called
`preventDefault()` (matching a real browser suppressing its default focus-change
action); the test only fires a manual `blur` when that return value is `true` (not
prevented) — so it fails against the pre-fix code (blur fires, commits the draft,
Cancel becomes a no-op-that-saves) and passes against the fix (preventDefault ->
no blur -> click reaches `cancelEdit`). Asserts the label is unchanged and the
input is gone (edit mode exited via cancel, not save).
`WorkoutsTab.tsx`'s half is the identical two-line pattern and is additionally
pinned by BUG-15's existing source-check test in the same file plus a direct read
of the diff — I did not add a second render-based test for it given the
Clerk/TanStack-Query shell that lane already flagged as out of scope.

---

## 4. B2 mitigation — recoverable backup for the v4→v5 cutoff migration

**Where:** `src/hooks/useWorkoutStore.ts`:
- `migrateHabitsState`'s `if (version < 5)` block, `:203-247` — now also copies every
  removed `{habitId, date}` into a `habitFalseBackupV5` map before deleting it,
  merging with any pre-existing backup rather than replacing it.
- `WorkoutState` interface, `:320-325` — new persisted field
  `habitFalseBackupV5: Record<string, DailyHabitRecord>`.
- Initial state (`:415`) and `freshAccountState()` (`:868`) both seed it to `{}`.
- `partialize` (`:826-844`) includes it (so it survives a reload).
- `getSyncPayload`/`getSyncDelta` (`:388-420`, `:704-753`) do **not** reference it —
  they destructure only the specific fields they send, so it was already excluded
  by construction; confirmed by a direct test rather than just reading the code.

The cutoff itself (`CUTOFF = "2026-08-25"`) is unchanged — the brief was explicit
that it should stay, since before that date the "missed" tri-state didn't exist so
nothing genuine can be deleted by keeping it. This item is purely about making a
wrong cutoff recoverable by hand, not about changing the date.

**Test:** `src/__tests__/lib/habits.test.ts`:
- "backs up every removed `{habitId, date}` into `habitFalseBackupV5` before
  deleting it" — asserts the backup gets exactly the removed dates (`false`) and
  not the kept ones.
- "merges into an existing `habitFalseBackupV5` rather than replacing it".
- New `describe("habitFalseBackupV5 is local-only")` block: asserts it's absent
  from both `getSyncPayload()` and `getSyncDelta()`'s return objects, and present in
  the real `partialize` function pulled off the store's own persist options (not a
  reimplementation) when set.

---

## 5. SHOULD-FIX — theme bootstrap script died entirely on one bad key

**Where:** `src/app/layout.tsx:47-91`.

**Fix:** each key's `JSON.parse` now has its own `try` (skip non-JSON, keep
scanning); the `matchMedia` fallback + `classList.toggle` is a separate `try`
**outside** the loop, so a parse failure on `workout-store:adopted-by` (a bare
account-id string, not JSON) can no longer take the fallback down with it. Kept
tiny and dependency-free, no other behavior changed (still `break`s on first valid
theme found).

**Test:** new file `src/__tests__/lib/theme-bootstrap.test.ts`. Extracts the actual
inline script string out of `layout.tsx` (not a copy) and executes it via `new
Function(...)` against mock `localStorage`/`document`/`window` globals — so a
future edit that reintroduces one shared `try` is caught by running the real code.
Three cases: falls back to `matchMedia` when only a non-JSON key is present;
still finds a valid theme after skipping a non-JSON key that sorts first;
resolves `theme: "system"` via `matchMedia`.

---

## 6. SHOULD-FIX — `.anim-scale-in` had the BUG-29 defect

**Where:** `src/app/globals.css`, `@keyframes scale-in` (`:247-262`) and
`.anim-scale-in` (`:274-276`).

**Fix:** same two-line treatment already applied to `.anim-fade-up`: the `to`
keyframe now ends `transform: none` instead of `transform: scale(1)`, and the rule
uses `backwards` instead of `both`, so a `.anim-scale-in` element can no longer
become a permanent containing block for a `position: fixed` descendant.

**Checked the other `.anim-*` classes** per the brief: `.anim-fade-up` (already
fixed under BUG-29) and `.anim-stagger` (only sets `animation-delay`, no transform/
fill-mode) are the only other ones in the file. `@keyframes celebration-pulse` and
`@keyframes confetti-burst` exist but aren't wired to any `.anim-*` class (no
box-shadow/transform-holding class references them with `both`/`forwards`) — out of
this item's scope, flagged here for visibility only.

**Test:** `src/__tests__/bugs/lane-h.test.tsx`, new
`describe("S3: anim-scale-in should not leave a permanent non-none transform")`,
mirroring the existing BUG-H1/`anim-fade-up` CSS-fact checks exactly (same regex
pattern against the real `globals.css` file): the `to` keyframe ends on `transform:
none`, and the rule's fill-mode is not `both`/`forwards`.

---

## 7. Accepted-risk #2 — bootstrap push was still a full-map push

**Where:** `src/hooks/useSync.ts`, the `!hydrated.current` branch (~`:175-205`).

**Fix:** the one-per-load bootstrap push now sends `getSyncDelta()` instead of
`getSyncPayload()` — safe because `hydrateFromSync` has already run just above it in
the same branch, so dirty-wins has already settled every key, and the delta
correctly captures exactly the local work the server hasn't seen (offline edits, a
fresh install) with no special-casing needed. The push is skipped entirely when
nothing is dirty (checked directly off the delta's own shape — `completions`,
`logs`, `recovery`, `habits`, `level`, `tombstones` all absent — plus
`habitDefsDirty`, since `habitDefs`/`habitDefsVersion` are always present in the
delta but aren't themselves a dirty signal).

The unused `getSyncPayload` store selector binding was removed from `useSync.ts`
(the store method itself is untouched and still used directly by
`lane-e.test.ts`'s BUG-E1 test and elsewhere). Per the brief, the server
(`src/app/api/sync/route.ts`) still accepts a legacy full-map push (no `syncMode`)
unchanged — that path exists for older cached PWA bundles, not this client.

**Test:** new file `src/__tests__/integration/sync-bootstrap-push.test.tsx`
(happy-dom, `renderHook` + `QueryClientProvider`, mocked `fetch`):
- "skips the bootstrap push entirely when nothing is dirty" — mounts `useSync(true)`
  against a clean store and a `null` server response; asserts no `POST` ever fires.
- "sends a delta, not a full-map snapshot, when the bootstrap push does fire" —
  marks one completion dirty before mount; asserts the `POST` body has
  `syncMode: "delta"`, contains only the dirty `completions` key, and omits
  untouched top-level fields (`logs`, `recovery`) that a full-map push would have
  sent unconditionally.

---

## Files touched

- `src/hooks/useWorkoutStore.ts` — items 1, 4.
- `src/hooks/useSync.ts` — items 2, 7.
- `src/components/tabs/WorkoutsTab.tsx` — item 3.
- `src/components/settings/HabitManager.tsx` — item 3.
- `src/app/layout.tsx` — item 5.
- `src/app/globals.css` — item 6.
- `src/__tests__/bugs/b1-account-switch.test.ts` — new, item 1.
- `src/__tests__/integration/sync-account-switch.test.tsx` — new, item 2.
- `src/__tests__/bugs/lane-b.test.tsx` — extended, item 3.
- `src/__tests__/lib/habits.test.ts` — extended, item 4.
- `src/__tests__/lib/theme-bootstrap.test.ts` — new, item 5.
- `src/__tests__/bugs/lane-h.test.tsx` — extended, item 6.
- `src/__tests__/integration/sync-bootstrap-push.test.tsx` — new, item 7.

## Nothing I could not fix

All seven items were fixed and tested. Two things worth flagging that were
explicitly out of scope for this lane but adjacent to what I touched:

1. **B2's cutoff date itself** is still inferred from the commit timestamp, not a
   confirmed deploy date, per the brief's explicit instruction to keep the cutoff
   and only add a recovery mechanism. The pre-ship review's other recommendation —
   snapshotting `user:<uid>:data` from Redis before the first load of the new
   bundle — is an operational step outside this codebase and wasn't done here.
2. **WorkoutsTab.tsx's B3 fix has no direct render-based test** (only the source-check
   already in `lane-b.test.tsx` plus HabitManager's new behavioral test covering
   the identical pattern), because rendering `WorkoutsTab` standalone needs a
   Clerk/TanStack-Query shell that every other lane touching this file has
   documented as out of scope. The fix itself (identical two-line
   `onMouseDown`/`preventDefault` pattern) was verified by direct reading of the
   diff against HabitManager's now-tested version.
