import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { auth } from "@clerk/nextjs/server";
import { syncBodySchema } from "@/lib/validators";
import { rateLimit, rateLimitResponse, checkCsrf, csrfResponse } from "@/lib/rateLimit";
import { withRetry } from "@/lib/retry";
import { habitDefsEqual, type HabitDef } from "@/lib/habits";

/* ===========================================================================
 * MERGE DESIGN — dirty-key deltas with explicit tombstones  (BUG-01)
 * ===========================================================================
 *
 * The problem this replaces: every client push used to carry the device's
 * ENTIRE store, and the merge below overwrote each leaf it saw. A device whose
 * snapshot was minutes old therefore reverted every key it happened to include
 * but had not actually changed — erasing another device's completion, flipping
 * an explicit habit "missed" back to a stale "done", and reverting `level`.
 * Last-write-wins per leaf is only safe if every leaf in the payload really is
 * a write. So we make that true instead of guessing at the leaf level.
 *
 * The contract
 * ------------
 * A delta-aware client tracks, per map, which KEYS it has changed since its
 * last acknowledged push (`dirty` in src/hooks/useWorkoutStore.ts) and sends:
 *
 *   { syncMode: "delta",
 *     completions?/logs?/recovery?/habits?/level?   // changed keys ONLY
 *     tombstones?: { completions?: [...], logs?: [...], recovery?: [...],
 *                    habits?: { habitId: [dates] } } }
 *
 * Absence of a key now means "I did not touch this", not "I believe it is
 * unset". Applying such a payload over stored state is therefore exactly the
 * additive per-key merge already implemented in deepMerge() — no timestamps,
 * no vector clocks, no schema change to the stored blob. That is why this
 * design was chosen over per-leaf timestamps: per-leaf timestamps would have
 * doubled the size of the stored value (a value that already grows without
 * bound for this user), required a migration of every existing leaf, and still
 * needed a trusted clock on devices we know have skewed ones — the exact
 * failure the habitDefs versioning above was introduced to fix.
 *
 * DELETION (requirement for BUG-13/BUG-14). Because absence now means
 * "untouched", a client can no longer erase a key by omitting it. Removal is
 * explicit: the key is listed in `tombstones` and deleted from stored state
 * after the merge. That is what lets a habit date go back to genuinely
 * UNRECORDED (undefined) rather than to a tri-state "missed" (false).
 * Client entry point: `clearHabit(habitId, date)` on the store.
 *
 * BACKWARD COMPATIBILITY. A push with no `syncMode` is a legacy full-map push
 * from an older cached PWA bundle. It takes the same code path it always did:
 * deepMerge over the whole payload, no tombstones. Such a client can still
 * revert a key it did not change — unchanged from today's behaviour, and it
 * self-heals once that device loads the current bundle. Tombstones are honoured
 * whenever present, so they are additive rather than gated on syncMode.
 *
 * Ordering: merge first, then delete. A key that is both written and
 * tombstoned in the same push is a client bug; deleting last makes the
 * outcome deterministic (removal wins).
 * =========================================================================== */

/**
 * Resolve the stored habit-def list against an incoming push using a
 * SERVER-ASSIGNED version. The client never sets the version from its own clock;
 * it sends the version its edit is based on (`incomingBase`) as a CAS token, and
 * the server mints the next version here. This defeats a clock-skewed device,
 * which previously stamped a far-future timestamp and won every merge forever.
 *
 *  - no incoming list        -> report current stored state unchanged
 *  - no list stored yet      -> accept, start versioning at 1
 *  - identical content       -> echo, no version bump (idempotent re-pushes stay quiet)
 *  - changed, base current   -> accept, bump version
 *  - changed, base stale     -> reject (keep stored); the device adopts the
 *                               canonical values on its next sync, self-healing
 */
function resolveHabitDefs(
  existing: Record<string, unknown>,
  incoming: HabitDef[] | undefined,
  incomingBase: number | undefined,
): { habitDefs: HabitDef[] | undefined; habitDefsVersion: number } {
  const stored = Array.isArray(existing.habitDefs) ? (existing.habitDefs as HabitDef[]) : undefined;
  const storedVersion = typeof existing.habitDefsVersion === "number" ? existing.habitDefsVersion : 0;

  if (incoming === undefined) return { habitDefs: stored, habitDefsVersion: storedVersion };
  if (stored === undefined) return { habitDefs: incoming, habitDefsVersion: storedVersion + 1 };
  if (habitDefsEqual(incoming, stored)) return { habitDefs: stored, habitDefsVersion: storedVersion };

  const base = typeof incomingBase === "number" ? incomingBase : 0;
  if (base >= storedVersion) return { habitDefs: incoming, habitDefsVersion: storedVersion + 1 };
  return { habitDefs: stored, habitDefsVersion: storedVersion };
}

export async function GET(req: NextRequest) {
  const { success } = rateLimit(req, { limit: 120, windowMs: 60_000 });
  if (!success) return rateLimitResponse();
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const redis = getRedis();
    const raw = await redis.get(`user:${userId}:data`);
    const data = raw ? JSON.parse(raw) : null;
    // V14: private cache for 60s to backstop client staleTime
    return NextResponse.json({ data }, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("Sync GET error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return csrfResponse();
  const { success } = rateLimit(req, { limit: 60, windowMs: 60_000 });
  if (!success) return rateLimitResponse();

  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const parsed = syncBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
    }

    const { completions, logs, level, recovery, habits, habitDefs, habitDefsVersion, tombstones } = parsed.data;

    const data: Record<string, unknown> = {};
    if (completions !== undefined) data.completions = completions;
    if (logs !== undefined) data.logs = logs;
    if (level !== undefined) data.level = level;
    if (recovery !== undefined) data.recovery = recovery;
    if (habits !== undefined) data.habits = habits;
    // habitDefs + its version are resolved separately under the WATCH/MULTI
    // transaction below (server-assigned versioning), not blind-merged here.

    const redis = getRedis();
    const key = `user:${userId}:data`;

    // Deep-merge helper for nested objects (recovery dates, logs, completions)
    function deepMerge(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
      const result = { ...existing };
      for (const [k, v] of Object.entries(incoming)) {
        if (v && typeof v === "object" && !Array.isArray(v) && existing[k] && typeof existing[k] === "object" && !Array.isArray(existing[k])) {
          result[k] = deepMerge(existing[k] as Record<string, unknown>, v as Record<string, unknown>);
        } else {
          result[k] = v;
        }
      }
      return result;
    }

    // Apply the push's explicit removals, after the merge (see design note).
    // A tombstoned key that isn't there is a no-op, so replays are safe.
    function applyTombstones(target: Record<string, unknown>) {
      if (!tombstones) return;
      const dropFrom = (mapKey: string, keys: string[] | undefined) => {
        if (!keys?.length) return;
        const map = target[mapKey];
        if (!map || typeof map !== "object" || Array.isArray(map)) return;
        for (const k of keys) delete (map as Record<string, unknown>)[k];
      };
      dropFrom("completions", tombstones.completions);
      dropFrom("logs", tombstones.logs);
      dropFrom("recovery", tombstones.recovery);
      if (tombstones.habits) {
        const habitsMap = target.habits;
        if (habitsMap && typeof habitsMap === "object" && !Array.isArray(habitsMap)) {
          for (const [habitId, dates] of Object.entries(tombstones.habits)) {
            const rec = (habitsMap as Record<string, unknown>)[habitId];
            if (!rec || typeof rec !== "object" || Array.isArray(rec)) continue;
            for (const d of dates) delete (rec as Record<string, unknown>)[d];
          }
        }
      }
    }

    // Use WATCH/MULTI for optimistic locking with retry on race conditions
    let resolvedDefs: HabitDef[] | undefined;
    let resolvedVersion = 0;
    await withRetry(async () => {
      await redis.watch(key);
      const existingRaw = await redis.get(key);
      const existing = existingRaw ? JSON.parse(existingRaw) : {};

      // Server-authoritative habitDefs version (CAS on the client's base version).
      const resolution = resolveHabitDefs(existing, habitDefs, habitDefsVersion);
      resolvedDefs = resolution.habitDefs;
      resolvedVersion = resolution.habitDefsVersion;

      const merged: Record<string, unknown> = { ...deepMerge(existing, data), updatedAt: Date.now() };
      applyTombstones(merged);
      if (resolvedDefs !== undefined) {
        merged.habitDefs = resolvedDefs;
        merged.habitDefsVersion = resolvedVersion;
      }
      // Drop the dead client-clock field so a not-yet-updated old client can't
      // resurrect it as a merge key.
      delete merged.habitDefsUpdatedAt;

      const result = await redis.multi().set(key, JSON.stringify(merged)).exec();
      if (!result) {
        throw new Error("Transaction conflict");
      }
    }, { maxRetries: 3, baseDelayMs: 100 });
    // Return the canonical list + version so the client adopts it (its edit was
    // accepted -> new version; rejected/stale -> the winning list) and converges.
    return NextResponse.json({ success: true, habitDefs: resolvedDefs, habitDefsVersion: resolvedVersion });
  } catch (error) {
    console.error("Sync POST error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
