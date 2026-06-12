"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("offline", onChange);
  window.addEventListener("online", onChange);
  return () => {
    window.removeEventListener("offline", onChange);
    window.removeEventListener("online", onChange);
  };
}

export function OfflineBanner() {
  // useSyncExternalStore reads navigator.onLine without a mount effect, so
  // there is no initial setState flash and SSR renders the online state.
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

  if (online) return null;

  return (
    <div className="px-4 py-2.5 text-center text-xs font-medium" style={{ background: "#fef3c7", color: "#92400e" }}>
      You&apos;re offline - changes will sync when you&apos;re back online
    </div>
  );
}
