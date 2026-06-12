"use client";

import { useState, useEffect, useCallback } from "react";
import { weeklyPlan } from "@/lib/workoutData";
import { DAYS } from "@/lib/helpers";
import {
  isPushSupported,
  getPermission,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestPush,
  needsPWAInstall,
  hasBrowserSubscription,
  drainPendingResub,
} from "@/lib/pushClient";
import type { PushPreferences } from "@/lib/webpush";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

async function fetchPrefs(): Promise<{ prefs: PushPreferences; subscribed: boolean; deviceCount: number } | null> {
  try {
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
      body: JSON.stringify({ action: "get-prefs" }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function savePrefs(patch: Partial<PushPreferences>): Promise<PushPreferences | null> {
  try {
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
      body: JSON.stringify({ action: "set-prefs", prefs: patch }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.prefs || null;
  } catch { return null; }
}

export function PushSetup() {
  // Environment facts resolve in lazy initializers, not a mount effect:
  // PushSetup only mounts client-side (Settings tab is lazy-loaded), so the
  // window guard is SSR insurance, and react-compiler stays happy.
  const [supported] = useState(() => typeof window === "undefined" || isPushSupported());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    () => (typeof window === "undefined" ? "default" : getPermission())
  );
  const [subscribed, setSubscribed] = useState(false);
  const [deviceCount, setDeviceCount] = useState(0);
  const [prefs, setPrefs] = useState<PushPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [swReady, setSwReady] = useState(false);
  const [needsInstall] = useState(() => typeof window !== "undefined" && needsPWAInstall());
  const [driftWarning, setDriftWarning] = useState(false);

  useEffect(() => {
    // Wait for SW to reach "ready" before allowing Enable - subscribing
    // before active registration is a common iOS failure mode.
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(() => setSwReady(true)).catch(() => setSwReady(false));
    }

    // Upload any subscription the SW re-created while the app was closed,
    // then fetch authoritative prefs/subscribed state from the server.
    drainPendingResub().finally(() => {
      fetchPrefs().then(async (d) => {
        if (d) {
          let resolvedPrefs = d.prefs;

          // Refresh stored timezone if the browser's current zone differs.
          // Keeps reminder fire times aligned with the user's actual location
          // when they travel. The cron uses prefs.timezone to compute local time.
          const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (browserTz && browserTz !== d.prefs.timezone) {
            const updated = await savePrefs({ timezone: browserTz });
            if (updated) resolvedPrefs = updated;
          }

          setPrefs(resolvedPrefs);
          setSubscribed(d.subscribed);
          setDeviceCount(d.deviceCount);

          // Reconcile: server thinks this device is subscribed, but browser lost it.
          if (d.subscribed && !(await hasBrowserSubscription())) {
            setDriftWarning(true);
            setSubscribed(false);
          }
        }
        setLoaded(true);
      });
    });
  }, []);

  const flash = (msg: string, ms = 2500) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), ms);
  };

  const handleEnable = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    const result = await subscribeToPush(VAPID_PUBLIC);
    if (result.success) {
      setSubscribed(true);
      setPermission(getPermission());
      const refreshed = await fetchPrefs();
      if (refreshed) {
        setPrefs(refreshed.prefs);
        setDeviceCount(refreshed.deviceCount);
      }
      flash("Notifications enabled");
    } else {
      flash(result.error || "Failed to enable");
    }
    setBusy(false);
  }, []);

  const handleDisable = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    await unsubscribeFromPush();
    setSubscribed(false);
    setDeviceCount((c) => Math.max(0, c - 1));
    flash("Notifications disabled on this device");
    setBusy(false);
  }, []);

  const handleTest = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    const result = await sendTestPush();
    flash(result.success ? "Test sent - check your notifications" : result.error || "Failed");
    setBusy(false);
  }, []);

  const togglePref = async (key: "reminders" | "completions" | "streakAlerts") => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    await savePrefs({ [key]: next[key] });
  };

  const updateTime = async (day: string, time: string) => {
    if (!prefs) return;
    const nextTimes = { ...prefs.times, [day]: time };
    const next = { ...prefs, times: nextTimes };
    setPrefs(next);
    await savePrefs({ times: nextTimes });
  };

  if (!loaded) {
    return (
      <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)" }}>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading notifications...</p>
      </div>
    );
  }

  if (!supported || permission === "unsupported") {
    return (
      <div>
        <p className="text-xs font-semibold tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>Notifications</p>
        <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Not supported on this device</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Install the app to your home screen first (Share → Add to Home Screen on iOS), then enable notifications from there.
          </p>
        </div>
      </div>
    );
  }

  // iOS: notifications only work inside the home-screen PWA. Surface this
  // before the user taps Enable in Safari and hits a silent failure.
  if (needsInstall) {
    return (
      <div>
        <p className="text-xs font-semibold tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>Notifications</p>
        <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Install to home screen first</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Notifications on iOS require the app to live on your home screen.
          </p>
          <ol className="text-xs mt-2 space-y-1 list-decimal list-inside" style={{ color: "var(--text-secondary)" }}>
            <li>Tap the Share button in Safari</li>
            <li>Choose Add to Home Screen</li>
            <li>Open the app from your home screen and return here</li>
          </ol>
        </div>
      </div>
    );
  }

  const blocked = permission === "denied";
  const enabled = subscribed && permission === "granted";

  return (
    <div>
      <p className="text-xs font-semibold tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>Notifications</p>
      <div className="space-y-3">
        {/* Main toggle */}
        <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                {enabled ? "Notifications on" : "Enable notifications"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {enabled
                  ? `Active on ${deviceCount} device${deviceCount === 1 ? "" : "s"}. Daily reminders, completions, streaks.`
                  : blocked
                  ? "Blocked. Enable in your browser settings."
                  : "One-tap setup. Daily reminders, recovery insights, streak alerts."}
              </p>
            </div>
            {enabled ? (
              <button onClick={handleDisable} disabled={busy}
                className="shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all hover:opacity-80 disabled:opacity-50"
                style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}>
                Turn off
              </button>
            ) : (
              <button onClick={handleEnable} disabled={busy || blocked || !swReady}
                className="shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}>
                {busy ? "..." : !swReady ? "Preparing" : "Enable"}
              </button>
            )}
          </div>
          {driftWarning && (
            <p className="text-xs mt-2" style={{ color: "#eab308" }}>
              Your previous subscription was lost by this browser. Tap Enable to reconnect.
            </p>
          )}
        </div>

        {enabled && (
          <>
            {/* Test button */}
            <button onClick={handleTest} disabled={busy}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
              style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
              {busy ? "Sending..." : "Send test notification"}
            </button>

            {/* Category toggles */}
            {prefs && (
              <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-elevated)" }}>
                {([
                  { key: "reminders" as const, label: "Daily reminders", description: "Workout push at your chosen time" },
                  { key: "completions" as const, label: "Completion alerts", description: "Confirm workouts and weekly goals" },
                  { key: "streakAlerts" as const, label: "Streak alerts", description: "Milestones and don't-break-it nudges" },
                ]).map((opt) => {
                  const on = prefs[opt.key];
                  return (
                    <div key={opt.key} className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{opt.label}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{opt.description}</p>
                      </div>
                      <button onClick={() => togglePref(opt.key)}
                        role="switch" aria-checked={on} aria-label={opt.label}
                        className={`shrink-0 w-12 h-7 rounded-full transition-all relative ${on ? "bg-green-500" : ""}`}
                        style={{ background: on ? undefined : "var(--border)" }}>
                        <div className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-1 transition-all ${on ? "left-6" : "left-1"}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Per-day times */}
            {prefs && prefs.reminders && (
              <div className="rounded-xl p-4" style={{ background: "var(--bg-elevated)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Reminder times ({prefs.timezone || "local"})</p>
                <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>Delivered within 15 minutes of your chosen time.</p>
                <div className="space-y-2">
                  {DAYS.map((day) => {
                    const plan = weeklyPlan.find((p) => p.day === day);
                    if (!plan) return null;
                    // Show the day's main workouts, skipping the daily Egoscue
                    // posture anchor (applies every day, not informative as a label).
                    const mainSessions = plan.sessions
                      .filter((s) => s.title !== "Egoscue E-cises")
                      .map((s) => s.title)
                      .join(" + ") || plan.sessions[0]?.title;
                    return (
                      <div key={day} className="flex items-center justify-between gap-3 py-1">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{day}</div>
                          <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{mainSessions}</div>
                        </div>
                        <input type="time" step={900} value={prefs.times[day] || "07:00"}
                          onChange={(e) => updateTime(day, e.target.value)}
                          aria-label={`Reminder time for ${day}`}
                          className="shrink-0 text-sm rounded-lg px-2 py-1 border outline-none"
                          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {status && (
          <p className="text-xs text-center py-1" style={{
            color: status.includes("enabled") || status.includes("sent") ? "#22c55e" : "#ef4444"
          }}>
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
