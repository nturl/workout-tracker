"use client";

import { useEffect, useState } from "react";
import { todayKey } from "@/lib/helpers";

// BUG-30: 30s is frequent enough that a tab left open across midnight
// notices within half a minute of the actual rollover, without polling so
// often it matters for battery/perf.
const CHECK_INTERVAL_MS = 30_000;

/**
 * BUG-30: `todayKey()` is a plain function of `new Date()` — nothing
 * re-invokes it as real time passes, so a tab opened yesterday and left open
 * keeps reading yesterday's date key until some unrelated state change
 * happens to trigger a re-render. This hook makes "what day is it" reactive:
 * it re-checks on a 30s interval and on the events most likely to catch a
 * stale tab promptly — the tab regaining visibility, the window regaining
 * focus, or bfcache restoring the page (`pageshow`) — and only updates state
 * (triggering a re-render) when the key actually changed.
 */
export function useTodayKey(): string {
  // SSR-safe: server has no `Date` tied to the viewer's clock/timezone, so
  // render "" there and fill in the real value once mounted on the client.
  const [key, setKey] = useState<string>(() => (typeof window === "undefined" ? "" : todayKey()));

  useEffect(() => {
    const check = () => {
      setKey((prev) => {
        const next = todayKey();
        return next === prev ? prev : next;
      });
    };

    // Covers the SSR "" placeholder, and any drift since the initializer ran.
    check();

    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
    };
  }, []);

  return key;
}
