# Pre-ship adversarial review — 2026-09-01

Reviewer stance: pessimistic. One real user, real data in production Redis and in one
phone's PWA localStorage, and the PWA can run a stale bundle for a while after deploy.

Gates re-run by me, not taken on the lanes' word:

- `npx tsc --noEmit` → exit 0, no output.
- `npx vitest run` → **51 files, 462 passed, 2 skipped, 0 failed.** (Every lane report
  claimed 2–3 failures "owned by another lane"; those are all gone now that the tree is
  assembled. The suite is genuinely green.)

Verification convention below: ✓ VERIFIED = I read and traced the code (and where noted,
ran it). ? INFERRED = pattern match only.

---

## BLOCKERS

### B1. `setPersistAccount()` writes the reset (empty) store into the **outgoing** account's localStorage key before it re-points persist. Signing out erases local data and every unpushed dirty mark.
**Where:** `src/hooks/useWorkoutStore.ts:871-873`

```ts
useWorkoutStore.setState(freshAccountState());   // <-- 871
persistApi.setOptions({ name: key });            // <-- 872
await persistApi.rehydrate();                    // <-- 873
```

`useWorkoutStore.setState` is zustand's persist-wrapped setState
(`node_modules/zustand/esm/middleware.mjs:363-367`): it calls `savedSetState(...)` and
then `setItem()`, and `setItem` reads `options.name` **at call time**
(`middleware.mjs:356-362`). At line 871 `options.name` is still the *previous* key. So
the empty `freshAccountState()` blob is serialized straight over the account you are
leaving.

The following `rehydrate()` does **not** repair it: `hydrate()` only calls `setItem()`
when `migrated === true` (`middleware.mjs:419-422`). Version 5 → version 5 is not a
migration, so nothing is written back.

✓ VERIFIED empirically against this repo's own zustand 5.0.12, reproducing the exact
call order:

```
after rehydrate     OLD = {"state":{"a":99},"version":5}
after setState()    OLD = {"state":{"a":0},"version":5}   NEW = {"state":{"a":99},...}
final               OLD = {"state":{"a":0},"version":5}   NEW = {"state":{"a":99},...}
```

**Failure sequence (real device, real consequence):**

1. Noel is signed in. `options.name === "workout-store:<uid>"`, and that key holds his
   habits, logs, completions **and the persisted `dirty` set** (`partialize`,
   `useWorkoutStore.ts:794-810`).
2. He signs out (or the Clerk session is revoked). `user` → null, so `accountId` → null
   and the effect at `src/app/page.tsx:40-53` fires `setPersistAccount(null)`.
3. Line 871 writes `{completions:{},logs:{},habits:{},habitDefs:defaults,
   habitDefsVersion:0,dirty:emptyDirty(),...}` into **`workout-store:<uid>`**.
4. Line 872 switches to `workout-store:signed-out`; line 873 rehydrates that.
5. He signs back in. `setPersistAccount(<uid>)` → `claimedBy === accountId` branch →
   rehydrates `workout-store:<uid>`, which is now the **empty** blob.

Damage: everything the server already has comes back on the next hydrate, so it mostly
looks fine — but three things are permanently gone:

- **Any unpushed local edit.** Offline gym taps that never reached the server. The
  persisted `dirty` set exists precisely so those survive a reload; this wipes it.
- **The BUG-13 migration's tombstones.** The v4→v5 block (`useWorkoutStore.ts:203-232`)
  deletes the pre-cutoff `false` dates locally and records them in `dirty.habits` so the
  *next* delta push tombstones them server-side. If sign-out lands before that push, the
  marks are gone, the server still holds the `false` values, and the next hydrate
  re-imports every one of them as a red "missed" X. BUG-13 silently un-fixes itself, with
  no second chance (the migration only runs once, at version 4→5).
- Same for any `clearHabit()` the user performed that had not yet been acked.

**Also hits the very first load of the new bundle** (less severe, still wrong): the store
starts on `LEGACY_STORE_KEY` (`:792`), the legacy value is copied to the scoped key at
`:856`, and then line 871 blanks `workout-store` itself. `mirrorToLegacyFrom` does not
help — it only fires on subsequent writes (`:266-271`). So between that moment and the
next store mutation, an older cached PWA bundle reading `workout-store` sees an empty
store, which is the exact thing the mirror was built to prevent.

**Fix sketch:** do not let the reset touch the outgoing key. Either capture the incoming
key's raw string first, `setOptions({name})`, `setState(fresh)`, restore the captured
string, then `rehydrate()`; or reset through the un-wrapped store `set` so no `setItem`
fires; or repoint the name to a scratch key for the duration of the reset.

**Untested.** `src/__tests__/bugs/lane-e.test.ts:44-52` (BUG-E1) never signs the previous
account *in* — it never calls `setPersistAccount("user-a")` — so the store is still on the
legacy key when the switch happens and the wipe is invisible to the test.

---

### B2. Migration v4→v5 permanently deletes real habit history on a cutoff that predates the actual deploy.
**Where:** `src/hooks/useWorkoutStore.ts:212` — `const CUTOFF = "2026-08-25";`

The block deletes every `habits[id][date] === false` with `date <= "2026-08-25"` and
tombstones it, so the server copy goes too (`src/app/api/sync/route.ts:157-178`). This is
an **irreversible destructive migration of the only user's real data**, executed
automatically on first load, with no backup step and no undo.

Two concrete problems:

1. **The cutoff is the commit date, not the deploy date.** The comment at `:204-211`
   pins it to commit `989297d`, "2026-08-26 15:14 ET". A PWA runs a cached bundle after
   deploy — the ledger says so explicitly. So every `false` written by the *old binary
   toggle* between 2026-08-26 00:00 and whenever the phone actually picked up the new
   bundle is **kept** and will keep rendering as a deliberate red X
   (`src/components/progress/HabitCard.tsx:111-125`). The fix under-reaches by exactly the
   stale-bundle window it was written to account for.
2. **It cannot be re-run.** Once the persisted version is 5, the block never executes
   again. If the cutoff is wrong, there is no second pass, and the deleted data is gone
   from both localStorage and Redis.

**Fix before deploy (cheapest option):** snapshot `user:<uid>:data` from Redis to a file
before shipping, and confirm the real cutoff date with Noel (when did his phone actually
load the tri-state build?) rather than inferring it from the commit timestamp.

The migration's own unit test (`src/__tests__/lib/habits.test.ts`,
`describe("migrateHabitsState (v4 -> v5)")`) tests the mechanics, not the choice of date.

---

### B3. "Cancel" on habit rename now commits instead of cancelling.
**Where:** `src/components/tabs/WorkoutsTab.tsx:337-348` (input `onBlur`) vs `:373-377`
(the Cancel button); identical pair in
`src/components/settings/HabitManager.tsx:145-155` vs its own cancel control.

Sequence: the user is renaming, has typed a draft, changes their mind, taps the ✕
"Cancel" button.

1. `mousedown` on Cancel blurs the `<input>`.
2. `onBlur` runs: `trimmed` is non-empty → `renameHabit(editingHabitId, trimmed)` +
   `syncNow()`, then `setEditingHabitId(null)`.
3. React re-renders; `editingHabitId === h.key` is now false, so the whole
   `<>…Cancel…</>` branch at `:366-378` **unmounts**.
4. The `click` never lands on the button. `cancelRenameHabit` is never called.

So the visible Cancel affordance is not merely a no-op — it silently performs the save.
`Escape` still works (it does not move focus), but a tap-driven phone UI has no escape
key. This is a behaviour regression introduced by the BUG-15 fix, not a pre-existing bug.
fix-s3.md acknowledges "Cancel becoming a no-op"; it is worse than a no-op.

**Fix:** `onMouseDown={(e) => e.preventDefault()}` on the Cancel button (or a
`cancellingRef` set in `onPointerDown` and checked at the top of `onBlur`).

**Untested.** `src/__tests__/bugs/lane-b.test.tsx:292-302` is a source-text regex
(`expect(onBlurBlock).toMatch(/renameHabit\(editingHabitId, trimmed\)/)`) — it passes
happily while Cancel is broken.

---

## SHOULD FIX (cheap, fix before deploy)

### S1. `hydrated.current` in `useSync` is never reset, so a second account never gets its first-load hydrate.
**Where:** `src/hooks/useSync.ts:66` (`useRef(false)`), `:140` (`if (!hydrated.current)`).

`useSync` is now a single instance owned by `page.tsx:56` and it is never remounted across
a sign-out/sign-in — only its `enabled` argument flips. After the first account hydrates,
`hydrated.current` stays `true` forever. When a different account signs in,
`queryClient.clear()` (`page.tsx:47`) forces a fresh GET, but the effect falls into the
`else if` at `:150`, which requires `serverData && serverTs && serverTs !== lastServerUpdate.current`.
If the new account has no data (`serverData === null`, which is exactly the new-account
case BUG-09 was about) **nothing hydrates at all**, and the bootstrap full push at `:149`
never runs either. Meanwhile the auto-push subscription is armed (`:193` passes), so the
new account starts pushing deltas without ever having read the server.
**Fix:** reset `hydrated.current = false` and `lastServerUpdate.current = null` in an
effect keyed on `enabled` (or on the account id).

### S2. The theme bootstrap script aborts entirely — including its `matchMedia` fallback — if any `workout-store*` key fails to `JSON.parse`.
**Where:** `src/app/layout.tsx:56-79`.

The loop matches `k.indexOf('workout-store') === 0`, which also matches
`workout-store:adopted-by` (`useWorkoutStore.ts:247`), whose value is a bare account id
string, not JSON. `JSON.parse` throws, and because `JSON.parse`, the `matchMedia`
resolution and `classList.toggle` all live inside **one** `try`, the throw skips the
fallback too — the dark-OS user gets the light theme, which is the exact defect BUG-08 was
opened for. Today the legacy key enumerates first and `break`s before reaching
`adopted-by`, so it happens to work; it stops working the moment the legacy key is absent
while `adopted-by` survives.
Secondary: the `break`-on-first-match makes the applied theme account-nondeterministic
once two accounts each have a scoped key.
**Fix:** wrap only the `JSON.parse` in its own `try`, and compute the `matchMedia`
fallback outside the loop's try.

### S3. `.anim-scale-in` still has the BUG-29 defect that `.anim-fade-up` was fixed for.
**Where:** `src/app/globals.css:247-256` (`@keyframes scale-in` ends
`transform: scale(1)`) and `:268-270` (`.anim-scale-in { animation: … both; }`).

`scale(1)` is a non-`none` computed transform, and `both` holds it forever, so any
`.anim-scale-in` element is a permanent containing block for `position: fixed`
descendants — the identical mechanism lane H documented. Today it is latent: the five call
sites (`WeekRhythm.tsx:57`, `BottomNav.tsx:54`, `BodySilhouette.tsx:463,485`,
`LandingPage.tsx:111`, `CountdownIntro.tsx:103`) contain no fixed overlay, and `Sheet.tsx`
(`fixed inset-0 z-50`, **not** portaled) never renders inside one. But the *class* of bug
was only half-fixed, and `Sheet` is one refactor away from being trapped.
**Fix:** same two-line treatment — `transform: none` in the `to` keyframe, `backwards`
instead of `both`.

### S4. `forceStop` leaves the loser's wake lock held.
**Where:** `src/components/tracking/CircuitTimer.tsx:356-359` and
`src/components/tracking/RepTimer.tsx:241-244`.

`forceStop` only does `setRunning(false); setShowCountdown(false)`. When timer B claims the
registry slot (`src/lib/audio.ts:305-311`) and force-stops A, A's `wakeLockRef.current` is
still a live sentinel. The screen stays awake on A's behalf until A unmounts or is reset.
Battery, not correctness — but trivially fixed by releasing the lock inside `forceStop`.

### S5. `mergeCompletionsPreferTrue` is still OR-ing under the new delta contract.
**Where:** `src/hooks/useWorkoutStore.ts:588-592`, `:75-86`.

Under deltas, a `false` arriving from the server for a **non-dirty** completion key is now
a genuine, deliberate untoggle from another device, not a stale echo. `restoreLocal` only
protects dirty keys; for everything else `mergeCompletionsPreferTrue` still does
`merged[key] = Boolean(local) || Boolean(incoming)`, so a remote untoggle can never be
adopted. Habits got the correct dirty-wins treatment (`:614-627`); completions kept the
old net. One user, one device today, so the impact is near-zero — but the two maps now
follow contradictory rules and the comment at `:571-574` half-acknowledges it.

### S6. `recovery` is exempt from dirty-wins on hydrate.
**Where:** `src/hooks/useWorkoutStore.ts:594-608`.

The recovery deep-merge consults no dirty marks at all, so a locally-dirty recovery field
can still be overwritten field-by-field by a stale server copy on hydrate. fix-s1.md calls
this deliberate (the Oura/cron write path depends on server fields landing). Fine as a
decision; it should be in the file's comment, because `getSyncDelta` *does* tombstone
recovery keys (`:728-730`), so the two halves of the contract disagree.

---

## ACCEPTED RISK (ship, but Noel should be told)

1. **`syncMode` is validated and then never read.** `src/lib/validators.ts:84` accepts it;
   `src/app/api/sync/route.ts:128` destructures everything except `syncMode`. Legacy and
   delta pushes take byte-identical server paths. This is fine — the fix is entirely
   client-side (send less) — but it means the server has **no defence** against a
   full-map push. Directly answering the brief's question: there is **no path where an
   empty delta wipes anything.** `deepMerge` (`:143-153`) is purely additive; absence never
   deletes; only an explicit `tombstones` entry deletes. An empty delta is a no-op plus an
   `updatedAt` bump. ✓ VERIFIED by trace.
   `syncBodySchema` is a plain `z.object`, so unknown keys are **stripped**, not rejected
   — a future client field silently vanishes rather than 400-ing.

2. **The one bootstrap push per load is still a full-map, last-write-wins push.**
   `src/hooks/useSync.ts:149` sends `getSyncPayload()` with no `syncMode` and no
   tombstones. BUG-01 is unfixed for that push. Its window is small (immediately after a
   fresh GET) and there is one device, so I would ship it — but the ledger's "BUG-01
   FIXED" should read "fixed for every push except the first one after each load."

3. **BUG-13's tombstones do not go out on the bootstrap push.** They ride the *first delta*
   instead, which is triggered because `hydrateFromSync` changes `state.habits`'s identity
   and the subscription (`useSync.ts:192-211`) fires ~500 ms later. Answering the brief
   directly: **a tombstone push cannot fire before hydrate** on the automatic path — the
   subscription bails on `!hydrated.current` (`:193`), and `hydrated.current` is set at
   `:146` before `hydrateFromSync` at `:148`. And **hydrate cannot resurrect the cleared
   dates**: `mergeDailyHabit` skips any date carrying a dirty mark (`:622`), and the
   migration always leaves the habit's record object in place (`:228`) so the
   `localRec ? … : {}` guard at `:641` resolves to the real dirty set. ✓ VERIFIED.
   (`syncNow()` at `:229-231` does bypass the `hydrated` guard, but a pre-hydrate delta is
   harmless — it carries only dirty keys and correct tombstones.)

4. **A permanent 400 deadlocks sync silently.** `retry` returns `false` for a permanent 4xx
   (`useSync.ts:95-98`), `clearDirty` runs only in `onSuccess` (`:116`), and `dirty` is
   persisted. So one payload the schema rejects (an over-long note, a stray habit-date key
   that fails `/^\d{4}-\d{2}-\d{2}$/` at `validators.ts:90`) makes every subsequent delta
   fail forever, with the UI showing only a red dot and "Sync failed"
   (`SyncIndicator.tsx:26-33`). Not a regression — the old full-map push had the same
   property — but the dirty set now makes it sticky across reloads too.

5. **Redis `user:<uid>:data` still has no size cap or TTL** and now additionally carries
   whatever the tombstone-free history accumulates. Flagged as "not covered" in the ledger
   and still not covered.

6. **`public/sw.js` cache version is a manual per-deploy step.** The v5→v6 bump plus the
   comment is correct, but nothing enforces it. The next deploy that forgets it serves the
   previous shell.

7. **BUG-22 (production Clerk running development keys) is untouched by all five lanes.**
   It is a config change, not code, but it is still true at deploy time.

---

## TEST QUALITY

Green suite, but several of the newly-passing tests prove less than the reports imply.

**Source-text assertions — these are not behavioural proof.** They assert that a regex
matches the file's own source. They will pass against a refactor that reintroduces the bug
under different syntax, and they cannot catch a semantic regression (B3 above is the live
example):

- `src/__tests__/bugs/lane-f.test.ts:156-158` — BUG-11 `key={key}`.
- `src/__tests__/bugs/lane-b.test.tsx:261-267` — BUG-05 one-`useSync`.
- `src/__tests__/bugs/lane-b.test.tsx:292-302` — BUG-15 rename-commit. Passes while the
  Cancel button is broken.
- `src/__tests__/bugs/lane-e.test.ts:88-91` — BUG-09. Explicitly asserts the presence of
  the literal strings `isSuccess: fetched` and `if (!fetched) return;`. No hook is
  rendered; nothing about the auto-push gate is exercised.
- `src/__tests__/bugs/lane-h.test.tsx` CSS-fact tests — regex over `globals.css`.

**Rewritten-to-pass.** Every one of these is documented in-file, which is good practice,
but the ledger's original assertion no longer exists:

- **BUG-A1 / BUG-A2** (`lane-a.test.ts`) — the originals demanded contradictory leaf rules
  from one payload shape. The rewrite is defensible and the reasoning in fix-s1.md is
  sound, but the rewritten tests now assert the *delta* contract, i.e. they can only fail
  if the client stops sending deltas — they no longer test the server merge at all.
- **BUG-E1** (`lane-e.test.ts:44-52`) — rewritten to call `setPersistAccount`, but never
  signs the first account in, so it does not exercise the account-switch path and misses
  B1 entirely.
- **BUG-E2**, **BUG-B3** — converted to source checks (see above).
- **BUG-C2, BUG-C3** (`lane-c.test.tsx`) — C3's original two-concurrent-timers repro was
  replaced with two mechanism tests after the harness proved unable to run a second
  concurrent `CountdownIntro` clock. fix-s2.md is honest about this. Net effect: **the
  actual "two timers audible at once" scenario from BUG-07 is still not covered by any
  test**, only the mutual-exclusion primitive is.
- **BUG-B2** and the "re-tapping the active check button" test (`lane-b.test.tsx`) —
  rewritten because the originals pinned the old behaviour. Correct call.

**Still failing / skipped, i.e. still-open bugs in the tree:**

- `src/__tests__/bugs/lane-a.test.ts:124` — `it.fails("seeds default habits for a
  v2-persisted user whose habitDefs is an empty array")`. Still an unfixed bug, not
  claimed by any of the five fix lanes.
- `src/__tests__/bugs/lane-d.test.tsx:77,88` — two `it.skip` placeholders.

**Genuinely good, behavioural coverage** (worth saying so): the six new
`src/__tests__/api/*.test.ts` 401 tests call the real route handlers with
`setMockUserId(null)` and assert status 401 + `content-type: application/json` +
`error === "Unauthorized"`. The Clerk mock (`src/__tests__/mocks/clerk.ts`) replaces only
`auth()`, so the handler's own guard is what produces the 401 — the guard is not mocked
away. `middleware.test.ts` separately proves middleware will not shadow those handlers.
The sync-flow / hydrate-prefer-true / habit-defs integration tests hit the real store and
the real route with a mock Redis.

---

## ROUTES — independent check

Six paths added to `isPublicRoute` (`src/middleware.ts:22-27`). I enumerated every
`route.ts` under `src/app/api` and grepped each for its own `auth()` + 401:

- `/api/recovery`, `/api/chat`, `/api/labs`, `/api/biomarkers`, `/api/health-goals` — each
  has exactly one `route.ts`, each with `auth()` + JSON 401. **No nested `route.ts` exists
  under any of the six prefixes**, so nothing is silently unguarded. ✓ VERIFIED.
- `/api/extract-metrics` — had **no** handler-level guard and would have been opened to the
  world (an Anthropic-billed image endpoint). S4 caught it and added one at
  `src/app/api/extract-metrics/route.ts:50-56`, before `req.json()`. ✓ VERIFIED. This was
  the single most dangerous thing in the diff and it was handled correctly.
- Worth knowing: the pre-existing `/api/health(.*)` pattern already matches
  `/api/health-insights` as well as `/api/health-goals`. `health-insights/route.ts` has its
  own `auth()` + 401, so it is fine — but it has been public at the middleware layer this
  whole time by accident, and the new explicit list does not mention it.
- `/api/oura/status|sync|disconnect` are still protected-by-middleware and still return
  HTML 404s to `fetch()`. BUG-26 was worked around client-side (`enabled` gate) rather than
  fixed; S4 flags this and it is out of scope, but the underlying BUG-12 mechanism is still
  live on those three routes.

---

## THEME BOOTSTRAP — independent check

- Prefix `'workout-store'` still matches every key the new scoping produces
  (`workout-store`, `workout-store:<uid>`, `workout-store:signed-out`). ✓ VERIFIED against
  `storeKeyForAccount` (`useWorkoutStore.ts:249-250`).
- No hydration mismatch: the script only mutates `documentElement.classList`, and
  `suppressHydrationWarning` is on `<html>` (`layout.tsx:45`). ✓
- Blocked/throwing `localStorage`: caught, but the fallback dies with it — see S2.
- `useTheme`'s `applyTheme` is an idempotent `classList.toggle`, so the later Settings
  mount cannot fight the bootstrap. ✓

## TIMERS — independent check

- **Can a timer get stuck paused?** No. Collapse sets `running=false` via the render-phase
  adjustment (`CircuitTimer.tsx:172-180`, `RepTimer.tsx:118-126`); re-expanding does not
  auto-resume, but pressing play takes the `else` branch of `togglePause`
  (`CircuitTimer.tsx:382-386`) / `start()`'s resume path (`RepTimer.tsx:257-262`), which
  re-claims the registry and sets `running=true` with progress intact. ✓ VERIFIED by trace.
- **Registry safety:** `releaseActiveTimer` is token-guarded (`audio.ts:307-311`), so a
  collapsing card cannot release a slot another card holds. ✓
- **Portal SSR:** `useState(() => typeof document !== "undefined" ? document.body : null)`
  returns `null` server-side and renders `null` (`CountdownIntro.tsx:133-135`). Strictly
  this is a hydration divergence, but `CountdownIntro` only ever mounts in response to a
  tap, long after hydration, so it cannot bite. ✓
- **z-index:** `z-[60]` (`CountdownIntro.tsx:100`) beats `Sheet` `z-50`
  (`Sheet.tsx:72`) and `BottomNav` `z-50` (`BottomNav.tsx:28`). Correct, and portaling to
  `document.body` puts it in the root stacking context so the ordering actually applies. ✓
- **Unmount cleanup:** the clock effect's cleanup calls `clockRef.current?.stop()` and
  clears the `goTimeout` (`CountdownIntro.tsx:66-71`). ✓
- **`fill-mode: both` → `backwards`:** I checked every `opacity: 0` in `globals.css` — all
  three (`:224, :232, :249`) are inside `@keyframes`, none is a base class rule. No element
  relies on the animation holding `opacity: 1`. ✓ VERIFIED.

---

## BOUNDARY CHECK — files changed vs. lane reports

Every modified/added file is claimed by at least one of the five reports. Mapping:

| File(s) | Claimed by |
|---|---|
| `useWorkoutStore.ts`, `useSync.ts`, `api/sync/route.ts`, `validators.ts`, `types/workout.ts`, `SettingsTab.tsx`, `SyncIndicator.tsx` | S1 |
| `CircuitTimer.tsx`, `RepTimer.tsx`, `CountdownIntro.tsx`, `ConfettiBurst.tsx`, `SessionCard.tsx`, `audio.ts`, `globals.css` | S2 |
| `layout.tsx`, `Heatmap.tsx`, `WeekRhythm.tsx`, `StreakCounter.tsx`, `SunBanner.tsx` | S3 |
| `middleware.ts`, `api/labs/route.ts`, `api/extract-metrics/route.ts`, `ExportButton.tsx`, `public/sw.js`, `__tests__/api/*` | S4 |
| `HabitCard.tsx`, `HabitManager.tsx`, `useConnectedAccounts.ts` | S5 |
| `WorkoutsTab.tsx` | S3 (key, rename) + S5 (cycle, SyncStatus) |
| `page.tsx` | S1 (account scoping, branch order) + S5 (oura gate, SyncStatus) |

No unclaimed file. Three things worth naming anyway:

1. **`api/labs/route.ts` "delete" case** (`:74-79`) also gained a `redis.del(health-goals)`.
   S4 flags this itself as beyond the letter of BUG-10. It is the same root cause and
   correct, but it is scope creep on a route that touches the user's lab data.
2. **BUG-29 does not exist in the ledger.** `notes/BUGS-2026-09-01.md` stops at BUG-28; the
   CountdownIntro-trapped-by-transform finding lives only in `notes/bugs/lane-h.md`. The
   `globals.css` and `CountdownIntro.tsx` changes therefore trace to a lane report but not
   to the ranked ledger the deploy is nominally scoped by.
3. **`storage: createJSONStorage(() => accountStorage)`** (`useWorkoutStore.ts:793`) is new
   and changes SSR behaviour subtly: persist previously fell into zustand's
   "storage unavailable" warn path when `window` was absent; it now gets a real storage
   object whose `getItem` returns `null`. Harmless (`merge(undefined, current)`), but it is
   a behaviour change nobody asked for and no report mentions.

---

## Recommendation

Do not deploy until **B1** is fixed — it is a one-ordering-line bug that silently discards
unpushed data on every sign-out, and it directly undoes B2's migration. Fix **B3** at the
same time (three lines) so Cancel stops saving. Take a Redis snapshot of
`user:<uid>:data` before the first load of the new bundle regardless, because the v4→v5
migration is destructive, one-shot, and keyed on a date that was inferred rather than
confirmed.
