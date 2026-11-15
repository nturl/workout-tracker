import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Loads public/sw.js against a stubbed worker global and drives its handlers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- handlers receive loosely-shaped fake events
type SwEvent = any;
const source = readFileSync(path.resolve(__dirname, "../../../public/sw.js"), "utf8");

function loadSw(opts: { cacheKeys?: string[]; fetchImpl?: () => Promise<Response>; windowClients?: SwEvent[] } = {}) {
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
    clients: { claim: () => {}, matchAll: async () => opts.windowClients ?? [], openWindow: async () => {} },
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

  it("static assets: caches an OK response but not a 404/5xx", async () => {
    for (const [status, cached] of [[200, true], [404, false], [503, false]] as const) {
      const { handlers, puts } = loadSw({ fetchImpl: async () => new Response("x", { status }) });
      let pending: Promise<unknown> = Promise.resolve();
      handlers.fetch({
        request: { url: "http://localhost/_next/static/chunks/a.js", method: "GET", mode: "no-cors" },
        respondWith: (p: Promise<unknown>) => { pending = p; },
      });
      await pending;
      await flush();
      expect(puts.length > 0, `status ${status}`).toBe(cached);
    }
  });

  describe("notificationclick", () => {
    function click(url: string | undefined, clientUrl: string) {
      const client = { url: clientUrl, focus: vi.fn(async () => {}), navigate: vi.fn(async () => {}) };
      const { handlers } = loadSw({ windowClients: [client] });
      let pending: Promise<unknown> = Promise.resolve();
      handlers.notificationclick({
        notification: { close: () => {}, data: url ? { url } : {} },
        waitUntil: (p: Promise<unknown>) => { pending = p; },
      });
      return { client, done: () => pending };
    }

    it("focuses without navigating when the open window is already on the target", async () => {
      const { client, done } = click("/", "http://localhost/");
      await done();
      expect(client.focus).toHaveBeenCalled();
      expect(client.navigate).not.toHaveBeenCalled();
    });

    it("ignores query and hash when comparing to the open window", async () => {
      const { client, done } = click("http://localhost/", "http://localhost/?tab=today#timer");
      await done();
      expect(client.navigate).not.toHaveBeenCalled();
    });

    it("navigates when the open window is on a different path", async () => {
      const { client, done } = click("/", "http://localhost/settings");
      await done();
      expect(client.focus).toHaveBeenCalled();
      expect(client.navigate).toHaveBeenCalledWith("/");
    });
  });
});
