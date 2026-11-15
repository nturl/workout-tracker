import { describe, it, expect, vi, beforeEach } from "vitest";

// A single shared connection, like getRedis(): one store, one watch state.
// Real WATCH is per connection and EXEC clears it, so the fake does the same.
const store = new Map<string, string>();
let watched = false;
let dirty = false;
const fake = {
  watch: vi.fn(async () => { watched = true; dirty = false; }),
  get: vi.fn(async (key: string) => {
    const v = store.get(key) ?? null;
    await new Promise((r) => setTimeout(r, 5));
    return v;
  }),
  multi: vi.fn(() => ({
    set(key: string, value: string) {
      return {
        exec: async () => {
          const ok = !(watched && dirty);
          watched = false; // EXEC clears all watches on the connection
          if (!ok) return null;
          store.set(key, value);
          dirty = true; // a write invalidates anyone else's watch
          return [["OK"]];
        },
      };
    },
  })),
};

vi.mock("@/lib/redis", () => ({ getRedis: () => fake }));

import { updateUserData } from "@/lib/userData";

describe("updateUserData", () => {
  beforeEach(() => {
    store.clear();
    watched = false;
    dirty = false;
  });

  it("keeps both fields when two calls overlap on one connection", async () => {
    await Promise.all([
      updateUserData("u1", (e) => ({ ...e, a: 1 })),
      updateUserData("u1", (e) => ({ ...e, b: 2 })),
    ]);
    expect(JSON.parse(store.get("user:u1:data")!)).toEqual({ a: 1, b: 2 });
  });

  it("does not block a different user's update", async () => {
    await Promise.all([
      updateUserData("u1", (e) => ({ ...e, a: 1 })),
      updateUserData("u2", (e) => ({ ...e, b: 2 })),
    ]);
    expect(JSON.parse(store.get("user:u1:data")!)).toEqual({ a: 1 });
    expect(JSON.parse(store.get("user:u2:data")!)).toEqual({ b: 2 });
  });

  it("a failed update does not wedge the queue", async () => {
    await expect(updateUserData("u1", () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await updateUserData("u1", (e) => ({ ...e, a: 1 }));
    expect(JSON.parse(store.get("user:u1:data")!)).toEqual({ a: 1 });
  });
});
