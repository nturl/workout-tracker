"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { sharePage } from "@/lib/share";
import { isIOS, isStandalonePWA } from "@/lib/pushClient";

// Chrome/Edge on Android (and desktop) fire this; iOS Safari never does.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

function AddSquareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

/* Depersonalized mockups of the three iOS moments, drawn in the app's own style. */

function BrowserBarMock() {
  return (
    <div className="flex items-center justify-between rounded-card border py-2 pl-4 pr-2 bg-surface-card" style={{ borderColor: "var(--card-border)" }}>
      <span className="text-xs text-content-muted">workout-tracker-two-alpha.vercel.app</span>
      <span className="grid h-8 w-8 place-items-center rounded-full text-accent ring-2 ring-accent" style={{ background: "var(--accent-glow)" }}>
        <ShareIcon />
      </span>
    </div>
  );
}

function ShareMenuMock() {
  return (
    <div className="overflow-hidden rounded-card border bg-surface-card" style={{ borderColor: "var(--card-border)" }}>
      <div className="space-y-2.5 px-4 py-3 opacity-35">
        <div className="h-2.5 w-32 rounded-full bg-surface-elevated" />
        <div className="h-2.5 w-24 rounded-full bg-surface-elevated" />
      </div>
      <div className="flex items-center justify-between border-t px-4 py-2.5" style={{ borderColor: "var(--card-border)", background: "var(--accent-glow)" }}>
        <span className="text-sm font-semibold text-content-primary">Add to Home Screen</span>
        <span className="text-accent">
          <AddSquareIcon />
        </span>
      </div>
    </div>
  );
}

function AddDialogMock() {
  return (
    <div className="flex items-center justify-between rounded-card border px-4 py-2.5 bg-surface-card" style={{ borderColor: "var(--card-border)" }}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png?v=2" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[10px]" />
        <span className="text-sm font-medium text-content-primary">Workout Tracker</span>
      </div>
      <span className="rounded-full bg-accent px-3.5 py-1 text-xs font-semibold text-accent-contrast">Add</span>
    </div>
  );
}

function StepCaption({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[13px] font-medium text-content-secondary">
      <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-contrast">
        {n}
      </span>
      {children}
    </p>
  );
}

export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [shareLabel, setShareLabel] = useState("Share it with a friend");

  useEffect(() => {
    setIos(isIOS());
    setInstalled(isStandalonePWA());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  return (
    <Sheet open={open} onClose={onClose} title="Get the app">
      <div className="px-5 pb-5">
        {installed ? (
          <p className="text-sm leading-relaxed text-content-secondary">
            You already have it. Workout Tracker is on your home screen and opens full-screen like an app.
          </p>
        ) : installEvent ? (
          <div className="space-y-3">
            <p className="text-sm leading-snug text-content-secondary">
              One tap puts Workout Tracker on your home screen. It opens full-screen, like an app.
            </p>
            <button
              onClick={async () => {
                await installEvent.prompt();
                onClose();
              }}
              className="pressable w-full rounded-button bg-accent py-2.5 text-sm font-medium text-accent-contrast"
            >
              Install Workout Tracker
            </button>
          </div>
        ) : (
          <div>
            {!ios && (
              <p className="mb-3 text-sm leading-snug text-content-secondary">
                On your phone, open <span className="font-semibold">workout-tracker-two-alpha.vercel.app</span>, then:
              </p>
            )}
            <ol className="space-y-4">
              <li>
                <StepCaption n={1}>
                  Tap <span className="font-semibold">Share</span> in Safari (or whichever browser you use)
                </StepCaption>
                <BrowserBarMock />
              </li>
              <li>
                <StepCaption n={2}>
                  Scroll down, tap <span className="font-semibold">Add to Home Screen</span>
                </StepCaption>
                <ShareMenuMock />
              </li>
              <li>
                <StepCaption n={3}>
                  Tap <span className="font-semibold">Add</span>
                </StepCaption>
                <AddDialogMock />
              </li>
            </ol>
            {!ios && (
              <p className="mt-3 text-xs leading-relaxed text-content-muted">
                On Android it&rsquo;s one tap: choose <span className="font-medium">Install</span> from the browser menu.
              </p>
            )}
          </div>
        )}

        <button
          onClick={async () => {
            if ((await sharePage()) === "copied") {
              setShareLabel("Link copied");
              setTimeout(() => setShareLabel("Share it with a friend"), 2000);
            }
          }}
          className="pressable mt-4 flex w-full items-center justify-center gap-2 rounded-button border py-2.5 text-sm font-medium text-content-secondary hover:opacity-80"
          style={{ borderColor: "var(--card-border)" }}
        >
          <ShareIcon />
          {shareLabel}
        </button>

        <p className="mt-3 text-center text-[11px] text-content-muted">
          No app store, nothing to download. It&rsquo;s free.
        </p>
      </div>
    </Sheet>
  );
}
