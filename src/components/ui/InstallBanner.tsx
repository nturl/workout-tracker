"use client";

import { useState } from "react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const DISMISSED_KEY = "install-banner-dismissed";

export function InstallBanner() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(DISMISSED_KEY) === "true";
  });

  if (!canInstall || dismissed) return null;

  return (
    <div className="mx-5 mt-4 rounded-xl p-4 flex items-center gap-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <span className="text-2xl">📲</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Add to Home Screen</p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Get the full app experience</p>
      </div>
      <button onClick={promptInstall}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
        style={{ background: "var(--text-primary)", color: "var(--bg-primary)" }}>
        Install
      </button>
      <button onClick={() => { setDismissed(true); localStorage.setItem(DISMISSED_KEY, "true"); }}
        className="text-sm" style={{ color: "var(--text-muted)" }} aria-label="Dismiss install banner">
        ✕
      </button>
    </div>
  );
}
