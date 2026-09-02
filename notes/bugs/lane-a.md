# Lane A report

## Findings (VERIFIED)

### 1. Server-side sync merge is last-write-wins per leaf key, silently erasing a completed set on a concurrent push (re-opens the V19 P0 class of bug at the storage layer)
Severity: P0 data loss
Status: VERIFIED (test)
Where: `src/app/api/sync/route.ts:92-102` (`deepMerge`), used at `src/app/api/sync/route.ts:117`
Repro (also encoded as `BUG-A1` in `src/__tests__/bugs/lane-a.test.ts`):
1. Device A completes a set, `POST /api/sync` with `{ completions: { "k": true } }`.
2. Device B's debounced sync fires afterward carrying its own stale full `completions` snapshot (taken before A's push landed), `POST /api/sync` with `{ completions: { "k": false } }`.
3. GET the stored blob back.
Expected: `completions["k"]` stays `true` (A's real, later-in-time completion should not be erased by B's stale snapshot).
Actual: `completions["k"]` is `false` — B's push wins outright because it landed second.
Root cause: `deepMerge` (route.ts:92-102) recurses into nested objects but at a leaf (a boolean under `completions`, `habits`, or a recovery field) does `result[k] = v`, i.e. plain overwrite. Every debounced push (`useSync.ts` `getSyncPayload()`) sends the client's *entire current* `completions`/`habits` maps, not a diff, so whichever device's full-state push is processed last by the WATCH/MULTI transaction wins every key it includes — even a stale one. The store's own code comments (`mergeCompletionsPreferTrue`, "V19 P0: ... Guards against the regression that ate a full workout today") show this exact race was already hit once and was fixed — but only on the client's hydrate-down path (`hydrateFromSync`/`mergeCompletionsPreferTrue`). The server's own persisted copy, which is what every device eventually re-hydrates from, has no such protection.
Evidence: `src/__tests__/bugs/lane-a.test.ts` test `BUG-A1`, `it.fails(...)`. With `it()` instead of `it.fails()` (checked, then reverted) it fails with:
```
AssertionError: expected true to be false // Object.is equality
 ❯ src/__tests__/bugs/lane-a-check.test.ts:52:52 (BUG-A1 body, same assertion shape)
```
Proposed fix: give the server the same prefer-true (or otherwise conflict-aware) merge rule for `completions` and `habits` leaves that the client already uses on hydrate, instead of plain `result[k] = v`. This does touch the sync storage format's merge semantics (not the schema itself), so it should be reviewed as a behavior change to `deepMerge`, not a pure bugfix.

### 2. Same server-side last-write-wins race applies to the new tri-state habit data, and can turn an explicit "missed" back into "done"
Severity: P0 data loss (silently reverses the user's explicit correction)
Status: VERIFIED (test)
Where: `src/app/api/sync/route.ts:92-102`, `117`
Repro (`BUG-A2` in `src/__tests__/bugs/lane-a.test.ts`):
1. Device A explicitly marks "meditation" as **missed** today: `POST { habits: { meditation: { "2026-09-01": false } } }`.
2. Device B, unaware of A's correction, pushes its own stale full state where that day is still `true`: `POST { habits: { meditation: { "2026-09-01": true } } }`.
3. GET the stored blob.
Expected: the explicit miss recorded in step 1 survives.
Actual: `habits.meditation["2026-09-01"]` is `true` — B's stale push silently un-misses the day.
Root cause: identical to Finding 1, applied to the `habits` map. This is worse than Finding 1 in effect because the whole point of the tri-state feature (989297d) is that `false` is meaningful, deliberately-entered data ("explicitly missed"), not an absence — yet the merge treats it exactly like a stale/absent value that any later `true` beats.
Evidence: `src/__tests__/bugs/lane-a.test.ts` test `BUG-A2`. Un-wrapped run:
```
AssertionError: expected true to be false // Object.is equality
 ❯ src/__tests__/bugs/lane-a-check.test.ts:81:72
```
Proposed fix: same as Finding 1 — the leaf-merge policy needs to be conflict-aware (e.g. carry a per-key last-modified marker from the client, or explicitly special-case the tri-state semantics) rather than blind last-write-wins.

### 3. Client-side hydrate merge (`mergeDailyHabit`) still uses the pre-tri-state prefer-true rule, so an explicit local miss can be overwritten by a hydrate carrying a stale `true`
Severity: P1 wrong behaviour user will hit
Status: VERIFIED (test)
Where: `src/hooks/useWorkoutStore.ts:402-410` (`mergeDailyHabit`, used inside `hydrateFromSync`)
Repro (`BUG-A3` in `src/__tests__/bugs/lane-a.test.ts`):
1. Local store state: `habits.meditation["2026-09-01"] = false` (user tapped "missed" today).
2. `hydrateFromSync({ habits: { meditation: { "2026-09-01": true } } })` runs (e.g. the periodic re-hydrate effect in `useSync.ts:74-78` firing because `serverTs` changed, or the very next GET after Finding 2's server-side clobber already turned the stored value back to `true`).
3. Read `useWorkoutStore.getState().habits.meditation["2026-09-01"]`.
Expected: stays `false`.
Actual: becomes `true`.
Root cause: `mergeDailyHabit` (`useWorkoutStore.ts:402-410`) does `merged[date] = Boolean(merged[date]) || Boolean(value)` — the exact same prefer-true rule as `mergeCompletionsPreferTrue`, copy-pasted for the habits map. That rule is correct for plain boolean "did you do it" completions (where `false` really does just mean "not yet," and a race is between "not yet" and "yes"), but 989297d gave the habits map a third meaningful state (explicit miss) without updating this merge function to match. It is functionally the client-side twin of Finding 2: even setting aside the server-side race, simply receiving *any* stale `true` from a hydrate will always beat a genuine local `false`.
Evidence: `src/__tests__/bugs/lane-a.test.ts` test `BUG-A3`. Un-wrapped run:
```
AssertionError: expected true to be false // Object.is equality
 ❯ src/__tests__/bugs/lane-a-check.test.ts:81:72 [see BUG-A3 body]
```
Proposed fix: `mergeDailyHabit` needs to stop treating `false` as "no information yet." A minimal option: only apply prefer-true when the local value is `undefined` (i.e. server can fill in a gap, but can never override an explicit local `true` or `false`); anything more precise needs a per-entry timestamp, which is a real schema change and should be scoped separately.

### 4. Pre-989297d "unchecked" days (stored as `false` by the old binary toggle) now render as an explicit red "missed" X
Severity: P2 visual/UX (existing history is silently reinterpreted, not lost)
Status: VERIFIED (trace)
Where: `src/components/tabs/WorkoutsTab.tsx:129,132` and `src/components/progress/HabitCard.tsx:106-119`
Repro: any habit day that was toggled on then back off before commit `989297d` (2026-08-26), using the pre-existing `toggleHabit` action (`useWorkoutStore.ts:296-302`, unchanged by 989297d — it flips `!state.habits[id]?.[date]`, so an old "check then uncheck" already wrote a literal `false`, not a deleted key).
Expected/prior behaviour: `git show 989297d^:src/components/tabs/WorkoutsTab.tsx` shows `logged: !!map[d.key]` — both `undefined` and `false` coerced to the same falsy render (empty circle, no icon) in the old `HabitCard`.
Actual (current code): `WorkoutsTab.tsx:132` — `recentDays: last7.map((d) => ({ ...d, logged: map[d.key] }))` — passes the raw tri-state value through uncoerced, and `WorkoutsTab.tsx:129` — `statusToday: map[today]` does the same for the big toggle. `HabitCard.tsx:109-118` then explicitly renders `d.logged === false` as `var(--danger)` background with a close icon (red X). Any pre-existing `false` from the old toggle behavior — which meant nothing more than "not currently checked" — is now indistinguishable from a brand-new, deliberate "explicitly missed" mark and is redrawn in red across the whole 7-day strip and the big-button state.
Evidence: `git show 989297d -- src/components/progress/HabitCard.tsx src/components/tabs/WorkoutsTab.tsx` (quoted diff, both old `!!map[...]` coercion and the new raw pass-through are visible in the same diff); current lines quoted above read directly from `WorkoutsTab.tsx` and `HabitCard.tsx` on HEAD. Not covered by an automated test — this is a rendering/interpretation regression on historical data, not a pure-function bug, and exercising it meaningfully would require seeding pre-migration habit data through the real component tree with RTL, which was out of budget for this lane.
Proposed fix: this is a one-time data-shape ambiguity introduced by 989297d rather than an ongoing bug — the cleanest fix is a one-time local migration (bump the persist `version`) that cannot distinguish old "off" from new "missed" either, so the honest fix is probably a product decision (e.g. treat all pre-989297d-timestamp data as "unrecorded" by wiping to `undefined` for dates before the feature shipped, if a per-entry timestamp existed — it doesn't) rather than a code fix. At minimum this should be flagged to Noel as a known, accepted data-reinterpretation rather than silently left as a surprise.

## Findings (INFERRED)

### 5. `RecoveryTab`'s `selectedDate` (and the apparently-dead `RecoveryPanel`'s) is captured once via `useState(todayKey())` and never advances at midnight
Severity: P2/P3 edge case
Where: `src/components/tabs/RecoveryTab.tsx:21`, `src/components/RecoveryPanel.tsx:23`
`RecoveryTab` is only mounted while `activeTab === "recovery"` (`src/app/page.tsx:104-108`, conditional render, not kept-mounted like `WorkoutsTab`), so `todayKey()` is recomputed fresh each time the user navigates *into* the tab. But if the user opens the Recovery tab and simply leaves it open (foregrounded, no tab switch) across local midnight, `selectedDate` stays pinned to the old day; any metric entered after midnight (`updateEntry` at `RecoveryTab.tsx:38-42`) writes under yesterday's date key instead of today's. Not verified with a test (would need fake timers + a mounted-component harness beyond this lane's scope) — flagged as inferred because I did not reproduce it, only traced the `useState` capture and the conditional-mount lifecycle that makes this the one place in the scoped files where `todayKey()` is memoized across renders rather than recomputed. `WorkoutsTab.tsx:120`'s own `const today = todayKey();` is a plain per-render call, not memoized, so it is NOT subject to this — H4 as originally phrased ("todayKey() memoised... an app left open past midnight keeps writing to yesterday's key") is false for `WorkoutsTab` specifically but true for `RecoveryTab`.
Additional note: `src/components/RecoveryPanel.tsx` appears to be dead code — grepped for imports across `src/app` and `src/components` and found no consumer; the live recovery UI is `src/components/tabs/RecoveryTab.tsx`, a near-duplicate. Worth a follow-up cleanup task, out of scope here.

### 6. `mergeHabitDefs`'s equal-version content tiebreaker (`JSON.stringify(a) > JSON.stringify(b)`) picks a winner by string sort order, not recency
Severity: P3 (defensive code path, could not construct a realistic trigger within budget)
Where: `src/hooks/useWorkoutStore.ts:90-95`
As designed and commented ("defense, kept from the original design"), this only fires when local and incoming report the *same* server-assigned version with *different* content and the local side is not `habitDefsDirty`. Every mutation action (`addHabit`/`renameHabit`/`removeHabit`/`moveHabit`) sets `habitDefsDirty: true`, and the server (`resolveHabitDefs` in `sync/route.ts`) never itself produces two different content blobs under the same version for one user — a version only advances on an actual accepted content change, and an idempotent identical re-push doesn't bump the version because content is unchanged. I could not construct a realistic sequence of legitimate client actions that reaches "same version, different content, not dirty" within this lane's time budget, so I'm not confident this is reachable outside of manual localStorage tampering or a genuine bug elsewhere. If it is reachable, the practical effect would be: whichever habit list happens to JSON-stringify "greater" (e.g. alphabetically later ids/labels) wins regardless of which device made the real edit, which would read as an arbitrarily "silently reverted rename." Flagging for someone with more time to dig at the multi-device edit-during-migration boundary (first-run seeding, `mergeHabitDefs.ts:89` `localEmpty` path) where two fresh installs could both start at version 0.

## Hypotheses killed

- **H2** (streak grace-period divergence across consumers): `calculateDailyHabitStreak` (`helpers.ts:118-131`) has an explicit today-grace exception; `getBestDailyHabitStreak` (`helpers.ts:153-164`) does not, but this doesn't produce a visible discrepancy — `getBestDailyHabitStreak` is a backward scan over 365 days computing a *historical max*, and since a "best" streak run is always fully recorded before reaching `i === 0`, whether `i === 0` breaks the *current* running counter or not cannot change an already-recorded `best`. Traced `helpers.ts:153-164` line by line with a habit `{yesterday: true, dayBefore: true, today: undefined}`: `best` is set to 2 at `i=1`, and the `i=0` iteration (current resets to 0) never revisits `best`. No other streak/heatmap/momentum consumer in `src/components/progress/*` reads the daily-habit record at all — `Heatmap.tsx`, `MomentumChart.tsx`, `WeekRhythm.tsx`, `StreakCounter.tsx` all operate on the separate scheduled-workout `completions`/`sessionKey` data, not `habits`/`calculateDailyHabitStreak`.

- **H3** (server crons compute "today" in UTC vs. the user's local write): False for the in-scope crons. `src/app/api/cron/send-status/route.ts` and `send-reminder/route.ts` both resolve the user's own IANA timezone via `localTimeParts`/`dateKeyInTimezone` (`src/lib/reminderMessage.ts:280-311`, using `Intl.DateTimeFormat` with `timeZone: prefs.timezone`), not server-local/UTC time. `src/app/api/cron/habit-status/route.ts` doesn't compute "today" at all — it's a read-only export keyed by an explicit `?date=` query param supplied by the caller (external `journal-nudge` script per the route's own comment), so any UTC-vs-local mismatch would live in that external caller, out of this repo's scope. (`todayKeyUTC` in `reminderMessage.ts:48-50` does use local `Date` getters rather than `getUTCFullYear()`/etc., so its name is misleading, but on Vercel's serverless runtime the process timezone is UTC, so it's not presently a live bug — flagged as a naming nit, not a bug.)

- **H4** (todayKey() memoized in the store, causing stale-date writes on an app left open past midnight): False as stated for the store — `useWorkoutStore` has no `todayKey`/date-of-day concept baked into state at all; every consumer calls the pure `todayKey()` function fresh. False specifically for `WorkoutsTab.tsx:120` (`const today = todayKey();` is a plain per-render call). True, but narrower than stated, for `RecoveryTab.tsx`/`RecoveryPanel.tsx`'s `useState(todayKey())` — see Finding 5 (kept as INFERRED since unverified by test/repro).

- **H5** (week-start Sunday/Monday mismatch and DST off-by-ones): False. Every helper and consumer in scope (`helpers.ts` `weekKey`/`getWeekDates`/`weekKeyForOffset`, `Heatmap.tsx`, `MomentumChart.tsx`, `WeekRhythm.tsx`) consistently treats Sunday as day 0 (`DAYS[0] = "Sunday"`, `d.setDate(d.getDate() - d.getDay())`), no Monday-start logic exists anywhere in the scoped files. DST: `weekKey`/`getWeekDates` use local-time `Date.setDate`, which JS normalizes correctly across a DST boundary (calendar-day arithmetic, not fixed-24h-increment arithmetic), so a week spanning 2026-03-08 or 2026-11-01 does not skip/repeat a day. `isBiWeeklyOn` (`helpers.ts:16-21`) computes `weeksAway` via `Date.UTC(y,m-1,d)` on the two calendar dates directly, which is DST-immune by construction (pure UTC millisecond arithmetic on calendar components, never mutated by `setDate`).

- **H8** (deleting and re-adding a habit with the same label resurrects the old streak under the same id): False. `addHabit` (`useWorkoutStore.ts:312-327`) builds its `taken` id set from *both* `state.habitDefs` ids *and* `Object.keys(state.habits)` (line 319, with an explicit comment: "so a re-added habit gets a fresh id instead of silently inheriting a deleted habit's old streak"), so a re-added "Meditation" after deleting the original gets `meditation-2`, not `meditation`. (Related, unflagged-as-bug observation: `removeHabit` never deletes `state.habits[id]`, so the orphaned completion history sits in the store/sync payload forever — harmless today given the id-reuse guard, but worth noting as a minor storage-growth/privacy nit, P3, not tested.)

- **H10** (LEGACY_HABIT_IDS folding runs only on local persisted-storage migration, not on data arriving via sync hydrate): False. `hydrateFromSync` (`useWorkoutStore.ts:380-459`) explicitly re-runs the legacy fold on every hydrate via `foldLegacy(...)` calls at lines 430-434, for all five legacy ids (`notWatch`, `noGamble`, `noNicotine`, `ash`, `meditation`), gated so it only fills dates the local map doesn't already have (line 425-427: `if (!(date in result)) result[date] = value;`), which correctly means a device that never had the legacy top-level fields locally still adopts them if the *server* blob still carries them (e.g., a not-yet-migrated old-schema JSON in Redis).

## Not covered

- H1 (tri-state collision) is addressed as Finding 4, but only with trace evidence — no automated test seeds pre-989297d-shaped data through `HabitCard`/`WorkoutsTab` with React Testing Library to demonstrate the red-X render directly; budget went to the higher-severity sync-merge findings instead.
- H6's "GET Cache-Control max-age=60 combined with 5-minute staleTime" half was not independently exercised — the underlying data-loss mechanism (server-side leaf overwrite) is proven directly in Findings 1 and 2 without needing to also simulate the HTTP caching layer; I did trace `useSync.ts`'s `staleTime: 300_000` / `refetchOnWindowFocus: false` / `refetchOnMount: false` (lines 34-41) as the reason a stale in-memory client snapshot can realistically persist for minutes before a debounced push, which is what makes Findings 1/2's race practically likely rather than only theoretically possible, but did not write a cache-header-specific test.
- H7 (mergeHabitDefs tie-break reverting a rename) — see Finding 6 (INFERRED only); could not construct a concrete legitimate-usage repro in the time available.
- H9 (migrateHabitsState version gates / empty habitDefs at v2) — covered, but the *concrete* gap found (Finding via `BUG-A4`) is narrower than "user on v2 storage with empty habitDefs array": I directly tested that exact scenario (`migrateHabitsState({ habitDefs: [], ... }, 2)`) and it fails to reseed, confirming H9's premise. This is folded into the VERIFIED findings above as `BUG-A4` rather than its own numbered finding — see the test file.
- Did not audit `src/app/api/twilio/webhook/route.ts`'s own local `todayKey()` (line 34) even though it showed up in the `todayKey` grep — it's an SMS webhook, not in the FILES IN SCOPE list, and I did not have budget to pull it in.
- Did not review `DateSelector.tsx`/`useDateOptions` (imported by both Recovery components) for its own date-window computation, which could compound or mask Finding 5.

## Test run tail

```
 ✓ src/__tests__/bugs/lane-a.test.ts (4 tests) 15ms
 FAIL  src/__tests__/bugs/lane-b.test.tsx > BUG-B3: duplicate useSync instances (documented via trace, see report) > SettingsTab and WorkoutsTab do not share a useSync instance (source check)
 FAIL  src/__tests__/bugs/_debug/lane-c-debug2.test.tsx > BUG-C1: CircuitTimer never requests a screen wake lock > BUG-C1: starting and running a circuit never calls requestWakeLock
 FAIL  src/__tests__/bugs/_debug/lane-c-debug2.test.tsx > BUG-C2: RepTimer's wake-lock re-acquire-on-visible path is dead code > BUG-C2: repeated visibilitychange hidden/visible cycles never re-request a wake lock, and the sentinel is never given a release listener
 FAIL  src/__tests__/bugs/_debug/lane-c-debug2.test.tsx > BUG-C3: two SessionCard-mounted CircuitTimers can run concurrently with no mutual exclusion > BUG-C3: a second, independently-mounted CircuitTimer instance keeps ticking while a first one (simulating a collapsed card) is still running
 FAIL  src/__tests__/bugs/_debug/lane-c-debug2.test.tsx > BUG-C4: CountdownIntro restarts from the full duration if timerSettings identity changes mid-count > BUG-C4: toggling an unrelated timer setting mid-countdown resets the displayed count upward

 Test Files  2 failed | 44 passed (46)
      Tests  5 failed | 408 passed | 2 skipped (415)
```
Note: the 5 failures above are all in `src/__tests__/bugs/lane-b.test.tsx` and `src/__tests__/bugs/_debug/lane-c-debug2.test.tsx` — other lanes' in-progress files, not written or touched by lane A. `src/__tests__/bugs/lane-a.test.ts` (this lane's file) passes cleanly, and re-running the full suite with only lane A's file present (before the other lanes' files existed in this run) showed all 41 files / 387 passed + 2 skipped green.
