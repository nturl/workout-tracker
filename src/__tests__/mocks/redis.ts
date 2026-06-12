import { vi } from "vitest";

const store = new Map<string, string>();

const mockRedis = {
  get: vi.fn(async (key: string) => store.get(key) || null),
  set: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
    return "OK";
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key);
    return 1;
  }),
  ping: vi.fn(async () => "PONG"),
  keys: vi.fn(async (pattern: string) => {
    // Convert Redis glob pattern to regex (handles user:*:ntfy-topic style patterns)
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return [...store.keys()].filter((k) => regex.test(k));
  }),
  watch: vi.fn(async () => "OK"),
  multi: vi.fn(() => ({
    set: vi.fn(function (this: { _queue: Array<() => Promise<unknown>> }, key: string, value: string) {
      this._queue = this._queue || [];
      this._queue.push(async () => {
        store.set(key, value);
        return ["OK"];
      });
      return this;
    }),
    exec: vi.fn(async function (this: { _queue?: Array<() => Promise<unknown>> }) {
      const results = [];
      for (const fn of this._queue || []) {
        results.push(await fn());
      }
      return results.length > 0 ? results : [["OK"]];
    }),
    _queue: [] as Array<() => Promise<unknown>>,
  })),
};

export function getMockRedis() {
  return mockRedis;
}

export function clearMockRedis() {
  store.clear();
  vi.clearAllMocks();
}

export function seedMockRedis(data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    store.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
}

// Auto-mock the redis module
vi.mock("@/lib/redis", () => ({
  getRedis: () => mockRedis,
}));
