import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Loads public/sw.js against a stubbed worker global and drives its handlers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- handlers receive loosely-shaped fake events
type SwEvent = any;
const source = readFileSync(path.resolve(__dirname, "../../../public/sw.js"), "utf8");

function loadSw(opts: { cacheKeys?: string[]; fetchImpl?: () => Promise<Response> } = {}) {
  const handlers: Record<string, (e: SwEvent) => void> = {};
  const deleted: string[] = [];
  const puts: Array<{ cache: string; url: string }> = [];
  const caches = {
    keys: async () => opts.cacheKeys ?? [],
    delete: async (k: string) => { deleted.push(k); return true; },
    open: async (name: string) => ({
      addAll: async () => {},
      put: async (req: string | { url: string }) => { puts.push({ cache: name, url: typeof req === "string" ? req : req.url }); },
    }),
    match: async () => undefined,
  };
  const self = {
    addEventListener: (type: string, fn: (e: SwEvent) => void) => { handlers[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: () => {}, matchAll: async () => [] },
    location: { origin: "http://localhost" },
  };
  const fetchMock = vi.fn(opts.fetchImpl ?? (async () => new Response("ok")));
  new Function("self", "caches", "fetch", source)(self, caches, fetchMock);
  return { handlers, deleted, puts, fetchMock };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("service worker", () => {
  it("does not intercept POST /api/sync, so failures reach the client's own retry", () => {
    const { handlers } = loadSw();
    const respondWith = vi.fn();
    handlers.fetch({
      request: { url: "http://localhost/api/sync", method: "POST", mode: "cors", clone: () => ({}) },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
    expect(handlers.sync).toBeUndefined();
  });

  it("activate keeps the push-config cache", async () => {
    const { handlers, deleted } = loadSw({ cacheKeys: ["push-config", "workout-static-v1"] });
    let pending: Promise<unknown> = Promise.resolve();
    handlers.activate({ waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
    expect(deleted).toEqual(["workout-static-v1"]);
  });

  it("navigation does not cache a non-OK response over the offline shell", async () => {
    const { handlers, puts } = loadSw({ fetchImpl: async () => new Response("bad", { status: 500 }) });
    let pending: Promise<unknown> = Promise.resolve();
    handlers.fetch({
      request: { url: "http://localhost/", method: "GET", mode: "navigate" },
      respondWith: (p: Promise<unknown>) => { pending = p; },
    });
    await pending;
    await flush();
    expect(puts).toEqual([]);
  });
});
