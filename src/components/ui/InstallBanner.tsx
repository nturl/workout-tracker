"use client";

import { useState } from "react";
import { InstallSheet } from "@/components/InstallSheet";
import { isStandalonePWA } from "@/lib/pushClient";

const DISMISSED_KEY = "install-banner-dismissed";

export function InstallBanner() {
  // Lazy initializers, not a mount effect: only mounts client-side (behind the
  // auth gate), so the window guard is SSR insurance.
  const [standalone] = useState(() => typeof window === "undefined" || isStandalonePWA());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  if (standalone || dismissed) return null;

  return (
    <>
      <div className="mx-5 mt-4 glass-card rounded-card p-4 flex items-center gap-3">
        <span className="text-2xl">📲</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-content-primary">Add to Home Screen</p>
          <p className="text-xs text-content-muted">Get the full app experience</p>
        </div>
        <button onClick={() => setSheetOpen(true)}
          className="px-3 py-1.5 rounded-button text-xs font-semibold pressable bg-accent text-accent-contrast">
          Get the app
        </button>
        <button onClick={() => { setDismissed(true); localStorage.setItem(DISMISSED_KEY, "true"); }}
          className="text-sm text-content-muted" aria-label="Dismiss install banner">
          ✕
        </button>
      </div>
      <InstallSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
