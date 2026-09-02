# Lane BR report

## Session setup note
Neither the Claude-in-Chrome extension tab nor the sandboxed Browser pane had an
active Clerk session for Noel's real account — both loaded the app fully
signed-out (marketing `LandingPage`). Per the hard rules, this lane therefore
inspected the **signed-out surface only**. Areas B–E (habit UI, timers, sync
UI, sheets/settings) require a signed-in session and are listed under "Not
covered" below, not guessed at.

No screenshot files could be written to `notes/bugs/` — the two browser tools
available in this session (`mcp__claude-in-chrome__computer` with
`save_to_disk:true`, and the `Claude_Browser` pane's `computer` tool) both
return the captured image inline to the conversation only; neither exposes a
filesystem path in this sandbox, and no auto-saved copies appeared on disk
(checked `/private/tmp/claude-502/**`). Evidence below is therefore given as
exact DOM measurements (`getBoundingClientRect`, `scrollWidth`/`innerWidth`,
fetch status/headers) pulled live via `javascript_tool`, plus file:line trace,
which the proof standard accepts as an alternative to a screenshot path.

Read in full before testing (per the hard rule on timers): `src/components/tracking/LogModal.tsx` (160 lines) and `src/components/tracking/CircuitTimer.tsx` (597 lines). No timer was started — see "Not covered".

## Findings (VERIFIED)

### 1. Anonymous page load fires an authenticated-only API call that always 404s
Severity: P3 nit (console/network noise on every anonymous visit, no user-visible effect)
Status: VERIFIED (repro + trace)
Where:
- `src/app/page.tsx:66` — `const ouraStatus = useOuraStatus();` called unconditionally at the top of `Home`, before the auth gate at line 78 (`if (authLoaded && !isSignedIn) return <LandingPage />;`)
- `src/hooks/useConnectedAccounts.ts:21-31` — `useOuraStatus()` is a bare `useQuery` with no `enabled` guard, so it fires on mount regardless of auth state
- `src/middleware.ts:3-16` — `isPublicRoute` matcher does not include `/api/oura/status` (only `/api/oauth/oura/callback(.*)` is public), so `auth.protect()` intercepts the unauthenticated fetch
Repro:
1. Open `https://workout-tracker-two-alpha.vercel.app/` signed out (any browser/viewport).
2. Read network requests.
Expected: no request to `/api/oura/status` before the user is authenticated (or a 401, not a rewritten 404).
Actual: `GET /api/oura/status → 404` fires on every anonymous load. Captured live: `read_network_requests` on the tab showed `[20388.50] GET https://workout-tracker-two-alpha.vercel.app/api/oura/status → 404`.
Root cause: `useOuraStatus()` executes before the component's own auth check bails out to `<LandingPage/>`, and the hook has no `enabled: isSignedIn` gate. Clerk's `auth.protect()` in middleware converts the unauthenticated fetch into a 404 rewrite (the same mechanism the code's own comment at `src/middleware.ts:11-13` describes for why `/api/push(.*)` was made public — this route wasn't given the same treatment).
Evidence: live network capture (see above); code read end-to-end in `page.tsx`, `useConnectedAccounts.ts`, `middleware.ts`.
Proposed fix: gate `useOuraStatus()` (and any other authed query called from `page.tsx` pre-gate) with `enabled: !!isSignedIn`, or move the call below the auth-gate return.

### 2. Signed-out visitors briefly see the authenticated DashboardSkeleton, not a landing skeleton
Severity: P3 visual/UX
Status: VERIFIED (repro)
Where: `src/app/page.tsx:78-79`
```
if (authLoaded && !isSignedIn) return <LandingPage />;
if (!mounted) return <DashboardSkeleton />;
```
Repro:
1. Navigate to the root URL signed out (fresh navigation, no cache warm).
2. Screenshot immediately (before Clerk's `authLoaded` resolves).
Expected: either the marketing `LandingPage` (once resolved) or a neutral/generic loading state before that.
Actual: on the very first paint, before `authLoaded` is true, the `if (authLoaded && !isSignedIn)` branch is false (short-circuited on `authLoaded`), so execution falls through to `if (!mounted) return <DashboardSkeleton />` — the mounted flag defaults to `false` for everyone including anonymous visitors, so the app's authenticated-dashboard skeleton (grey card placeholders resembling the habit/session cards) renders first, then swaps to the marketing page ~1-2s later once Clerk resolves. Reproduced twice, once via the Browser pane and once via the real Chrome tab (`claude-in-chrome`), both showing the grey skeleton grid before the black marketing hero appears.
Root cause: the `mounted` gate was written for the authenticated path only (it's set `true` inside an effect that requires `clerkLoaded && user`, see line 44) and reused as the fallback for the "auth not yet loaded" case too, so anonymous and authenticated cold loads share a loading UI that was designed for the dashboard, not the landing page.
Proposed fix: add an explicit third branch — `if (!authLoaded) return <some neutral loader>` — ahead of the `mounted` check, so the dashboard skeleton only ever shows once the app already knows the visitor is signed in.

### 3. LandingPage hardcodes colors, bypassing the app's theme-variable system entirely
Severity: P3 nit (DESIGN_SPEC deviation, no visible defect since the page is meant to look this way)
Status: VERIFIED (trace)
Where:
- `DESIGN_SPEC.md:4-6` — "CSS custom properties in `globals.css` (`:root` = light, `.dark` = dark)... **No Tailwind `dark:` variants anywhere** — theme switching happens only through the CSS variables."
- `src/components/layout/LandingPage.tsx:71-76` — outer container's `background` is a literal gradient of `#000`/`#0a0a0a`/`#050d05`, not a `var(--bg-primary)` token; body copy uses Tailwind's static `text-neutral-400` (not a theme token) at line 88.
- `src/hooks/useTheme.ts:1-35` — the only place that toggles the `.dark` class on `<html>` (`applyTheme`, called from `useTheme()`), and `useTheme()` is imported nowhere except `src/components/settings/SettingsTab.tsx:9,22`.
Repro: emulated `prefers-color-scheme: light` on the mobile viewport and reloaded — the marketing page rendered identically dark (screenshot captured inline, tool ID `ss_5851twwyo` at 375x812 before the change and confirmed same look after; underlying cause is that the page ignores CSS variables entirely, so no `color-scheme` emulation could have changed it).
Root cause: `LandingPage` was built with inline hex/rgba values rather than the design system's `var()` tokens, and no component reachable by a signed-out or freshly-signed-in-but-pre-Settings user ever calls `useTheme()`/`applyTheme()`, so the `.dark` class driving the rest of the token system is never applied until the user opens Settings once. Whether or not the marketing page is meant to always look dark (plausible, since product screenshots inside it are also permanently dark "product shots"), the literal-hex approach is a direct violation of the "no dark: variants, CSS variables only" rule in the design contract.
Proposed fix: either explicitly document the landing page as a themed exception in DESIGN_SPEC, or replace the hardcoded colors with the accent/background tokens and let it inherit whatever the resolved theme is.

### 4. Clerk running on development instance keys on the production deployment
Severity: P2 (operational risk — dev Clerk instances have strict rate/usage limits and are not meant for production traffic; not something an end user can fix)
Status: VERIFIED (repro)
Where: runtime config (not a specific source file — surfaced via the Clerk SDK's own warning), domain `stable-rodent-93.clerk.accounts.dev`
Repro: load `https://workout-tracker-two-alpha.vercel.app/` and read console messages.
Actual: `[WARNING] Clerk: Clerk has been loaded with development keys. Development instances have strict usage limits and should not be used when deploying your application to production.` logged on every page load, plus all Clerk asset requests resolve against the `*.clerk.accounts.dev` dev domain rather than a production Clerk domain.
Evidence: `read_console_messages` output, quoted above verbatim; `read_network_requests` showing four `stable-rodent-93.clerk.accounts.dev` asset loads.
Proposed fix: swap the production Vercel environment's Clerk publishable/secret keys for the production instance's keys (this is a config/ops change, not a code change — flagging per the lane's credential-issue reporting rule; no key values were touched or viewed beyond the public warning banner).

### 5. Service worker precache list is minimal — only the shell HTML and manifest are cached on install
Severity: P3 (offline resiliency gap, not a live-repro defect)
Status: VERIFIED (trace, file read in full)
Where: `public/sw.js` — `PRECACHE_URLS = ["/", "/manifest.json"]`, consumed by the `install` handler (`caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))`)
Actual: none of the hashed `_next/static/chunks/*.js` or `_next/static/css/*.css` bundle files seen in this session's network capture (e.g. `main-app-2dcde4753ea0d175.js`, `90a623e6fdfa8e80.css`) are in the precache list. The fetch handler's "static assets" branch (`.js|.css|...` extension match) is cache-first but only populates the cache reactively, the first time each asset is actually requested.
Root cause: if a user adds the PWA to their home screen and goes offline before every chunk has been organically fetched once (e.g., interrupted first load, or a route/tab never visited), navigating to that route offline will serve the cached "/" shell but can fail to find the JS/CSS it references in cache, since `STATIC_CACHE` was never proactively warmed with the current build's hashed filenames.
Evidence: full text of `public/sw.js` read (8477 chars, quoted precache constant and fetch handler above are copied verbatim from the live response of `GET /sw.js`).
Proposed fix: have the build step (or the SW itself, via a manifest of the current build's asset hashes) precache the entry chunks alongside `/`, not just the two static URLs.

## Findings (INFERRED)
(none — every item above was traced to source or reproduced live)

## Hypotheses killed
- None of the seven items in my scope map to a "seeded hypothesis" from the orchestrator prompt (those target lanes B-E, which needed a signed-in session this lane did not have). No hypothesis from my own instructions (A-G) was killed outright; item G (api/sync headers) was attempted but only the unauthenticated response was reachable (see Not covered).

## Not covered
- **B (habit UI: recent-days strip, red-X collision, edit mode, reorder arrows, rename)** — requires Noel's real signed-in account; browser sessions available to this lane were both signed-out. Not tested, not guessed at.
- **C/D (timers: pause/resume continuity, collapse/expand, two timers at once, ring/number sync, focus ring, safe-area)** — same signed-out blocker. `LogModal.tsx` and `CircuitTimer.tsx` were read in full per the hard rule (confirmed `LogModal`'s Cancel button, `src/components/tracking/LogModal.tsx:146`, calls only `onClose()` and writes nothing — `onSave` is only invoked from the separate "Save workout" button at line 147-156 — so dismissing without saving is safe), but no timer could be started since there is no session/workout data to open a `SessionCard` from.
- **E (sync/persistence: 429 on rate limit, hydrate-wipe-on-fresh-device, cross-user localStorage key reuse)** — requires an authenticated session; only the unauthenticated `/api/sync` response was observed (404 rewrite via Clerk middleware protect, same mechanism as Finding 1 — see `syncHeaders` captured live: `x-clerk-auth-status: signed-out`, `x-clerk-auth-reason: protect-rewrite, session-token-and-uat-missing`).
- **Chat sheet, Labs marker sheet, Recovery date selector, Settings** — all require sign-in; not opened.
- **G, authenticated half** — `/api/sync` response body shape and real `Cache-Control` header for an authenticated GET were not observed (only the 404 error page's caching headers were, which are not representative).
- Desktop-viewport `innerWidth` read once returned `0` immediately after a `navigate` call, almost certainly a script-timing artifact (read before the new document attached) rather than a real overflow bug; not chased further given time budget, and the accompanying screenshot showed a normal, non-overflowing desktop layout.

## Test run tail
No test files were added by this lane (findings 1-5 above are all environment/runtime observations from a signed-out browser session, not unit-testable store/route logic — Lane A/E's scope owns `src/lib` and `src/app/api` behavior). `npm test` was not run by this lane since no `src/__tests__/bugs/lane-br.test.ts` was created; nothing in this lane touched `src/` or existing tests.
