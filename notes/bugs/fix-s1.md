# Fix lane S1 — sync and persistence

Date: 2026-09-01. Branch: master. All ten assigned bugs fixed.

Final gates: `npx tsc --noEmit` clean (exit 0). `npx vitest run` — 3 failures, all in
`lane-c.test.tsx` / `lane-d.test.tsx` (timer + design-system lanes, files this lane
never touched and which are being edited concurrently in this tree). Everything in
S1's scope: **17 files / 158 tests, all passing**.

---

## BUG-01 (P0) — server merge design

### The decision

The old contract was "every push carries the device's whole store, and the server
overwrites every leaf it sees." Last-write-wins per leaf is only safe if every leaf in
the payload is genuinely a write, and it was not: a device whose snapshot was minutes
old restated hundreds of keys it had merely *read*, reverting whatever another device
had changed in the meantime.

**Chosen: dirty-key deltas with explicit tombstones.** The client tracks which keys it
changed since its last acked push and sends only those; absence now means "I did not
touch this", not "I believe this is unset". Applying such a payload over stored state
is then exactly the additive per-key merge `deepMerge` already implements — no
timestamps, no vector clocks, no change to the shape of the stored Redis blob.

Because absence no longer erases, removal had to become explicit: keys listed in
`tombstones` are deleted after the merge. That is what makes a habit date go back to
genuinely **unrecorded** (`undefined`) rather than to the tri-state "missed" (`false`)
— requirement (b), and the hook BUG-13/14 needs.

**Rejected: per-leaf timestamps.** It would have doubled the size of a stored value
that already grows without bound for this user, required migrating every existing
leaf, and still depended on a trusted device clock — the exact failure that
`habitDefsVersion` (server-assigned) was introduced to fix. The delta approach needs
no migration of stored data at all.

**Backward compatibility (requirement c).** A push with no `syncMode` is a legacy
full-map push from an older cached PWA bundle. It takes the identical code path it
always did: `deepMerge` over the whole payload. Such a client can still revert a key
it did not change — unchanged from today, and self-healing once that device loads the
current bundle. Tombstones are honoured whenever present rather than gated on
`syncMode`, so they are purely additive.

Ordering is merge-then-delete, so a key both written and tombstoned in one push
resolves deterministically (removal wins). Tombstoning an absent key is a no-op, so
retries and duplicate debounces are safe.

The full design note is in the file, as asked: `src/app/api/sync/route.ts:9-59`.

### Changes

| File | Lines | Change |
|---|---|---|
| `src/app/api/sync/route.ts` | 9-59 | Design note. |
| `src/app/api/sync/route.ts` | 127 | Destructure `tombstones`. |
| `src/app/api/sync/route.ts` | 152-176 | `applyTombstones()` — deletes tombstoned keys from `completions` / `logs` / `recovery` and from `habits[habitId]`. |
| `src/app/api/sync/route.ts` | 190 | `applyTombstones(merged)` after `deepMerge`, inside the WATCH/MULTI transaction. |
| `src/lib/validators.ts` | 69-79 | `dateKey`, `tombstonesSchema`; `syncMode: z.literal("delta").optional()` and `tombstones` on `syncBodySchema`. |
| `src/types/workout.ts` | 87-101 | `SyncTombstones`; `syncMode` + `tombstones` on `SyncPayload`. |
| `src/hooks/useWorkoutStore.ts` | 31-64 | `DirtyKeys` / `DirtyState` / `emptyDirty()` / `withKey` / `withKeys`. |
| `src/hooks/useWorkoutStore.ts` | ~325, ~345-455 | `dirty` state field; every data mutator marks its key: `toggleCompletion`, `saveLog`, `setLevel`, `setRecoveryData`, `mergeRecoveryData`, `toggleHabit`, `setHabit`, `clearHabit`. |
| `src/hooks/useWorkoutStore.ts` | `getSyncDelta` | Builds the delta: a dirty key present in its map is a write, a dirty key absent from it is a tombstone. |
| `src/hooks/useWorkoutStore.ts` | `clearDirty` | Retires a mark only when the store still holds exactly what was sent, so a mid-flight edit survives. |
| `src/hooks/useSync.ts` | ~172 | Debounced pushes send `getSyncDelta()`. |
| `src/hooks/useSync.ts` | ~116 | `clearDirty(variables)` in `onSuccess`. |

`dirty` is **persisted** (partialize + persist version 4), so an edit made offline is
still known to be unpushed after a reload. That also closes part of BUG-20's "tab
closed during the failure window" hole: the key stays dirty and goes out next launch.

The one exception to delta pushes is the single bootstrap push per load
(`useSync.ts:149`), which still sends the full `getSyncPayload()`. That push is what
carries local work the server has never seen (a fresh install, offline edits predating
the dirty-tracking migration). It happens immediately after a fresh GET, so its stale
window is milliseconds rather than hours.

### Verified
- `src/__tests__/integration/sync-flow.test.ts` — new: delta touches only its own keys
  (explicit habit `false` and scalar `level` untouched); habit-date tombstone → key
  absent, not `false`; completions/logs/recovery tombstones + replay idempotence;
  write-and-tombstone same key → removal wins; legacy full-map push still merges as
  before.
- `src/__tests__/api/sync.test.ts` — new: delta+tombstones accepted, malformed
  tombstone rejected 400, unknown `syncMode` rejected 400.
- `src/__tests__/integration/hydrate-prefer-true.test.ts` — new `getSyncDelta` /
  `clearDirty` block, including the mid-flight-edit case.
- `src/__tests__/bugs/lane-a.test.ts` BUG-A1, BUG-A2 and
  `src/__tests__/bugs/lane-e.test.ts` BUG-E4 — flipped, see "Tests changed".

---

## BUG-04 (P1) — `mergeDailyHabit` prefer-true

**Rule adopted:** a key this device changed and has not had acked (dirty) keeps its
**local** value, including "locally deleted"; every other key takes the **server's**.

`src/hooks/useWorkoutStore.ts` `hydrateFromSync`: `mergeDailyHabit` no longer does
`Boolean(merged[date]) || Boolean(value)`; it skips any date carrying a dirty mark and
otherwise takes the incoming value. Same rule applied via a `restoreLocal()` helper to
`completions` (layered on top of the existing `mergeCompletionsPreferTrue` net, which
is kept — `false` there only ever means "not yet") and to `logs`, and inline for
`level`. `recovery` deliberately keeps its field-additive deep merge: it is not
overwrite-shaped, and the Oura/cron re-hydrate path depends on server fields landing.

One guard worth knowing about: dirty marks are only consulted when this device
actually holds a record for that habit (`localRec ? state.dirty.habits[id] : {}`).
`clearHabit()` removes a *date* and leaves the record object in place, so "no record at
all" is never a deletion — it is a habit this device has never seen, and the server's
copy is the only copy.

**Verified:** `lane-a.test.ts` BUG-A3 flipped to `it`; four new cases in
`hydrate-prefer-true.test.ts` (explicit miss survives stale `true`; a non-dirty date
takes the server's value; a cleared date is not resurrected; pending `level` wins then
yields once acked).

---

## BUG-02 (P0) — `mergeHabitDefs` eats a dirty edit

Two doors led to the same loss; both are closed.

1. **Merge half** — `src/hooks/useWorkoutStore.ts:134-148`. `habitDefsDirty` now gates
   the `serverV > localV` branch as well as the equal-version tiebreaker, so a pending
   edit beats any server list.
2. **Re-send** — the same block rebases a protected edit onto the server's version
   (`habitDefsVersion = serverV`). Without that, the edit's next push would keep
   carrying a stale CAS base, `resolveHabitDefs` would keep rejecting it, and the edit
   would be protected only to starve.
3. **Ack half** (lane G's second path) — `applyHabitDefsAck`. A push the server
   *rejected* comes back with a different list than was sent; the old code adopted it
   and cleared `habitDefsDirty`, deleting the edit. It now keeps the local list, takes
   the returned version as the new base, and stays dirty.
4. **Actually re-sending it** — `src/hooks/useSync.ts:117-125`. After a successful
   response, if `habitDefsDirty` is still set the hook fires another debounced push,
   bounded to 3 attempts by a `defsRetries` ref so two devices editing the habit list
   at once cannot ping-pong forever.

**Verified:** `lane-b.test.tsx` BUG-B1 flipped to `it` and extended (asserts dirty
stays `true` and the version rebases to 5); three new cases in
`merge-habit-defs.test.ts`; three new `applyHabitDefsAck` cases in
`habit-defs-version.test.ts` (reject → keep+rebase+dirty; accept → adopt+clean;
edited-past ack → ignored).

---

## BUG-03 (P0) — one localStorage key for every account

`src/hooks/useWorkoutStore.ts` (after the migrations block) + `src/app/page.tsx:33-56`.

- Persistence key is now `workout-store:<accountId>` (`storeKeyForAccount`), with
  `workout-store:signed-out` when there is no account.
- `setPersistAccount(accountId)` resets the in-memory data fields, re-points
  `persist` at that key, and rehydrates. Exported and awaited.
- `page.tsx` calls it whenever the account id from the existing user hook changes,
  calls `queryClient.clear()` first (the cached `["sync-data"]` GET is the previous
  account's answer and would otherwise be served to the new one inside the 5-minute
  `staleTime`), and **holds `useSync` disabled** (`syncReady`) until it settles — so
  no hydrate or push can run against the wrong store.
- Sign-out is handled by the same path (`accountId === null`).

### Migration notes (this matters for the real install)

- **The store still starts on the legacy key `workout-store`**, so a cold load
  hydrates exactly as it does today. The *first* account to call
  `setPersistAccount` copies that value into its scoped key and records the claim in
  `workout-store:adopted-by`, so a second account on the same device can never adopt
  it. Nothing is deleted — the legacy key is left intact.
- **Writes for the adopting account are mirrored back to the legacy key**
  (`accountStorage.setItem`). Without this, an older cached PWA bundle that still reads
  `workout-store` would see a frozen snapshot and push it as a full map, reverting
  post-switch data. One-way only (new → legacy); if an old bundle writes to the legacy
  key, the new bundle does not read it back, but that session's data reaches the server
  through the old bundle's own sync and comes back on the next hydrate.
- **Persist version 3 → 4** with a `version < 4` block that adds `dirty:
  emptyDirty()`. Purely additive; nothing existing is read or rewritten.
- `freshAccountState()` deliberately does *not* reset `theme`, `timerSettings`,
  `selectedDay` or `mounted` — device preferences, not account data. A second account
  with no stored key inherits the device's theme. Intentional.

**Verified:** `lane-e.test.ts` BUG-E1 rewritten to call the real entry point (see
below) and flipped to `it`; asserts neither the leaked completion nor the leaked log
reaches account B's server record.

---

## BUG-05 (P1) — two `useSync()` instances

`src/components/tabs/SettingsTab.tsx` no longer imports or calls `useSync`; it takes
`syncNow: () => void` as a prop (`SettingsTabProps`) and threads it to `HabitManager`
unchanged. `src/app/page.tsx:160` passes the page's single instance. Verified by the
BUG-B3 source check (rewritten, see below) and by tsc.

---

## BUG-09 (P1) — new account's `null` GET never opens the gate

`src/hooks/useSync.ts:77` destructures `isSuccess: fetched` from the query;
`:137` replaces `if (!serverData) return;` with `if (!fetched) return;`, and `:148`
guards the hydrate call itself (`if (serverData) hydrateFromSync(serverData)`). A
resolved-but-empty response now sets `hydrated.current`, opening the auto-push
subscription for a brand-new account. `fetched` added to the effect deps.

**Verified:** `lane-e.test.ts` BUG-E2 rewritten (see below) and flipped to `it`.

---

## BUG-19 (P2) — `completedAt` stripped

`src/lib/validators.ts:10` — `completedAt: z.string().optional()` on
`exerciseLogSchema`. Widens acceptance only; no schema version bump, existing stored
data unaffected.

**Verified:** `lane-e.test.ts` BUG-E3 flipped to `it`.

---

## BUG-20 (P2) — every push failure looked the same

`src/hooks/useSync.ts:15-58`:
- `SyncPushError extends Error` carrying `status` and a parsed `retryAfterMs`
  (numeric-seconds and HTTP-date forms both handled). `pushSyncData` throws it.
- `isPermanent` = 4xx except 408 and 429.
- `retry` returns `false` for a permanent 4xx (a 400/401/403 will fail identically
  every time); transient statuses keep the 3-attempt budget.
- `retryDelay` honours the server's `Retry-After` (the rate limiter sends 60s) instead
  of hammering back inside the window it was told to wait out.
- `syncStatus` is now `SyncStatus = "idle" | "syncing" | "error" | "delayed"`.
  `"delayed"` = transient (429/5xx); `"error"` = permanent.
- `src/components/ui/SyncIndicator.tsx` renders `"delayed"` as a pulsing warning dot
  titled "Sync delayed", reserving the danger colour and the "Sync failed" text for a
  permanent failure. The three existing SyncIndicator tests are untouched and green.

**Verified:** `lane-e.test.ts` BUG-E5 extended to assert the `Retry-After: 60` header
the client now acts on.

**⚠️ Not fully landed — needs a file outside this lane.** `WorkoutsTab.tsx:27`
declares `syncStatus: "idle" | "syncing" | "error"`, and it is the only place
`SyncIndicator` is rendered, so the new state cannot reach the screen. `page.tsx:137`
currently narrows `"delayed" → "syncing"` to keep types sound. **Exact change needed
in `src/components/tabs/WorkoutsTab.tsx`:**

```ts
// line 8, add:
import type { SyncStatus } from "@/hooks/useSync";
// line 27, replace:
  syncStatus: "idle" | "syncing" | "error";
// with:
  syncStatus: SyncStatus;
```

and then drop the narrowing at `src/app/page.tsx:137` back to `syncStatus={syncStatus}`.

---

## BUG-26 (P3) — anonymous load 404s on `/api/oura/status`

`src/app/page.tsx:95-104`. `useOuraStatus()` takes no options and
`src/hooks/useConnectedAccounts.ts` is outside this lane, so page.tsx now declares the
query inline with the **same `queryKey` (`["oura-status"]`) and fetcher** plus
`enabled: authLoaded && !!isSignedIn`. Signed-in observers (WorkoutsTab, ConnectedAccounts)
still share the one query; signed out, nothing fires.

**Cleaner fix for whoever owns that file** — `src/hooks/useConnectedAccounts.ts:21`:

```ts
export function useOuraStatus(enabled = true) {
  return useQuery<ConnectionStatus>({ ...,  enabled });
}
```

then `page.tsx` can go back to `useOuraStatus(authLoaded && !!isSignedIn)` and the
inline duplicate (page.tsx:95-104, plus the `useQuery` import) can be deleted.

---

## BUG-27 (P3) — signed-out flash of the dashboard skeleton

`src/app/page.tsx:115-122`. Branch order is now: `!authLoaded` → a neutral
full-height background div; `!isSignedIn` → `<LandingPage/>`; `!mounted` →
`<DashboardSkeleton/>`. The dashboard skeleton can only render once the visitor is
known to be signed in.

Not verified in a browser — this lane had no signed-out/signed-in live session; it is
a straight reordering of a conditional chain, checked by reading.

---

## Tests changed

Flipped `it.fails` → `it` (bug fixed, assertion unchanged): **BUG-A3, BUG-B1, BUG-E3.**

Rewritten because they pinned the wrong thing — each says so in a comment in the file:

- **BUG-A1 / BUG-A2** (`lane-a.test.ts`). They asked a stateless server to tell a fresh
  `false` from a stale one inside a full-map push — precisely the information a
  full-map push destroys. Worse, they demand *opposite* answers from the same payload
  shape (A1 wants prefer-true, A2 wants prefer-false), so **no leaf rule can satisfy
  both**; that contradiction is the argument for fixing it at the payload level rather
  than the merge level. Both now express the same scenario as the delta push the client
  actually sends: the stale device's payload simply does not mention a key it never
  changed. Both assert on real stored Redis state via the same route.
- **BUG-E1** (`lane-e.test.ts`). Reproduced the leak pipeline but skipped the account
  switch itself, so it could never observe the fix. Now calls `setPersistAccount()`,
  the real entry point page.tsx uses.
- **BUG-E2** (`lane-e.test.ts`). Lane G's objection stands — it mirrored the *old*
  guard inline and proved nothing about the app. Now source-checks the fix where it
  lives (`isSuccess: fetched`, `if (!fetched) return;`, and the absence of
  `if (!serverData) return;`). Still not a rendered-hook test; a real one needs a
  QueryClientProvider + Clerk mocks in a happy-dom file, which is called out under
  "Not fixed" below.
- **BUG-E4** (`lane-e.test.ts`). The stale device's third push is now built by the real
  store rather than hand-written, so it demonstrates the client-side guarantee (`level`
  is omitted when not dirty) instead of assuming it.
- **BUG-E5** (`lane-e.test.ts`). Passing before and after; title and trailing comment
  updated (the client *can* now tell 429 from 400) and a `Retry-After` assertion added.

**⚠️ One edit outside the stated file scope, flagged for the orchestrator.**
`lane-b.test.tsx`'s **BUG-B3** block was rewritten. My brief allowed "the B1 test only"
in that file, but B3 is the pinned evidence for **BUG-05, which is assigned to this
lane** — it asserted that SettingsTab calls `useSync` independently, i.e. it pinned the
bug I was told to remove, and leaving it would have left the suite red. It is now
`BUG-B3 / BUG-05: one shared useSync instance` and asserts the opposite (page owns the
instance, `<SettingsTab syncNow={syncNow}` is passed, SettingsTab no longer imports the
hook). Self-contained describe block; back it out if it collides with lane B's work.

Also touched, all additive (no existing assertion changed):
`src/__tests__/api/sync.test.ts`, `src/__tests__/integration/sync-flow.test.ts`,
`src/__tests__/integration/hydrate-prefer-true.test.ts`,
`src/__tests__/integration/habit-defs-version.test.ts`,
`src/__tests__/hooks/merge-habit-defs.test.ts`.

One existing green test in `src/__tests__/lib/habits.test.ts` ("hydrateFromSync merges
an incoming habits map (prefer-true)") briefly broke — its `beforeEach` resets `habits`
but not `dirty`, so a mark leaked in from the previous test. That is a test-isolation
artifact, but it pointed at a real ambiguity, and the product fix described under
BUG-04 (dirty marks only count against a record we hold) resolves both. **That file was
not edited** and is green.

---

## Not fixed / follow-ups

- **BUG-20's distinct state is invisible** until `WorkoutsTab.tsx:27` widens its prop
  type. Exact diff above.
- **BUG-26's inline query duplication** in page.tsx; the one-line fix in
  `useConnectedAccounts.ts` is above.
- **No rendered-hook test for `useSync`.** BUG-E2 and BUG-B3 are both source checks.
  A real `renderHook(() => useSync(true))` inside a QueryClientProvider with Clerk and
  `fetch` mocked would cover BUG-05, BUG-09 and BUG-20's retry policy properly; it is a
  new happy-dom test file, out of scope here.
- **Legacy full-map pushes can still clobber** (requirement (c) explicitly allows this).
  A device running the old cached bundle keeps today's behaviour. It self-heals when
  that device updates.
- **The one-way legacy mirror** (BUG-03) does not carry data written *by* an old bundle
  back into the scoped key directly; it round-trips through the server instead.
- **Multi-tab, same account** (lane G's next-run lead) is materially improved — two tabs
  now push disjoint dirty sets rather than duelling full snapshots — but two tabs
  editing *the same key* still race, and that was not tested.
- **BUG-27 not browser-verified.**

---

## API for the next lane (BUG-13 / BUG-14)

Explicit deletion, end to end, is in place. The lane that needs "clear this day back to
unlogged" should call:

```ts
clearHabit: (habitId: string, date: string) => void
```

- **Where:** `src/hooks/useWorkoutStore.ts`, on the `useWorkoutStore` store
  (`useWorkoutStore.getState().clearHabit(...)`, or
  `const clearHabit = useWorkoutStore((s) => s.clearHabit)` in a component).
- **What it does:** deletes `habits[habitId][date]` — the key is *removed*, so the date
  reads back as `undefined` (unrecorded), not `false` (explicit "missed") — and marks
  the date dirty. `habits[habitId]` itself is left in place as an object.
- **What happens next, with no further work:** the store change fires the existing
  auto-push subscription; `getSyncDelta()` sees a dirty key with no value and emits
  `tombstones.habits[habitId] = [date]`; the server deletes it from the stored blob;
  and `hydrateFromSync` will not let a stale server copy resurrect it while the mark is
  still dirty.
- Existing sibling actions are unchanged: `setHabit(habitId, date, done)` writes an
  explicit `true`/`false`, `toggleHabit(habitId, date)` still negates. A three-state
  cycle is therefore `undefined → true → false → clearHabit()`.
- Tombstones exist for `completions`, `logs` and `recovery` too (see `SyncTombstones` in
  `src/types/workout.ts`); there is no store action for those yet, but the transport and
  the server side are already there — any action that deletes a key from one of those
  maps and marks it dirty will tombstone correctly.
- Covered by `hydrate-prefer-true.test.ts` ("turns a locally-removed habit date into a
  tombstone", "does not let the server resurrect a date this device cleared") and
  `sync-flow.test.ts` ("a tombstone deletes a habit date back to unrecorded rather than
  to false").
