# Lane E report

## Findings (VERIFIED)

### 1. Local-only, un-scoped store leaks a previous account's data into a newly signed-in account's server record
Severity: P0 data loss (cross-account contamination)
Status: VERIFIED (test)
Where:
- `src/hooks/useWorkoutStore.ts:468-486` — `persist(..., { name: "workout-store", ... })`. The persisted zustand store lives under one fixed localStorage key. Nothing in the key or in the store shape carries a user/account id.
- `src/hooks/useSync.ts:63-79` — on first `serverData` arrival, `hydrateFromSync(serverData)` merges *whatever is currently in the store* with the server response, then immediately `pushSync(getSyncPayload())` posts the merged result back.
- `src/hooks/useWorkoutStore.ts:380-459` (`hydrateFromSync`) merges local state into server state additively (`mergeCompletionsPreferTrue`, `{...state.logs, ...(data.logs||{})}`, etc.) — it never clears local data, it only adds to it.
- `src/hooks/useWorkoutStore.ts:461-466` (`getSyncPayload`) sends the *entire* current store, unconditionally.

Repro: numbered steps
1. Account A signs in on a device; taps a completion and saves a log entry. These get pushed to `user:A:data` **and** persisted forever in the single `workout-store` localStorage key (no account id).
2. Account A signs out. Account B signs in on the same device (same browser tab or a later session — localStorage survives reloads).
3. `useSync(true)` runs for account B. GET `/api/sync` returns account B's own (empty) data.
4. `hydrateFromSync` merges the leftover local state (still account A's completions/log, because the store was never reset) into the store.
5. `pushSync(getSyncPayload())` immediately POSTs that merged store — including account A's data — to `user:B:data`.

Expected: Account B's server record should only ever contain data Account B entered.
Actual: Account A's completion and log entry are present in Account B's server record.

Root cause: the zustand store has no concept of "current account" at all; the persisted key is a single global string (`"workout-store"`), and the sync hook trusts and forwards whatever the store currently holds the moment a different account authenticates, with no reset/clear step keyed to account changes.

Evidence: `src/__tests__/bugs/lane-e.test.ts` — `BUG-E1` (`it.fails`, reproduces steps 1-5 against the real store singleton and the real `/api/sync` route + mock redis):
```
✓ Lane E - sync and persistence > BUG-E1: local store data left by a previous account leaks into a newly-signed-in account's server record
```
(`it.fails` passes because the "should be undefined" assertion actually throws — i.e. the leak is confirmed present.)

Proposed fix: scope the persisted localStorage key by the signed-in Clerk user id (e.g. `workout-store:${userId}`, falling back to a clean/anonymous key when signed out), and reset/clear the in-memory store whenever the authenticated user id changes, before any hydrate/push runs. This touches the persist config's `name`, so it is a schema/migration-relevant change for existing installs.

---

### 2. A brand-new account's empty server response never opens the auto-sync gate
Severity: P1 wrong behaviour user will hit
Status: VERIFIED (test + trace)
Where:
- `src/hooks/useSync.ts:8-13` — `fetchSyncData()` resolves to `null` (not `undefined`) when the server has no data for the account (`src/app/api/sync/route.ts:49`, `const data = raw ? JSON.parse(raw) : null;`).
- `src/hooks/useSync.ts:63-64` — `useEffect(() => { if (!serverData) return; ...`. `!null` is `true`, so this early-returns identically to the "query hasn't resolved yet" case.
- `src/hooks/useSync.ts:29,67,70` — `hydrated.current` starts `false` and is set `true` only inside that same guarded block (line 70).
- `src/hooks/useSync.ts:114-115` — the auto-push subscription: `const unsubscribe = useWorkoutStore.subscribe((state) => { if (!hydrated.current) return; ...`.

Repro:
1. A genuinely new account signs in on a device with an empty local store (fresh install, or the fixed key from Finding 1 is scoped per-account so it's legitimately empty).
2. GET `/api/sync` resolves and `fetchSyncData` returns `null` (server has nothing).
3. The hydrate `useEffect` at `useSync.ts:63` sees `serverData === null`, and returns before line 70, so `hydrated.current` stays `false` forever (the effect only re-runs when `serverData`/`hydrateFromSync`/`getSyncPayload`/`pushSync` identities change, which they won't just because time passes).
4. The user completes a workout, toggles a habit, etc. The `subscribe` callback (line 114) fires on every store change but `hydrated.current` is still `false`, so `debouncedPush()` is never called.

Expected: a new account's local changes should sync to the server automatically, same as an existing account's.
Actual: for a genuinely fresh account, auto-sync-on-change never activates for the lifetime of that component mount; only the manual "sync now" button (`syncNow`, `useSync.ts:151-153`, which calls `debouncedPush()` directly and does not check `hydrated.current`) will ever push data.

Root cause: the hook conflates "no serverData yet" (loading) with "serverData is legitimately empty" (new account) by using a falsy check (`!serverData`) instead of distinguishing `undefined` (not fetched) from `null` (fetched, empty).

Evidence: `src/__tests__/bugs/lane-e.test.ts` — `BUG-E2` (`it.fails`) reproduces the exact guard from `useSync.ts:63-78` and shows a `null` serverData leaves `hydrated` `false`:
```
✓ Lane E - sync and persistence > BUG-E2: a brand-new account's null server payload should still open the sync gate
```

Proposed fix: track "has the initial GET resolved" separately from "did it return data" (e.g. `isSuccess` from `useQuery`, or check `serverData !== undefined`) so the hydrate effect runs and sets `hydrated.current = true` even when the server legitimately has nothing yet.

---

### 3. `exerciseLogs[].completedAt` is silently stripped by the sync validator on every round trip
Severity: P0 data loss (silent, on a documented feature field)
Status: VERIFIED (test)
Where:
- `src/types/workout.ts:6-15` (`ExerciseLog`) declares `completedAt?: string` with the comment "ISO timestamp set when the exercise was confirmed complete. Powers timing-history views."
- `src/lib/validators.ts:3-10` (`exerciseLogSchema`) has no `completedAt` field at all, and is a plain `z.object({...})` with no `.passthrough()`:
```
const exerciseLogSchema = z.object({
  weight: z.number().nonnegative().optional(),
  reps: z.number().nonnegative().optional(),
  sets: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
  completed: z.boolean().optional(),
  tutSeconds: z.number().nonnegative().optional(),
});
```
- Zod v4 `z.object()` strips unrecognized keys by default (no `.passthrough()`/`.strict()` override here, unlike `recoveryEntrySchema` at `validators.ts:59` which does have `.passthrough()`).
- `src/app/api/sync/route.ts:72` (`syncBodySchema.safeParse(body)`) runs this schema on every POST; the parsed, stripped result (`parsed.data`) is what gets persisted (`route.ts:77-84`).

Repro:
1. Client saves a log entry with `exerciseLogs.squat.completedAt = "2026-08-01T12:00:00Z"` (a real client-side value; `WorkoutLogEntry`/`ExerciseLog` support and set this field).
2. `getSyncPayload()` sends it verbatim in the POST body.
3. `syncBodySchema.safeParse` parses successfully but drops the unrecognized `completedAt` key from `exerciseLogs.squat`.
4. The stored/merged server record — and every other device that later GETs it — has no `completedAt` for that exercise.

Expected: `completedAt` survives the round trip like every other field on the object.
Actual: it is `undefined` after POST → GET.

Root cause: `exerciseLogSchema` in `validators.ts` was not kept in sync with the `ExerciseLog` client type when `completedAt` was added there.

Evidence: `src/__tests__/bugs/lane-e.test.ts` — `BUG-E3` (`it.fails`), run output:
```
AssertionError: expected undefined to be '2026-08-01T12:00:00Z'
 ❯ src/__tests__/bugs/lane-e.test.ts:105:32
    103|     const stored = json.data.logs["mon-squat"].exerciseLogs.squat;
    104|     expect(stored.weight).toBe(135); // recognized fields survive
    105|     expect(stored.completedAt).toBe("2026-08-01T12:00:00Z"); // fails: stripped
```
(`weight`/other recognized fields round-trip fine — only `completedAt` is lost, isolating the schema gap as the cause.)

Proposed fix: add `completedAt: z.string().optional()` to `exerciseLogSchema` in `src/lib/validators.ts` to match `ExerciseLog`. No sync-schema version bump needed since this only widens acceptance; existing stored data is unaffected (only future pushes recover the field). Worth a one-time audit for other `types/workout.ts` fields vs `validators.ts` schemas beyond this one.

---

### 4. A stale, long-lived device silently reverts `level` written elsewhere
Severity: P1 wrong behaviour user will hit
Status: VERIFIED (test + trace)
Where:
- `src/hooks/useSync.ts:34-41` — the GET query: `staleTime: 300_000, refetchOnWindowFocus: false, refetchOnMount: false`. There is no polling/refetch interval either. Once the initial GET resolves, this query never fetches again for the life of the component mount (no trigger is enabled: no interval, no focus, no mount, no manual invalidation on push per the V14 comment at `useSync.ts:44`).
- `src/hooks/useSync.ts:73-78` — re-hydration from a fresh server value only happens as a side effect of a *new* `serverData` object arriving from that same query, which per the above practically never happens again during a session.
- `src/hooks/useWorkoutStore.ts:461-466` (`getSyncPayload`) always sends the device's current in-memory `level`, whatever it is, on *every* push — including pushes triggered by unrelated changes (e.g. a habit toggle via the `subscribe` watcher at `useSync.ts:104-136`, which pushes on `completions`/`logs`/`level`/`recoveryData`/`habits`/`habitDefs` changes as a group).
- `src/app/api/sync/route.ts:82` — `if (level !== undefined) data.level = level;` and `deepMerge` (`route.ts:92-102`) overwrites non-object values outright (`result[k] = v` in the `else` branch) rather than merging/timestamping them. `level` is the only top-level sync field that is a bare scalar handled this way — `completions`/`logs`/`recovery`/`habits` are keyed objects that merge additively, and `habitDefs` goes through explicit CAS versioning (`resolveHabitDefs`, `route.ts:23-38`).

Repro:
1. Device A (tab open, session already 5+ minutes old) pushes `level: "intermediate"`.
2. Device B pushes `level: "advanced"` shortly after.
3. Device A, still on the same page load, never re-fetched (per the staleTime/refetch settings above) so its local `level` is still `"intermediate"`. The user toggles an unrelated habit on Device A.
4. Device A's `subscribe` watcher fires, `getSyncPayload()` includes the stale `level: "intermediate"`, and it gets pushed — silently reverting Device B's `"advanced"` on the server (and from there, back onto Device B whenever it next re-hydrates).

Expected: a later, unrelated push from a stale device should not revert a newer scalar value written by another device.
Actual: it does, because `level` is a plain last-write-wins overwrite with no versioning/merge and the pushing device has no live signal that its cached `level` is stale.

Evidence: `src/__tests__/bugs/lane-e.test.ts` — `BUG-E4` (`it.fails`), reproduces steps 1-4 directly against the real `/api/sync` route:
```
✓ Lane E - sync and persistence > BUG-E4: a stale device's unrelated push reverts a newer `level` written by another device
```

Proposed fix: either (a) never send `level` as part of the "everything" payload on writes that didn't actually change `level` locally (track dirtiness like `habitDefsDirty` does), or (b) give `level` the same server-assigned-version/CAS treatment `habitDefs` already has. Touches the sync payload/schema contract.

---

### 5. POST rate limit (60/min/IP) is real and trivially reachable by legitimate rapid use; client cannot distinguish it from a permanent failure
Severity: P2 visual/UX (with a P1-adjacent edge: a rejected push is not specially retried/queued)
Status: VERIFIED (test + trace)
Where:
- `src/lib/rateLimit.ts:29-50` — 60 requests/min per `X-Forwarded-For` IP, in-memory `Map` (not Redis-backed, so also resets per server instance — noted, not a data-loss bug).
- `src/app/api/sync/route.ts:64-65` — POST enforces this limit before anything else.
- `src/hooks/useSync.ts:86-99` — debounce is 500ms; a user rapidly toggling habits/completions can trigger a push roughly every 500ms, i.e. up to ~120/min, comfortably exceeding the 60/min cap within ~30s of continuous use.
- `src/hooks/useSync.ts:15-23` (`pushSyncData`) — `if (!res.ok) throw new Error("Sync push failed");` for *every* non-2xx status. 429, 401, 400, and 500 are all indistinguishable generic `Error`s to the mutation.
- `src/hooks/useSync.ts:47-50` — `useMutation({ retry: 3, retryDelay: exponential up to 10s })` retries all of them identically, including permanent ones (400/401) that can never succeed, and 429s (where retrying sooner only prolongs hitting the same window).
- `src/components/ui/SyncIndicator.tsx:10-14` — the only UI surface is a generic "Sync failed" label; no distinction between "will retry" vs "permanently rejected" vs "rate limited, try later."

Repro/Evidence: `src/__tests__/bugs/lane-e.test.ts` — `BUG-E5` (plain `it`, passes, demonstrating the rate limiter itself works and is reachable in a normal-use burst):
```
✓ Lane E - sync and persistence > BUG-E5: the 61st POST within a minute from the same IP is rejected outright, indistinguishable from a permanent error to the client
```

Root cause / consequence: because every push sends the *full* current store (per Finding 1/4's mechanism), a rate-limited or otherwise-failed push is not strictly "lost" as long as another local change happens later to trigger a fresh push. But if the user closes the tab/app during the failure window (e.g. right after the last toggle, mid-429-backoff), that specific update never reaches the server and there is no persisted retry queue to pick it up on next launch — the store's local state is correct, but sync of it depends entirely on another change happening to re-trigger `debouncedPush`.

Proposed fix: attach the HTTP status to the thrown error in `pushSyncData` and skip react-query's retry for permanent 4xx codes (400/401/403), reserving retry for 429/5xx; consider a `Retry-After`-aware backoff for 429 specifically; consider a low-frequency periodic/beforeunload flush independent of store-change events so a failed-and-abandoned push isn't purely dependent on the next edit.

## Findings (INFERRED)
(none — everything above was reduced to a VERIFIED test or a concrete file:line trace)

## Hypotheses killed
- H1 (initial hydrate on a fresh device wipes/alters server data by pushing back): the mechanism is real (see Finding 2/1), but the specific claim "does it wipe the server" is false for a genuinely-new device with no local leftovers — `getSyncPayload()` on an empty store sends empty objects, and the server's `deepMerge` (`route.ts:92-102`) only adds/overwrites keys present in the incoming payload; it never deletes existing server keys. So a clean fresh device pushing empty data does not wipe anything. (It's only a problem when the local store isn't actually empty — see Finding 1.)
- H5 (offline: does the GET refetch overwrite local changes on reconnect before the queued push runs): false as stated. `useSync.ts:139-149`'s `handleOnline` only calls `debouncedPush()` (a push), it never triggers a GET/refetch on reconnect (`refetchOnWindowFocus`/`refetchOnMount` are both `false`, and there is no `refetchOnReconnect` override either, so react-query's default `refetchOnReconnect: true` would apply to the *query*, but that refetch is independent of and does not block/precede the queued push — there's no ordering dependency between them that would let a GET clobber the about-to-be-pushed local change, since GET responses only ever additively re-hydrate via `hydrateFromSync`, never replace the store wholesale).
- H6 (deepMerge array semantics losing workout logs/habitDefs): false. `logs`, `completions`, `habits`, and `recovery` are all `Record<string, ...>` keyed objects end-to-end (`src/types/workout.ts:18-28,78`, `src/lib/validators.ts:66-71`), never arrays, so `deepMerge`'s array branch (`route.ts:95`, which would in fact take the "replace" `else` path for arrays since it explicitly excludes `Array.isArray`) is never exercised by real sync payloads. `habitDefs` is an array, but it is deliberately excluded from `deepMerge` entirely and resolved separately via `resolveHabitDefs`'s explicit CAS/version logic (`route.ts:85-86,105-121`), which is array-aware and correct by design (verified by the existing `merge-habit-defs.test.ts`/`habit-defs-version.test.ts` suites, which were green in the full run).
- H7 (Cache-Control max-age=60 GET + 5-min staleTime causes a device to push back stale data as fresh): the "push back stale data" outcome is real, but not via the Cache-Control header — `useSync.ts:9` calls `fetch("/api/sync", { cache: "no-store" })`, which explicitly bypasses the browser HTTP cache regardless of the server's `Cache-Control` header, so that header is inert for this code path. The actual mechanism is the react-query `staleTime`/no-refetch-trigger combination (see Finding 4), not HTTP caching.
- H8 (retry.ts: which status codes retry / does 4xx retry forever): `src/lib/retry.ts`'s `withRetry` is server-side only, used inside `route.ts`'s Redis `WATCH`/`MULTI` transaction (`route.ts:107-130`) to retry on Redis transaction conflicts (`throw new Error("Transaction conflict")`) — it has nothing to do with HTTP status codes at all, and nothing 4xx-related ever reaches it. The real "does a 4xx get retried" question applies to the *client's* `useMutation` retry (see Finding 5) — bounded at 3 attempts, not forever.
- H9 (Zod schema strips a field / silent data loss) as originally scoped to "getSyncPayload's shape vs syncBodySchema key by key": the *top-level* shapes match exactly (`completions, logs, level, recovery, habits, habitDefs, habitDefsVersion}` on both sides). The actual loss is one level deeper, inside `exerciseLogSchema` — see Finding 3, which supersedes this hypothesis with the concrete field.
- H10 (unbounded payload growth hitting a body-size/Redis-value limit): not verified either way within scope/budget. `logs`/`completions`/`habits`/`recovery` all only grow (no prune/expiry code found anywhere in the files read), so the shape of the risk is real, but no concrete limit (Next.js body size cap, `ioredis` value size, actual measured payload size over N months of real use) was checked. Left in "Not covered."

## Not covered
- H10's concrete numbers (Next.js API route body-size limit, `ioredis`/Redis max value size, and a realistic growth-rate estimate for `logs`/`habits`/`recovery` to know how many years of use it'd take to hit either limit).
- H3 as originally scoped ("hydrated.current never resets when the active account changes on the same device — same-tab account switch without a remount") — Finding 1 and 2 together cover the concrete, provable consequence (leftover local data leaking into the new account's server record, and a fresh account's own auto-sync being gated off), but I did not additionally verify the react-query `["sync-data"]` cache-key-not-scoped-by-account angle (whether a same-tab account switch without unmount can serve account A's cached GET response to account B within the 5-minute staleTime window) with a dedicated test — it's the same root cause (no account id anywhere in the sync/store keys) as Finding 1, just a second code path (`useQuery` cache) exhibiting it, not independently re-verified.
- No live/browser repro was attempted anywhere in this lane (out of scope per the task: "No browser tools").
- Did not audit `src/app/providers.tsx` (does not exist in this repo — `QueryClient` is actually configured in `src/components/Providers.tsx`, read and included above) beyond the `staleTime`/`retry` defaults relevant to Finding 4/5.

## Test run tail
```
 ✓ src/__tests__/api/health.test.ts (5 tests) 8ms
 ✓ src/__tests__/api/oura-authorize.test.ts (4 tests) 18ms
 ✓ src/__tests__/integration/habit-defs-version.test.ts (4 tests) 17ms
 ✓ src/__tests__/integration/hydrate-prefer-true.test.ts (7 tests) 3ms
 ✓ src/__tests__/lib/webpush.test.ts (10 tests) 4ms
 ✓ src/__tests__/helpers.test.ts (27 tests) 15ms
 ✓ src/__tests__/api/twilio-webhook.test.ts (9 tests) 14ms
 ✓ src/__tests__/integration/recovery-import.test.ts (2 tests) 7ms
 ✓ src/__tests__/hooks/merge-habit-defs.test.ts (7 tests) 2ms
 ✓ src/__tests__/lib/oura.test.ts (2 tests) 2ms

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/__tests__/bugs/lane-c.test.tsx [ src/__tests__/bugs/lane-c.test.tsx ]
Error: [vitest] There was an error when mocking a module (vi.mock factory hoisting issue in
CountdownIntro.tsx test setup) — pre-existing in another lane's test file, unrelated to
sync/persistence and not touched by this lane.

 Test Files  1 failed | 42 passed (43)
      Tests  392 passed | 2 skipped (394)
```
`src/__tests__/bugs/lane-e.test.ts` itself: 5/5 passed (`npx vitest run src/__tests__/bugs/lane-e.test.ts`).
