# Lane F report

## Findings (VERIFIED)

### 1. `/api/labs` manual/PDF import never invalidates the cached health-goals, unlike the photo-import route
Severity: P1 wrong behaviour user will hit
Status: VERIFIED (test)
Where: `src/app/api/labs/route.ts:65-68` (`case "import": const lab = await importLab(userId, action.data); return NextResponse.json({ lab, success: true });`), contrasted with `src/app/api/extract-labs/route.ts:189-191` (`await redis.del(\`user:${userId}:health-goals\`);` with the comment "Invalidate cached health goals so they regenerate with new data"); cache read/write in `src/app/api/health-goals/route.ts:60-67,131-132` (`redis.set(cacheKey, ..., "EX", 86400)`).
Repro:
1. User has cached health goals (`user:{id}:health-goals` set, valid for 24h).
2. User imports a new/updated lab test through any client that calls `POST /api/labs` with `{ action: "import", data }` (the manual-entry / non-photo import path).
3. `importLab()` writes the new markers to Redis but the route never deletes the goals cache key.
4. `GET /api/health-goals` still returns the pre-import cached goals for up to 24 hours.
Expected: importing new lab data should invalidate cached goals so the next fetch regenerates from current data (as the photo-import path already does).
Actual: cached goals silently go stale for up to 24h after a manual/PDF import.
Root cause: `POST /api/labs` `"import"` action was implemented without copying the `redis.del(health-goals)` step that `/api/extract-labs` has; the two import paths into the same underlying data diverged.
Evidence: `src/__tests__/bugs/lane-f.test.ts`, test `BUG-F1: labs import does not invalidate health-goals cache > clears the cached health-goals after a new lab import`. Seeds a stale cached goals entry, calls the real `POST /api/labs` import handler, then calls the real `GET /api/health-goals` handler and asserts the stale entry is gone. `it.fails` — passes (i.e. correctly demonstrates the bug) on HEAD; see Test run tail below for the passing `it.fails` output.
Proposed fix: after a successful `importLab()` call in `src/app/api/labs/route.ts`'s `"import"` case (and likewise in `deleteLabTest`'s `"delete"` case), delete `user:{userId}:health-goals` the same way `/api/extract-labs` does. Does not touch sync schema or persisted lab/reading data, only the derived-goals cache key.

### 2. `ExportButton` CSV writer doesn't escape embedded double quotes in workout notes
Severity: P2 visual/UX (corrupts exported data)
Status: VERIFIED (test)
Where: `src/components/recovery/ExportButton.tsx:50` — `const notes = (log?.notes || "").replace(/,/g, ";").replace(/\n/g, " ");` then line 52: `workoutCsv += \`${key},${completed},${feeling},${duration},"${notes}",${completedAt}\n\`;`
Repro:
1. Log a workout with notes containing a double quote, e.g. `He said "great" session`.
2. Export CSV via the Settings/Recovery "Export All Data (CSV)" button.
3. Open `workout-data.csv` in Excel/Sheets/any RFC-4180 parser.
Expected: the notes field round-trips intact, e.g. `"He said ""great"" session"` (quotes doubled per RFC 4180) or otherwise safely escaped.
Actual: the field is written as `"He said "great" session"` — an unescaped `"` inside a quoted field, which most CSV parsers interpret as the field ending after `He said `, followed by garbage/misaligned columns for the rest of the row.
Root cause: the notes sanitizer only escapes commas and newlines, never the quote character it then uses as the field delimiter.
Evidence: `src/__tests__/bugs/lane-f.test.ts`, test `BUG-F2: ExportButton does not escape quotes in workout notes CSV > escapes embedded double quotes in notes so the CSV field stays valid`. Renders the real `ExportButton`, seeds `useWorkoutStore` with a note containing an embedded quote, stubs `Blob`/`URL.createObjectURL` to capture the generated CSV text, clicks Export, and asserts the properly-escaped `""great""` form is present. `it.fails` — passes on HEAD, proving the buggy unescaped output is what's actually produced.
Proposed fix: escape `"` as `""` before wrapping the notes field in quotes (standard CSV quote-escaping), applied consistently to any other free-text field that could contain a quote.

### 3. `WorkoutsTab` keys each day's session card by array index, not by the stable session key already computed one line above
Severity: P1 wrong behaviour user will hit
Status: VERIFIED (trace)
Where: `src/components/tabs/WorkoutsTab.tsx:235-241`
```
<div key={selectedDay} className="anim-stagger space-y-5">
  {activePlan.sessions.filter((s) => isSessionScheduled(s, wk)).map((session, si) => {
    const key = sessionKey(wk, activePlan.day, session);
    return (
      <div key={si} className="anim-fade-up" style={{ "--stagger-i": si } as React.CSSProperties}>
        <SessionCard session={session} level={level} completed={!!completions[key]}
          onToggle={() => handleToggle(activePlan.day, session)} logKey={key} logs={logs}
          onOpenLog={() => setLogModal({ session, key })} onSaveLog={handleSaveLog} showTimer={true} />
      </div>
    );
  })}
</div>
```
`SessionCard` (`src/components/dashboard/SessionCard.tsx:65-66`) holds its own local state: `const [expanded, setExpanded] = useState(false); const [showConfetti, setShowConfetti] = useState(false);`.
Repro (concrete inputs): `isSessionScheduled(session, wk)` (`src/lib/helpers.ts:23-24`) returns `!session.isBiWeekly || isBiWeeklyOn(wk)` — i.e. a session flagged `isBiWeekly` is present in the filtered array only on "on" weeks and absent on "off" weeks (`isBiWeeklyOn` alternates by parity of weeks since a fixed anchor, `src/lib/helpers.ts:22-24`). Take a day whose session list is `[Egoscue (not biweekly), BiWeeklySpecial (biweekly), Strength (not biweekly)]`:
- On an "on" week (`wk` even weeks from anchor): filtered = `[Egoscue(si=0), BiWeeklySpecial(si=1), Strength(si=2)]`.
- User expands the Strength card (`si=2`) to view exercise notes (`expanded=true` inside that `SessionCard` instance).
- User taps the week-forward arrow (`weekOffset` state, `src/components/tabs/WorkoutsTab.tsx:53`) to move to an "off" week with the *same* `selectedDay` (the outer `key={selectedDay}` wrapper does NOT remount, since `selectedDay` didn't change — only `wk` did).
- filtered = `[Egoscue(si=0), Strength(si=1)]` — Strength has moved from `si=2` to `si=1`.
- React reconciles by key: the `<div key={1}>`/`SessionCard` instance that used to render `BiWeeklySpecial` (state: not expanded) now receives `Strength`'s props, but `si=2`'s instance (which had `expanded=true`) is unmounted and a *fresh* `si=1` instance (not the one carrying the expanded state) is shown for `Strength` — expand state is lost/misattributed rather than following the actual session.
Expected: each `SessionCard`'s local UI state (`expanded`, `showConfetti`) stays attached to its specific session across re-renders that only change which sessions are scheduled.
Actual: state is keyed by position in the filtered list, so switching weeks (or level, which can also change which sessions render further down `SessionCard`, see `parsedTimed`/`activeProtocol` derived per-session) can carry stale expand/confetti state onto a different session, or drop it entirely.
Root cause: the map callback already computes a perfectly stable, unique per-session key (`sessionKey(wk, activePlan.day, session)`, assigned to the local `key` variable) one line before the JSX, and passes it to `SessionCard` as `logKey` — but never uses it as the React `key` prop on the wrapping `<div>`; `si` (the post-filter array index) is used instead.
Proposed fix: use the already-computed `key` variable (or the session's slug) as the `key` prop instead of `si`, e.g. `<div key={key} className="anim-fade-up" ...>`. No schema/persisted-data changes — this is purely a client render-identity fix.

### 4. Two dead components still shipped in the bundle, unreferenced by any app code or test
Severity: P3 nit (dead code / maintenance hazard, not user-facing)
Status: VERIFIED (trace)
Where: `src/components/RecoveryPanel.tsx` (228 lines, default export `RecoveryPanel`), `src/components/settings/SettingsSheet.tsx` (126 lines, export `SettingsSheet`).
Evidence: `grep -rln "RecoveryPanel\b" src` returns only `src/components/RecoveryPanel.tsx` itself; `grep -rln "SettingsSheet\b" src` returns only `src/components/settings/SettingsSheet.tsx` itself. No import of either symbol exists anywhere in `src/app`, other components, or `src/__tests__`. The live app instead renders `src/components/tabs/RecoveryTab.tsx` and `src/components/tabs/SettingsTab.tsx` (confirmed via `src/app/page.tsx:20,111`, `lazy(() => import("@/components/tabs/SettingsTab")...)`), which re-implement the same screens (`RecoveryPanel.tsx` even imports the same `ScreenshotUpload`/`MetricInputs`/`DateSelector`/`RecoveryHistory`/`ExportButton` children that `RecoveryTab` also uses — so this looks like an earlier version of the tab that was replaced but never deleted).
Proposed fix: delete both files (and confirm no dynamic/string-based import exists via a broader search before removing, since this scan only checked static import syntax). No persisted-data or schema impact — pure dead code.

## Findings (INFERRED)

### 5. Hardcoded hex colors bypass the CSS-variable design-token system in several Kimi-era files
Severity: P3 nit
Where: `src/components/tracking/ConfettiBurst.tsx:5` — `const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];`; `src/components/dashboard/SunBanner.tsx:55-57` — `background: pct > 80 ? "linear-gradient(90deg, #fbbf24, #f97316)" : "linear-gradient(90deg, #fbbf24, #60a5fa)"`; `src/components/progress/HabitCard.tsx:77,80` — `color: streak > 0 ? "#f97316" : "var(--text-muted)"` (streak flame, hardcoded orange mixed with a token fallback); `src/components/progress/WeekRhythm.tsx:49` and `src/components/progress/Heatmap.tsx` — a shared hardcoded `"#6b7280"` gray fallback when a day has no `DOT_COLORS` entry; `src/components/layout/LandingPage.tsx` — extensive hardcoded hex/rgba throughout (`#000`, `#0a0a0a`, `#050d05`, `#121216`, `rgba(255,255,255,...)`, `#3b82f6`, `#f97316`, `#10b981`, `#f59e0b`, `#14b8a6`).
Every other surface in these lanes uses `var(--accent)`, `var(--warning)`, `var(--text-muted)`, etc. (see `DESIGN_SPEC.md` contract and dozens of examples across the files read for this lane). The `LandingPage.tsx` case is the pre-auth marketing hero page and plausibly an intentional always-dark design exception rather than an oversight (not themed against light/dark like the rest of the app); the `ConfettiBurst`/`SunBanner`/streak-flame/gray-fallback cases are smaller and more likely accidental, but I did not read `DESIGN_SPEC.md`'s literal rule text closely enough to be certain any of these are meant to be exceptions vs. bugs — flagging all as inferred rather than confirmed. Only `ConfettiBurst`/`SunBanner` were read fully by me directly; the `HabitCard.tsx`/`WeekRhythm.tsx`/`Heatmap.tsx`/`LandingPage.tsx` instances were found and reported by a delegated sub-agent that read those files in full, and I did not independently re-verify those specific lines myself.

## Hypotheses killed
- H: `GET /api/recovery`'s server-side default date (`new Date()` on the server, `src/app/api/recovery/route.ts:16-17`) could disagree with the client's local "today" near midnight, causing wrong-day data to load. Killed: the only live caller, `src/app/page.tsx:46` (`fetch(\`/api/recovery?date=${todayKey()}\`)`), always passes an explicit client-computed `date`, so the server fallback path is unreachable in the current UI. (The only component that could hit it without a date param, `RecoveryPanel.tsx`, is itself dead — see Finding 4.)
- H: `isBiWeeklyOn` (`src/lib/helpers.ts:15-20`) mixes UTC and local date math relative to `weekKey`'s local-time computation, causing off-by-one-week bugs. Killed: both `weekKey` and `isBiWeeklyOn` operate on the same `YYYY-MM-DD` string via `Date.UTC(y, m-1, d)` on both the current week and the anchor week — the calculation is self-consistent pure calendar-day arithmetic regardless of the browser's timezone, so no local/UTC mismatch exists here.
- H: `/api/oauth/oura/authorize` being absent from `middleware.ts`'s public-route matcher breaks the Oura connect flow for logged-out users. Killed: Clerk's `auth.protect()` correctly treats this as a page-style navigation-adjacent request (initiated via `window.location.href`/`<a href>`, not `fetch`), so unauthenticated users get Clerk's normal sign-in redirect, which is the intended behavior — this only becomes a problem for JS `fetch()` calls (see Finding 6 below, which the public list already special-cases for `/api/push` but not for `/api/recovery`, `/api/chat`, `/api/extract-metrics`, `/api/labs`, `/api/biomarkers`, `/api/health-goals`).
- H (from labs sub-report): "insight-category exact-string matching in `LabsTab.tsx:135-138` silently drops AI insights whose category text doesn't exactly match" — left as INFERRED per that sub-report, not independently verified here (the insight-generation route wasn't read).

## Additional finding (VERIFIED, trace) surfaced during hypothesis-killing

### 6. Every protected API route except `/api/push(.*)` returns an HTML 404 instead of JSON on an unauthenticated `fetch()` call, but client code always does `res.json()`
Severity: P1 wrong behaviour user will hit (session-expiry / stale-tab case)
Status: VERIFIED (trace)
Where: `src/middleware.ts:3-16` (public matcher list only contains `/`, `/sign-in(.*)`, `/sign-up(.*)`, `/api/twilio/webhook(.*)`, `/api/cron/(.*)`, `/api/health(.*)`, `/api/oauth/oura/callback(.*)`, `/api/push(.*)`, `/manifest.json`); `node_modules/@clerk/nextjs/dist/esm/server/protect.js:13-24,76-93` (`handleUnauthenticated`/`isPageRequest`/`isServerActionRequest`).
Trace: for any request to a route NOT in the public list, `clerkMiddleware` runs `auth.protect()` (`src/middleware.ts:18-21`). If the session is missing/expired, `protect.js`'s `handleUnauthenticated()` runs: `isPageRequest(req)` checks `Sec-Fetch-Dest === "document"/"iframe"` or `Accept` includes `text/html` — a plain browser `fetch()` (as used throughout, e.g. `ScreenshotUpload.tsx:23-27`, `ChatSheet.tsx:168-172`, `PushSetup.tsx`'s `fetchPrefs`) has `Sec-Fetch-Dest: empty` and no `text/html` in `Accept`, so `isPageRequest` is `false`; `isServerActionRequest` is also `false` (no Next.js action/RSC headers); so `handleUnauthenticated()` falls through to `return notFound();` — Next.js's `notFound()`, which renders the app's HTML 404 page, not a JSON body.
Client-side impact: every `fetch(...).then((data) => data.json())` call against `/api/recovery`, `/api/extract-metrics`, `/api/labs`, `/api/biomarkers`, `/api/health-goals`, `/api/chat`, and the Oura account routes will throw a JSON-parse error (`Unexpected token '<'...`) instead of surfacing a clean 401. Concretely in `ScreenshotUpload.tsx:22-44`, the outer `try/catch` catches this and shows "Failed to connect to scanning service" — misleading the user into thinking it's a network problem when they actually need to re-sign-in. Same pattern in `ChatSheet.tsx:167-181` ("Connection error. Try again.").
This is the exact failure mode the code comment at `src/middleware.ts:11-14` already documents and fixed for `/api/push(.*)` ("Letting Clerk middleware intercept turns unauthed fetches into 404 redirects, which breaks SW-initiated calls after session expiry") — but the same fix was never applied to the sibling API routes in this lane's scope, which have the identical `auth()` + explicit-401 pattern internally (e.g. `src/app/api/recovery/route.ts:12-13`, `src/app/api/chat/route.ts:163-166`) that was clearly meant to produce a JSON 401, not a middleware-level HTML 404.
Proposed fix: add the routes that handle their own `auth()`/401 internally (`/api/recovery`, `/api/extract-metrics`, `/api/labs`, `/api/biomarkers`, `/api/health-goals`, `/api/chat`, and the `/api/oura/*` status/sync/disconnect routes used via `fetch`) to the `isPublicRoute` matcher in `src/middleware.ts`, mirroring the existing `/api/push(.*)` entry and its comment. No schema/persisted-data impact — purely a middleware routing fix.
Browser check: with a signed-in session, open DevTools, expire/clear the Clerk session cookie without reloading, then trigger a chat message or a recovery screenshot scan — expect the network response for `/api/chat` or `/api/extract-metrics` to be an HTML document (Content-Type `text/html`, status 404) rather than `application/json` with status 401, and the UI to show a generic "Connection error"/"Failed to connect" message instead of a sign-in prompt.

## Not covered
- The remaining Kimi-authored files from commit `96b3608` outside this lane's core surfaces (`dashboard/ProgrammingNotes.tsx`, `layout/BottomNav.tsx`, `layout/LandingPage.tsx`, `progress/HabitCard.tsx`, `progress/Heatmap.tsx`, `progress/MomentumChart.tsx`, `progress/WeekRhythm.tsx`, `ui/Sheet.tsx`, `ui/Skeleton.tsx`, `lib/motion.ts`) were read end-to-end by a delegated sub-agent rather than by me directly (I independently spot-checked and fully read `dashboard/SessionCard.tsx`, `tabs/WorkoutsTab.tsx`, `tracking/LogModal.tsx`, `tracking/ConfettiBurst.tsx`, `dashboard/SunBanner.tsx`, `ui/InstallBanner.tsx`, `ui/OfflineBanner.tsx` myself and corroborated the sub-agent's WorkoutsTab finding independently before it reported). The sub-agent found no additional setState-in-render, missing-cleanup, or UTC/local mismatches in that batch beyond Findings 3 and 5 above; `progress/StreakCounter.tsx` was not explicitly covered by either of us and remains unread for this report.
- `src/components/labs/*` and `src/lib/biomarkerData.ts`/`biomarkerStore.ts` were fully read by a delegated sub-agent rather than by me directly. I independently re-verified its Redis-cache finding (folded into Finding 1 above, plus the `/api/extract-labs` cross-reference) by reading the cited lines myself, but did not re-read every line of `BodySilhouette.tsx`, `HealthScoreCard.tsx`, `MarkerDetailSheet.tsx`, `CategoryDetailView.tsx`, `GoalProtocolView.tsx` myself. The sub-agent's other findings (not independently re-verified by me, so omitted from the VERIFIED section above) were: stale/orphaned biomarker readings when `POST /api/labs` `import` accepts a `biomarkerId` not in the known catalog (P2, `src/lib/biomarkerStore.ts:150-166` + `src/app/api/biomarkers/route.ts:105-120`); a latent crash in `GET /api/biomarkers?id=X` when `history.length === 0` returns `latest: undefined`, which `MarkerDetailSheet.tsx:86-87` would then dereference (P2, currently guarded client-side so not reachable through the wired UI today); fragile exact-string category matching for AI insights in `LabsTab.tsx:135-138` (P2, INFERRED); and duplicate same-date readings on repeated manual import since `saveReadings`'s dedupe key includes a freshly-minted `labTestId` (P3, `src/lib/biomarkerStore.ts:101-127`).
- No browser/live repro was performed (no browser tools available to this lane per instructions); all UI findings are trace- or test-based only. "Browser check" steps are provided above for the browser lane to execute.
- Did not review `src/lib/pushClient.ts` or `src/app/api/push/notify/route.ts` end-to-end (skimmed `PushSetup.tsx` and `src/app/api/push/route.ts` fully; `pushClient.ts`'s internals were not read line-by-line).
- Did not review `src/components/labs/BodySilhouette.tsx` (512 lines) myself line-by-line; relied on the sub-agent's read.

## Test run tail
```
$ npx vitest run src/__tests__/bugs/lane-f.test.ts --reporter=verbose
 RUN  v3.2.4 /Users/noelturlington/dev/workout-tracker

(node:27996) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
 ✓ src/__tests__/bugs/lane-f.test.ts > BUG-F1: labs import does not invalidate health-goals cache > clears the cached health-goals after a new lab import 8ms
 ✓ src/__tests__/bugs/lane-f.test.ts > BUG-F2: ExportButton does not escape quotes in workout notes CSV > escapes embedded double quotes in notes so the CSV field stays valid 1ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  16:21:59
   Duration  683ms (transform 71ms, setup 0ms, collect 185ms, tests 9ms, environment 117ms, prepare 48ms)
```

Full suite re-run after adding the lane-f tests:
```
$ npm test
...
 ✓ src/__tests__/api/recovery.test.ts (9 tests) 15ms
 ✓ src/__tests__/api/extract-metrics.test.ts (6 tests) 37ms
 ✓ src/__tests__/bugs/lane-e.test.ts (5 tests) 198ms
 ✓ src/__tests__/helpers.test.ts (27 tests) 7ms
 ✓ src/__tests__/api/oura-disconnect.test.ts (4 tests) 9ms
 ✓ src/__tests__/api/cron-sync-recovery.test.ts (13 tests) 64ms
 ✓ src/__tests__/integration/eight-sleep-chart-flow.test.ts (3 tests) 13ms
 ✓ src/__tests__/lib/webpush.test.ts (10 tests) 6ms
 ✓ src/__tests__/api/health.test.ts (5 tests) 7ms
 ✓ src/__tests__/api/sync.test.ts (7 tests) 19ms
 ✓ src/__tests__/integration/hydrate-prefer-true.test.ts (7 tests) 4ms
 ✓ src/__tests__/api/oura-sync.test.ts (3 tests) 9ms
 ✓ src/__tests__/lib/oauthTokens.test.ts (8 tests) 4ms
 ✓ src/__tests__/hooks/merge-habit-defs.test.ts (7 tests) 3ms
 ✓ src/__tests__/twilioParser.test.ts (9 tests) 4ms

 Test Files  45 passed (45)
      Tests  409 passed | 2 skipped (411)
   Duration  4.53s
```
Suite stays green with lane-f's two `it.fails` bug tests included (`src/__tests__/bugs/lane-f.test.ts` counted within the 45 passed files / 409 passed tests).
