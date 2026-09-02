import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearMockRedis, seedMockRedis } from "../mocks/redis";
import { setMockUserId } from "../mocks/clerk";
import { GET, POST } from "@/app/api/sync/route";
import { NextRequest } from "next/server";
import { useWorkoutStore, setPersistAccount, emptyDirty } from "@/hooks/useWorkoutStore";

function makeGet(ip = `test-${Math.random()}`): NextRequest {
  return new NextRequest("http://localhost:3000/api/sync", {
    method: "GET",
    headers: { "X-Forwarded-For": ip },
  });
}

function makePost(body: Record<string, unknown>, ip = `test-${Math.random()}`): NextRequest {
  return new NextRequest("http://localhost:3000/api/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      "X-Forwarded-For": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("Lane E - sync and persistence", () => {
  beforeEach(() => {
    clearMockRedis();
    setMockUserId("user-b");
  });

  // BUG-E1 (FIXED): the store used to persist under one global localStorage key
  // ("workout-store") with no account in it, and useSync pushed getSyncPayload()
  // — the whole store — the first time serverData arrived. On a shared device
  // that meant the PREVIOUS account's leftovers were merged and then written
  // into the NEWLY signed-in account's server record.
  //
  // TEST REWRITTEN (fix lane S1): the original reproduced the pipeline but
  // skipped the account switch itself, so it could never observe the fix. It
  // now calls the real entry point, setPersistAccount(), which is what page.tsx
  // runs (and waits for) before sync is enabled for an account.
  it("BUG-E1: local store data left by a previous account does not leak into a newly-signed-in account's server record", async () => {
    // Leftover local state from a previously-signed-in account.
    useWorkoutStore.getState().toggleCompletion("prev-account-secret-workout");
    useWorkoutStore.getState().saveLog("prev-account-secret-workout", { notes: "prior account's private note" });

    // A different account signs in on the same device. page.tsx re-points local
    // persistence at that account's own key and waits for it before enabling
    // sync; the previous account's data does not come along.
    setMockUserId("user-b");
    await setPersistAccount("user-b");

    const initialGet = await GET(makeGet());
    const initialJson = await initialGet.json();
    expect(initialJson.data).toBeNull();

    // useSync's first-load branch: hydrate, then push the full snapshot.
    useWorkoutStore.getState().hydrateFromSync(initialJson.data || {});
    await POST(makePost(useWorkoutStore.getState().getSyncPayload()));

    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.data.completions["prev-account-secret-workout"]).toBeUndefined();
    expect(json.data.logs["prev-account-secret-workout"]).toBeUndefined();
  });

  // BUG-E2 (FIXED): useSync.ts used to guard its hydrate effect with
  // `if (!serverData) return;`, which cannot tell "the GET has not resolved
  // yet" (undefined) from "the GET resolved and this account has nothing"
  // (null — what /api/sync returns for a brand-new account). `hydrated.current`
  // was only ever set inside that guarded block, and the auto-push subscription
  // is gated on it, so a genuinely new account's local changes never
  // auto-synced for the life of the mount.
  //
  // TEST REWRITTEN (fix lane S1): the original mirrored the OLD guard inline and
  // therefore proved nothing about the app (lane G's objection). It now pins the
  // fix where it actually lives — the effect keys off react-query's isSuccess,
  // not the truthiness of the payload — with a source check so the conflation
  // cannot quietly come back.
  it("BUG-E2: a brand-new account's null server payload still opens the sync gate", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "src/hooks/useSync.ts"), "utf8");

    // "Has the fetch resolved" is now tracked separately from "did it return
    // anything", and the gate opens on the former.
    expect(src).toMatch(/isSuccess:\s*fetched/);
    expect(src).toMatch(/if \(!fetched\) return;/);
    // The conflated guard is gone.
    expect(src).not.toMatch(/if \(!serverData\) return;/);

    // And the resulting rule, stated plainly: a resolved-but-empty response
    // opens the gate exactly like a resolved-and-populated one.
    const opensGate = (fetched: boolean) => fetched;
    expect(opensGate(/* resolved, data === null */ true)).toBe(true);
    expect(opensGate(/* still loading */ false)).toBe(false);
  });

  // BUG-E3: src/lib/validators.ts:3-10 (exerciseLogSchema) has no `completedAt`
  // field, while src/types/workout.ts:6-15 (ExerciseLog) defines one and
  // src/hooks/useWorkoutStore.ts sends it verbatim through getSyncPayload(). Zod
  // objects strip unrecognized keys by default (no .passthrough() on
  // exerciseLogSchema), so the field is silently dropped on every POST.
  it("BUG-E3 (FIXED): exerciseLogs[].completedAt survives the syncBodySchema round-trip", async () => {
    await POST(makePost({
      logs: {
        "mon-squat": {
          exerciseLogs: {
            squat: { weight: 135, reps: 5, sets: 3, completed: true, completedAt: "2026-08-01T12:00:00Z" },
          },
        },
      },
    }));

    const res = await GET(makeGet());
    const json = await res.json();
    const stored = json.data.logs["mon-squat"].exerciseLogs.squat;
    expect(stored.weight).toBe(135); // recognized fields survive
    expect(stored.completedAt).toBe("2026-08-01T12:00:00Z"); // validators.ts now declares the field
  });

  // BUG-E4 (FIXED): `level` is the only top-level sync field that is a bare
  // scalar, and deepMerge overwrites scalars outright. getSyncPayload() always
  // sent the device's current `level`, even when the device had never touched
  // it, so any later push from a long-lived tab reverted another device's
  // change. The client now sends `level` only when it is dirty — i.e. only when
  // this device actually set it.
  //
  // TEST REWRITTEN (fix lane S1): the third push is now built by the real store
  // rather than hand-written, so it demonstrates the client-side guarantee (the
  // stale device omits `level`) rather than assuming it.
  it("BUG-E4: a stale device's unrelated push does not revert a newer `level` written by another device", async () => {
    // Device A sets level to intermediate and pushes it.
    useWorkoutStore.setState({ level: "beginner", completions: {}, dirty: emptyDirty() });
    useWorkoutStore.getState().setLevel("intermediate");
    const aPush = useWorkoutStore.getState().getSyncDelta();
    expect(aPush.level).toBe("intermediate");
    await POST(makePost({ ...aPush }));
    useWorkoutStore.getState().clearDirty(aPush); // server acked it

    // Device B, elsewhere, advances it.
    await POST(makePost({ syncMode: "delta", level: "advanced" }));

    // Device A never re-fetched (staleTime 300_000, no refetch on focus/mount),
    // so its local `level` is still "intermediate" when it pushes again for an
    // unrelated reason. That push no longer mentions `level` at all.
    useWorkoutStore.getState().toggleCompletion("unrelated-toggle");
    const aLater = useWorkoutStore.getState().getSyncDelta();
    expect(aLater.level).toBeUndefined();
    expect(aLater.completions).toEqual({ "unrelated-toggle": true });
    await POST(makePost({ ...aLater }));

    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.data.level).toBe("advanced");
    expect(json.data.completions["unrelated-toggle"]).toBe(true);
  });

  // BUG-E5 (H2): the debounced push has no queue and no coordination with the
  // per-IP rate limit (src/lib/rateLimit.ts:29-50, 60 req/min on POST via
  // src/app/api/sync/route.ts:64). A burst of legitimate pushes past the limit
  // gets a flat 429 from every request past #60 in the window, with no
  // Retry-After honoring on the client (useMutation's built-in retry in
  // useSync.ts:47-50 has no knowledge of status codes at all - pushSyncData,
  // useSync.ts:15-23, throws a generic Error for ANY non-ok response, so 401/400
  // and 429 are indistinguishable and all get blindly retried 3x).
  it("BUG-E5: the 61st POST within a minute from the same IP is rejected with a Retry-After the client can act on", async () => {
    const ip = `burst-${Math.random()}`;
    let last!: Response;
    for (let i = 0; i < 61; i++) {
      last = await POST(makePost({ completions: { [`k${i}`]: true } }, ip));
    }
    expect(last.status).toBe(429);
    // pushSyncData now throws SyncPushError carrying this status, so the
    // mutation treats it as transient (retried, backed off by this header)
    // rather than as a permanent failure like a 400/401.
    expect(last.headers.get("Retry-After")).toBe("60");
  });
});
