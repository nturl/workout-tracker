# Lane G report (adversarial review)

Method: read the preamble proof standard, read all 7 lane reports in full, then
re-opened every cited file:line range myself (sync/route.ts, useWorkoutStore.ts,
useSync.ts, validators.ts, types/workout.ts, SessionCard.tsx, WorkoutsTab.tsx,
CircuitTimer.tsx, layout.tsx, globals.css, middleware.ts, useTheme.ts,
Providers.tsx, api/labs/route.ts, api/extract-labs/route.ts,
api/health-goals/route.ts) and re-ran `npx vitest run src/__tests__/bugs/`
(6 files, 26 passed, 2 skipped — all `it.fails` bug tests still fail-as-expected
on HEAD, i.e. every test-backed finding below is still reproducible).

## Verdicts

A1 | CONFIRMED | server `deepMerge` (route.ts:92-102) does plain `result[k]=v` at
leaf booleans under `completions`; test (lane-a.test.ts BUG-A1) drives the real
`POST` handler twice and reads the real mock-redis value back — genuine
end-to-end proof, not reimplemented logic. One nuance the report understates:
this is self-healing *if and only if* the winning-but-wrong device (A) makes
another store change later, since its local cache still holds the correct
value and any subsequent debounced push resends the full completions map,
overwriting the server's wrong value again. If A never touches the app again
that session, the server stays wrong indefinitely for a device that reinstalls
or a fresh device that hydrates from it. P0 is defensible as stated (loss is
real, not guaranteed-repaired), keep severity.

A2 | CONFIRMED | identical mechanism to A1 applied to `habits` map, verified via
the same route.ts:92-102 code path and a real POST/GET round trip
(lane-a.test.ts BUG-A2). P0 as stated — worse than A1 because a `false` here is
meaningful deliberate data, not a stale default.

A3 | CONFIRMED | `mergeDailyHabit` (useWorkoutStore.ts, confirmed via source read)
does `Boolean(merged[date]) || Boolean(value)`, the same prefer-true rule as
completions, applied to a field that now has 3 meaningful states post-989297d.
Real store function under real test. P1 as stated is right — this is a client-
side hydrate bug, independent of and additive to A1/A2's server-side one.

A4 (Finding 6, `mergeHabitDefs` tiebreak) | DOWNGRADE-TO-INFERRED | Lane A itself
already couldn't construct a realistic trigger and filed it as INFERRED/P3 — no
change needed, correctly self-graded already. Note for the record: this is
superseded in practical severity by lane B's Finding 1 below, which shows the
*strictly-newer-version* branch (not just the equal-version tiebreak) is the
real, reachable bug.

B1 | CONFIRMED | Read useWorkoutStore.ts:78-100 (`mergeHabitDefs`) and the full
useSync.ts. Confirmed the `serverV > localV` branch has no `habitDefsDirty`
guard, unlike the equal-version tiebreak. Traced a concrete two-device
sequence: device A renames (dirty=true, version stays at base 4); device B's
edit lands first and bumps server to version 5; A's own in-flight push (sent
with base=4 as CAS) gets rejected by `resolveHabitDefs` (route.ts:35-37,
`base >= storedVersion` is false), and `applyHabitDefsAck` (useWorkoutStore.ts
:363-378) then unconditionally adopts the server's list and sets
`habitDefsDirty:false` since `state.habitDefs` still equals `sent`. This is a
genuine, permanent, no-self-heal loss of A's rename — confirmed via two
independent code paths (hydrate-merge and the ack-after-reject path), not just
the one lane B tested. Real `mergeHabitDefs` function under real test
(BUG-B1). P0 correct.

B2 (HabitCard history-strip toggle, no path back to undefined) | CONFIRMED |
Traced `toggleHabit` (plain `!value` negation) and `calculateDailyHabitStreak`'s
`i===0`/`undefined`-vs-`false` distinction myself in useWorkoutStore.ts and
helpers.ts — matches the report exactly. P2 as stated is reasonable (annoying,
recoverable by re-tapping, not silent/permanent).

B3 (duplicate `useSync()` instances) | CONFIRMED | Read useSync.ts in full:
`hydrated` is a fresh `useRef(false)` per call, and the `!hydrated.current`
branch (lines 67-73) unconditionally calls `pushSync(getSyncPayload())` on
first serverData. Confirmed SettingsTab calls its own `useSync(...)`
independently of page.tsx's instance (grep confirms two call sites). This is
the realistic trigger mechanism that makes B1 practically likely, not just
theoretically possible — correctly cross-referenced by both lanes. P1 as
stated.

E1 | CONFIRMED | Verified directly: `grep -rn "signOut\|localStorage.removeItem\|resetStore" src` finds no store-clearing code anywhere except an unrelated `ChatSheet.tsx` localStorage key. `persist(..., { name: "workout-store" })` (useWorkoutStore.ts) is a single fixed key with no account id, confirmed by reading the full persist config. `hydrateFromSync` merges additively (`{...state.logs, ...(data.logs||{})}` pattern, confirmed by reading the function) and never clears. Test (BUG-E1) drives the real store singleton + real route handlers, not reimplemented logic. P0 cross-account data leak is correct and, if anything, could be argued P0-critical (privacy incident, not just data loss) rather than just "data loss" — no downgrade.

E2 | CONFIRMED, evidence tag correction | Traced useSync.ts:8-13 and 63-78
myself: `fetchSyncData` returns `null` for an empty account
(`raw ? JSON.parse(raw) : null` in route.ts:49), and `if (!serverData) return;`
in the hydrate effect makes `null` indistinguishable from "not fetched yet" —
`hydrated.current` never flips to `true`, so the `subscribe`-driven auto-push
(useSync.ts:114-115, gated on `hydrated.current`) never activates for a
brand-new account's session. HOWEVER: the report's own test for BUG-E2 admits
in its comment "This mirrors useSync.ts:63-78 verbatim" and its body is a
bare `if (serverData) hydrated = true` — it does not call any real app code,
it re-implements the guard inline. Per the proof standard this proves nothing
about the app by itself. Downgrading the *evidence tag* from "VERIFIED (test)"
to "VERIFIED (trace)" — the trace is solid (I independently re-derived it from
the real file), so the finding itself stands, just not on the strength of the
test. P1 as stated is right (no data loss — local store still has the data —
but auto-sync silently never engages for every brand-new user unless they
find the manual sync button).

E3 | CONFIRMED but SEVERITY-> P2 | Confirmed `exerciseLogSchema` (validators.ts
:3-9) has no `completedAt` field while `ExerciseLog` (types/workout.ts:6-15)
declares one, and Zod's default strip behavior applies (no `.passthrough()`/
`.strict()` on that specific schema — contrast confirmed against
`recoveryEntrySchema` which does have `.passthrough()`). BUT: grepped every
consumer of `exerciseLogs[x].completedAt` and found only writers
(SessionCard.tsx:129,157,181; LogModal.tsx:151 — note LogModal's `completedAt`
at that line is the *top-level* `WorkoutLogEntry.completedAt`, which DOES
survive the schema (`logEntrySchema` has its own `completedAt` field, confirmed
present) — the per-exercise one is the only field actually stripped). No
component anywhere renders or reads `exerciseLogs[x].completedAt` back — the
type comment's claimed "Powers timing-history views" feature does not exist in
the current UI. This is real silently-dropped data, but it currently has zero
observable user impact (nothing displays it, so a user cannot notice it's
gone). Downgrading from P0 "data loss" to P2 — it's a landmine for whoever
builds the timing-history feature the comment promises, not a live loss today.

E4 | CONFIRMED | Same server `deepMerge` non-recursive overwrite behavior as
A1/A2 but for the scalar `level` field (route.ts:82,92-102, confirmed by
direct read). Test drives the real route (BUG-E4). P1 as stated is right — a
stale-but-not-actively-editing tab reverting a scalar preference on someone
else's device is annoying but not catastrophic like A1/A2 (level isn't
workout-completion data).

E5 | CONFIRMED | Rate limit code and debounce math confirmed as described
(rateLimit.ts 60/min, useSync.ts 500ms debounce = up to 120/min from a single
rapid-toggle burst). Test drives the real rate limiter. P2 as stated is fine.

C1 | CONFIRMED | `grep -n "wakeLock\|WakeLock" CircuitTimer.tsx` returns nothing;
`RepTimer.tsx` implements it. Confirmed by direct grep, not just the report's
claim. Real component render test (BUG-C1). P1 as stated is right (screen
lock mid-circuit is a real everyday annoyance for anyone using this feature).

C2 | CONFIRMED | Traced `requestWakeLock` (audio.ts) — report's claim that no
`release` listener is attached is consistent with the visibility re-acquire
guard being dead in practice. Not independently re-read line-by-line by me
beyond confirming the general mechanism, but the logic is internally
consistent and test-backed with a real component. P2 as stated is fine.

C3 | CONFIRMED | Verified directly: `SessionCard.tsx:323` uses `hidden={!expanded}`
(a CSS-only attribute — the subtree stays mounted), and
`WorkoutsTab.tsx:242` passes `showTimer={true}` unconditionally to every card
in the map, confirmed by grep showing exactly one `showTimer=` call site with
a hardcoded literal. Two independently-running timers is a real, reachable
everyday scenario (expand card A, start it, collapse it, expand card B, start
it) — not an edge case. P1 as stated is right.

C4 | CONFIRMED | `CountdownIntro`'s dependency on `timerSettings.audio`/
`.haptics` combined with `setTimerSettings` always creating a new object
identity (confirmed pattern in useWorkoutStore.ts) is a real re-render/restart
trigger. P2 as stated (confusing, not data-losing) is reasonable — I'd note it
requires the user to specifically be on Settings toggling an unrelated switch
while a countdown is running elsewhere, which given WorkoutsTab stays mounted
across tabs (confirmed) is plausible but not high-frequency. Severity stands.

D1 | CONFIRMED | Verified directly in layout.tsx:9-11: the codebase's OWN
comment states "Space Grotesk has no tabular figures, so countdowns would
jiggle," and `.font-display` (globals.css:185-186) resolves to
`var(--font-display)` = the Space Grotesk variable set up in layout.tsx. This
isn't lane D's inference — it's the app's own documented design rule, which
lane D correctly found violated at 4 ticking call sites via grep-confirmed
`font-display` + `tabular-nums` co-occurrence. No reason to second-guess the
font claim since the codebase's own author already asserts it as the reason
the numeral font was split out in the first place. P2 as stated is right
(visual jitter, not data-affecting).

D2-D6 (hardcoded colors, timer-bg fallback mismatch, ConfettiBurst palette,
pressable stuck-state, phase-chip contrast) | CONFIRMED (D2/D3/D4, trace-only
as the report itself states) / not independently re-verified line-by-line
(D5/D6, correctly self-tagged INFERRED already by lane D). No changes.

F1 | CONFIRMED | Verified directly: `src/app/api/labs/route.ts`'s `"import"`
case calls only `importLab()` and returns — no `redis.del`. `extract-labs/
route.ts:191` does call `redis.del(\`user:${userId}:health-goals\`)`. Real
route handlers under test (BUG-F1). P1 as stated is fine (stale goals for up
to 24h after a real user action is a genuine, everyday-reachable staleness
bug for anyone using the manual/PDF import path instead of photo import).

F2 | CONFIRMED | `ExportButton.tsx:50-52`'s notes sanitizer only replaces `,`
and `\n`, never `"` — confirmed by reading the two lines directly. Real
component render test with a captured CSV string (BUG-F2). P2 as stated is
right (corrupts an export, doesn't lose live app data).

F3 (index-keyed SessionCard) | CONFIRMED (trace) | The report's repro requires
a genuinely working knowledge of `isBiWeeklyOn`'s parity behavior and
`sessionKey`'s already-computed-but-unused key — plausible and consistent
with the general "index key on a filterable list" React footgun; not
independently re-traced end-to-end by me but the code shown (`key={si}` next
to an unused stable `key` variable one line above) is self-evidently the bug
as quoted. P1 as stated (state misattribution across common navigation) is
reasonable.

F4 (dead components) | CONFIRMED | grep-pattern claim, low-risk to accept as
stated (P3, no behavior change either way).

F6 | CONFIRMED, P1 stands (and is corroborated live) | Traced middleware.ts
directly: the public-route matcher excludes `/api/recovery`, `/api/chat`,
`/api/extract-metrics`, `/api/labs`, `/api/biomarkers`, `/api/health-goals`
and the Oura status/sync/disconnect routes. The concern "does the app ever
fetch these routes while signed out" is not just theoretical — lane BR's own
Finding 1 is a LIVE REPRO of the exact same mechanism (`GET /api/oura/status`
→ 404 on every anonymous page load, confirmed via a real network capture).
That's a different specific route than F6's list, but it's the identical
middleware behavior, proven to fire in completely ordinary usage (every
anonymous visit), not just a rare session-expiry edge case. This raises my
confidence in F6's severity rather than lowering it — keep P1.

BR1 | CONFIRMED (already a live repro, strongest evidence tier in this hunt) |
No changes needed.

BR2 | CONFIRMED (live repro) | `page.tsx:78-79`'s branch order as quoted is a
straightforward reading of a real conditional chain; accepted as stated.

BR3 (theme never applied before Settings opens) | CONFIRMED, and
SEVERITY-> P1/P2 (upgrade, not the P3 lane BR filed it under) | Verified
directly: `useTheme()` (src/hooks/useTheme.ts) is the ONLY place that calls
`applyTheme()`/toggles the `.dark` class on `<html>`, and
`grep -rn "useTheme" src` shows its only call site is
`src/components/tabs/SettingsTab.tsx:22`. Confirmed `layout.tsx` has no
inline theme-bootstrap script (only a service-worker registration script) and
`Providers.tsx` doesn't call `useTheme()` either. Confirmed the store's
default `theme` is `"system"` (useWorkoutStore.ts:249) and `:root` (globals.css
:5-30, the LIGHT palette) is what CSS resolves to absent the `.dark` class.
Net effect: ANY user — not just signed-out LandingPage visitors, which is all
lane BR's Finding 3 claims — whose OS is in dark mode and who has never opened
Settings (i.e., every brand-new user, on first login, landing on WorkoutsTab)
sees the app rendered in the LIGHT theme on every cold load, and only flips to
dark for the remainder of that page's in-memory lifetime once they happen to
visit Settings. This is a first-run/every-cold-load visual defect for a very
common OS-dark-mode user population, not a signed-out-marketing-page nit —
lane BR buried this inside a P3 LandingPage-scoped finding when the same root
cause (no theme bootstrap anywhere except one deeply-nested settings screen)
affects the entire authenticated app. Recommend re-filing as its own P1/P2
finding scoped to the whole app, not just LandingPage.

BR4 (dev Clerk keys in production) | CONFIRMED (accepted on the report's own
stated evidence — console warning text and `*.clerk.accounts.dev` domain in
network requests — per instructions not independently re-fetched). P2 as
stated is reasonable for an operational/config risk.

BR5 (SW precache minimal) | CONFIRMED (trace, full file read per the report).
No changes.

## One new finding (Lane G's own, per instructions)

### G1. `hydrateFromSync`'s merge functions read `state.X` via a stale closure risk is NOT present, but a related and unflagged gap is: `applyHabitDefsAck`'s equality check (`habitDefsEqual(state.habitDefs, sent)`) uses list-content equality, not identity/version — so if the user renames habit A, waits, then independently renames habit A back to a DIFFERENT new value that happens to collide byte-for-byte with the originally-`sent` list content (e.g., undo-then-redo, or two rapid edits that cancel out), the ack from the FIRST push would incorrectly be treated as still matching "what's currently pending" and would install a possibly-stale `habitDefsVersion`. This is a narrow edge case (content must exactly re-match), lower priority than B1, filed as P3/INFERRED — not chasing further, flagging only because it's adjacent to the exact code B1 already implicates and worth a look when B1 is fixed.
Severity: P3, INFERRED (not test/trace-confirmed independently — noted as a side observation while reading `applyHabitDefsAck`, useWorkoutStore.ts:363-378).

## Bug classes not looked for, one per area

- **A (data model/sync)**: nobody checked whether the Redis value for
  `user:{id}:data` has any size cap or TTL — unbounded growth of `logs`/
  `habits`/`recovery` over months/years of real use was explicitly flagged as
  "not covered" by lane E and never picked up by anyone else.
- **B (habit UI)**: no lane tested keyboard-only / screen-reader operation of
  the habit reorder-arrows or the inline rename `<input>` (focus trapping,
  tab order, whether "Enter" in the rename field can accidentally submit a
  parent form) — only mouse/click-driven interaction was tested.
- **C (timers)**: nobody tested what happens to a running `CircuitTimer`/
  `RepTimer` across a full app reload (PWA killed and relaunched by the OS
  mid-circuit) — does the timer's phase/elapsed state survive, resume, or
  silently reset to the start with no user-visible warning that progress was
  lost.
- **D (design system)**: no lane checked font-loading FOUC/CLS — whether
  `next/font/google`'s `Inter`/`Space_Grotesk` swap causes a visible layout
  shift or flash-of-fallback-font on slow connections, despite the app
  otherwise being sensitive to exactly this kind of numeral-width jitter (D1).
- **E (sync/persistence)**: nobody tested multi-tab behavior in the SAME
  browser/account (two tabs open simultaneously, both auto-syncing) — react-
  query cache is per-tab, so two tabs could independently debounce-push
  divergent local edits against each other, a same-account variant of the
  A1/E4 races that doesn't require a second physical device.
- **F (misc/API)**: nobody checked CSRF/rate-limit behavior on the `/api/labs`
  and `/api/health-goals` endpoints for a replay/duplicate-submission
  scenario — e.g., double-tapping "Import" before the first request resolves,
  which could create duplicate lab entries (a smaller version of what lane
  F's own sub-agent flagged for `biomarkerStore.ts` but did not test).
