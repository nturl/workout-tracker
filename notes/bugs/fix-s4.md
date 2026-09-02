# Fix lane S4 report (API routes, export, PWA)

Scope: `src/middleware.ts`, `src/app/api/labs/**`, `src/app/api/health-goals/**`,
`src/app/api/recovery/**`, `src/app/api/chat/**`, `src/app/api/extract-metrics/**`,
`src/app/api/biomarkers/**`, `src/components/recovery/ExportButton.tsx`,
`public/sw.js`, `public/manifest.json`, plus tests under
`src/__tests__/bugs/lane-f.test.ts` (not the F3 test) and `src/__tests__/api/*.test.ts`.

## BUG-10 (P1): `/api/labs` import doesn't invalidate cached health-goals

- Change: `src/app/api/labs/route.ts`
  - `"import"` case (line ~66-70): after `importLab(userId, action.data)`, added
    `await getRedis().del(\`user:${userId}:health-goals\`)`, mirroring
    `src/app/api/extract-labs/route.ts:189-191`.
  - `"delete"` case (line ~73-79): added the same invalidation — deleting a lab
    test changes the same underlying marker data goals are derived from, so it
    has the identical staleness bug. This wasn't explicitly named in the bug
    text ("Copy the invalidation from extract-labs" only mentions import) but
    is the same root cause; flagging it here in case it should be scoped out.
  - Added `import { getRedis } from "@/lib/redis"` at the top of the file.
- Verified: flipped `src/__tests__/bugs/lane-f.test.ts` BUG-F1
  (`it.fails` → `it`) — seeds a stale cached `health-goals` entry, calls the
  real `POST /api/labs` import handler, then the real `GET /api/health-goals`
  handler, and asserts the stale cached entry is gone. Passes.
- Tests flipped: `BUG-F1: labs import does not invalidate health-goals cache`
  in `src/__tests__/bugs/lane-f.test.ts`.

## BUG-12 (P1): protected API routes return HTML 404 instead of JSON 401 on unauthenticated fetch

Root cause (traced in `node_modules/@clerk/nextjs/dist/esm/server/protect.js`):
`auth.protect()`'s `handleUnauthenticated()` only redirects when the request
looks like a page navigation (`Sec-Fetch-Dest: document/iframe` or
`Accept: text/html`); a plain `fetch()` has neither, so it falls through to
Next's `notFound()` — an HTML 404 — which breaks any client code doing
`res.json()`.

- Fix approach: listed the affected routes as public in `middleware.ts`'s
  `isPublicRoute` matcher (same pattern already used for `/api/push`), so
  `auth.protect()` never runs against them, and rely on each handler's own
  `auth()` + JSON `401` check.
- Change: `src/middleware.ts` — added `/api/recovery(.*)`, `/api/chat(.*)`,
  `/api/extract-metrics(.*)`, `/api/labs(.*)`, `/api/biomarkers(.*)`,
  `/api/health-goals(.*)` to the matcher; exported `isPublicRoute` (was
  module-private) so it's directly testable; rewrote the doc comment to cover
  the whole list instead of just push.
- **Caught before landing**: `src/app/api/extract-metrics/route.ts` had *no*
  handler-level `auth()` check at all — it was relying entirely on
  `auth.protect()`. Simply adding it to the public-route list would have
  silently removed authentication from that endpoint (image-upload → Anthropic
  call, rate-limited but otherwise open to anyone). Added an explicit
  `auth()` + `401` guard (same shape as the other five routes) before the
  request-body handling, so the route is still fully gated — just via its own
  check instead of middleware.
- All five other target routes (`recovery`, `chat`, `labs`, `biomarkers`,
  `health-goals`) already had a handler-level `auth()` + `401 Unauthorized`
  JSON check; confirmed by reading each file, not just grep.
- Note: `/api/health-goals` was, incidentally, *already* being treated as
  public before this change — `path-to-regexp` (used by Clerk's
  `createPathMatcher`) compiles `"/api/health(.*)"` to a pattern that matches
  any path with that literal prefix, including `/api/health-goals` (verified
  directly: `createPathMatcher(["/api/health(.*)"])("/api/health-goals")` →
  `true`). So health-goals wasn't actually broken by BUG-12, just accidentally
  saved by an unrelated pattern. It's now listed explicitly for clarity so
  this isn't hidden behind a coincidental substring match.
- Verified:
  - `src/__tests__/api/middleware.test.ts` (new) — asserts `isPublicRoute`
    returns `true` for `/api/recovery`, `/api/chat`, `/api/extract-metrics`,
    `/api/labs` (+ subpaths), `/api/biomarkers`, `/api/health-goals`,
    `/api/push`, and still `false` for an unrelated route (`/api/sync`).
  - One JSON-401 test per route, each asserting `status === 401`,
    `content-type` includes `application/json`, and `json.error === "Unauthorized"`:
    - `src/__tests__/api/recovery.test.ts` (existing test strengthened)
    - `src/__tests__/api/extract-metrics.test.ts` (new test added — this is
      the one that actually exercises the new handler-level check)
    - `src/__tests__/api/labs.test.ts` (new — GET and POST)
    - `src/__tests__/api/chat.test.ts` (new)
    - `src/__tests__/api/biomarkers.test.ts` (new)
    - `src/__tests__/api/health-goals.test.ts` (new)
  - These tests call the route handlers directly (matching this repo's
    existing test pattern — Clerk is mocked via `src/__tests__/mocks/clerk.ts`,
    not exercised end-to-end), so they prove the handler's own 401 guard
    works; the `middleware.test.ts` test proves middleware won't shadow it.
    A true end-to-end run through `clerkMiddleware()` itself (real Clerk
    backend behavior) isn't exercised — that would need a running Next.js
    server + real/mocked Clerk instance, out of scope here.
- Not touched: `/api/oura/*` (status/sync/disconnect) — same underlying issue
  per lane BR's report, but not listed in this bug's route list and not in
  this lane's editable file set. Flagging for a separate pass.

## BUG-21 (P2): ExportButton CSV doesn't escape embedded quotes

- Change: `src/components/recovery/ExportButton.tsx:50` — added
  `.replace(/"/g, '""')` to the existing notes sanitizer chain (RFC 4180
  quote-doubling), after the comma/newline replacements.
- Checked the other free-text-looking columns in both CSVs
  (`src/components/recovery/ExportButton.tsx:22-53`): `feeling` is typed
  `1 | 2 | 3 | 4 | 5` (`src/types/workout.ts`), not free text; `duration` is a
  number; `key`/`completedAt` are generated slugs/ISO timestamps. `notes` is
  the only field that can contain arbitrary user text, so it's the only one
  needing escaping.
- Verified: flipped BUG-F2 (`it.fails` → `it`) in
  `src/__tests__/bugs/lane-f.test.ts`. Also had to fix a pre-existing,
  unrelated test-infra bug in that same file: `useWorkoutStore` (via
  `persist` middleware) resolves `localStorage` eagerly on first import, and
  this repo's happy-dom test env doesn't expose `window.localStorage` by
  default (same issue already documented/worked around in
  `src/__tests__/bugs/lane-c.test.tsx`). The file previously statically
  imported `useWorkoutStore`/`ExportButton` at the top, so BUG-F2's "failure"
  was actually a `Cannot read properties of undefined (reading 'setItem')`
  crash before the CSV assertion ever ran — not proof of the quote bug.
  Switched those two imports to a `beforeAll` that installs a localStorage
  stub first, then dynamically imports both modules (mirroring lane-c's
  pattern). With that fixed, the test genuinely exercises the CSV output and
  now passes against the real fix.
- Tests flipped: `BUG-F2: ExportButton does not escape quotes in workout notes CSV`
  in `src/__tests__/bugs/lane-f.test.ts`.

## BUG-28 (P3): sw.js precache list / stale-shell risk

- Kept the existing strategy as instructed (network-first navigation with
  cache fallback — never cache-first for HTML; cache-first only for
  extension-matched static assets; `self.skipWaiting()` on install and
  `self.clients.claim()` on activate were already both present and correct).
- Change: `public/sw.js` — bumped `CACHE_NAME`/`STATIC_CACHE`/`API_CACHE`
  from `v5` to `v6`, and added comments explaining:
  - The version-bump *is* the deploy-freshness mechanism here: the
    `activate` handler already deletes any cache name not in the current
    `validCaches` list, so bumping the suffix on a deploy that changes
    cached content discards the previous deploy's cached shell/assets. There
    is no build step wired to do this automatically (checked `next.config.mjs`
    and `package.json` — nothing post-processes `public/sw.js`), so it has to
    be a manual step each deploy; documented that explicitly in the file so
    it isn't silently forgotten.
  - Did **not** hand-precache hashed `_next/static/chunks/*` filenames, per
    instructions. Explained the tradeoff in a comment: the navigate handler
    already re-caches the HTML shell on every successful online load, and the
    static-assets handler is cache-first-with-network-fallback, so it
    self-heals for anyone who's online — a chunk referenced by a freshly
    fetched shell gets fetched and cached right behind it. The gap this
    leaves open is specifically: a user who goes fully offline before ever
    loading a given route in the current session can still get a cache-miss
    for that route's chunks (this was lane BR's Finding 5). Closing that gap
    fully would require a build-time asset manifest this static file has no
    access to — out of scope for a `public/sw.js`-only change.
- Not fixed / explicitly deferred: automatic per-deploy cache-name bumping
  (would need a build script templating `public/sw.js` or injecting a Next
  build ID — outside this file's reach and outside my edit scope, which
  doesn't include `next.config.mjs` or `package.json`). Flagging as a
  follow-up if that's wanted.
- No test added — this repo has no test harness for `sw.js` (grepped
  `src/__tests__` for any existing SW test; found none), and standing one up
  (mocking `self`, `caches`, `ExtendableEvent`, etc.) felt disproportionate to
  a comment + version-bump change. Manually re-read the file end-to-end to
  confirm the version bump doesn't change any handler behavior — it's a pure
  string change.

## Full-repo verification

```
$ npx vitest run
...
 FAIL  src/__tests__/bugs/lane-b.test.tsx > BUG-B1 ...
 FAIL  src/__tests__/bugs/lane-e.test.ts > BUG-E3 ...
 FAIL  src/__tests__/bugs/lane-c.test.tsx > BUG-C3 ...
 Test Files  3 failed | 48 passed (51)
      Tests  3 failed | 427 passed | 2 skipped (432)
```
The 3 failures are in `lane-b.test.tsx` (mergeHabitDefs), `lane-e.test.ts`
(sync schema), and `lane-c.test.tsx` (CircuitTimer) — all outside this lane's
file scope (`useWorkoutStore.ts`, `sync/route.ts`, timer components), all
owned by other concurrent fix lanes per the task's file-ownership warning, and
unrelated to anything touched here. Confirmed via `git status`/`git diff
--stat` that those source files are mid-edit by other lanes right now (not
touched by this lane).

Every test this lane owns/added passes: all of `src/__tests__/bugs/lane-f.test.ts`
(BUG-F1, BUG-F2, and BUG-F3 — the latter untouched, per instructions, and
already `it` not `it.fails` when I got to it) and every route/middleware test
listed above under BUG-12.

```
$ npx tsc --noEmit
src/hooks/useWorkoutStore.ts(357,19): error TS2739: Type '{...}' is missing
the following properties from type 'WorkoutState': getSyncDelta, clearDirty
```
This is the only `tsc` error, and it's inside `useWorkoutStore.ts` (not in
this lane's scope, being edited by another lane concurrently — the missing
members are `getSyncDelta`/`clearDirty`, unrelated to anything this lane
touched). `tsc --noEmit` on this lane's own files (middleware, labs,
extract-metrics, ExportButton) produces no errors of its own; this single
pre-existing/concurrent error is the only one in the whole-repo run.

```
$ npx eslint src/middleware.ts src/app/api/labs/route.ts \
    src/app/api/extract-metrics/route.ts src/components/recovery/ExportButton.tsx \
    src/__tests__/api/*.test.ts src/__tests__/bugs/lane-f.test.ts
/Users/noelturlington/dev/workout-tracker/src/__tests__/bugs/lane-f.test.ts
  117:36  warning  '_opts' is defined but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (0 errors, 1 warning)
```
That warning is pre-existing (the `FakeBlob` constructor's unused `_opts`
param in the BUG-F2 test, not something this lane added or needs to fix — it
predates this lane's edits to that block).

## Files changed by this lane

- `src/middleware.ts`
- `src/app/api/labs/route.ts`
- `src/app/api/extract-metrics/route.ts`
- `src/components/recovery/ExportButton.tsx`
- `public/sw.js`
- `src/__tests__/bugs/lane-f.test.ts` (flipped F1/F2, fixed localStorage
  test-infra bug; did not touch the F3 block)
- `src/__tests__/api/recovery.test.ts` (strengthened existing 401 test)
- `src/__tests__/api/extract-metrics.test.ts` (added 401 test)
- `src/__tests__/api/labs.test.ts` (new)
- `src/__tests__/api/chat.test.ts` (new)
- `src/__tests__/api/biomarkers.test.ts` (new)
- `src/__tests__/api/health-goals.test.ts` (new)
- `src/__tests__/api/middleware.test.ts` (new)

No `next build`, commit, push, or destructive git commands were run.
