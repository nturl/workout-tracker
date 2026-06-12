/**
 * Client-side Web Push helpers.
 * Handles permission, subscription, and server sync.
 */

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; ++i) view[i] = rawData.charCodeAt(i);
  return view;
}

// Shared with sw.js: the SW reads VAPID_KEY_URL on pushsubscriptionchange
// and parks a new subscription at PENDING_SUB_URL for the client to upload.
const PUSH_CONFIG_CACHE = "push-config";
const VAPID_KEY_URL = "/__push-vapid";
const PENDING_SUB_URL = "/__push-pending-sub";

async function cacheVapidKey(key: string): Promise<void> {
  try {
    const cache = await caches.open(PUSH_CONFIG_CACHE);
    await cache.put(VAPID_KEY_URL, new Response(key, { headers: { "Content-Type": "text/plain" } }));
  } catch {
    // Cache API unavailable (e.g., private browsing) - self-heal is degraded
    // but manual re-enable still works.
  }
}

/**
 * If the service worker caught a pushsubscriptionchange while the app was
 * closed, a re-subscription is waiting in cache. Upload it to the server
 * so the user keeps getting pushes without tapping Enable again.
 */
export async function drainPendingResub(): Promise<void> {
  try {
    const cache = await caches.open(PUSH_CONFIG_CACHE);
    const res = await cache.match(PENDING_SUB_URL);
    if (!res) return;
    const sub = await res.json();
    let timezone: string | undefined;
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
    const upload = await postJSON({ action: "subscribe", subscription: sub, timezone });
    if (upload.ok) await cache.delete(PENDING_SUB_URL);
  } catch {
    // Client will reconcile via hasBrowserSubscription on next mount.
  }
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

// iOS 16.4+ delivers web push only from PWAs added to the home screen.
// In Safari proper, permission prompts succeed but pushes never arrive.
// We detect this to show the "install first" affordance before the user
// taps Enable.
interface IOSNavigator extends Navigator { standalone?: boolean }
export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}
export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as IOSNavigator;
  if (nav.standalone === true) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches === true;
}
export function needsPWAInstall(): boolean {
  return isIOS() && !isStandalonePWA();
}

// Checks whether the browser still holds a push subscription. Used to
// reconcile the server's "subscribed" record against reality on load -
// Safari may quietly drop subscriptions when storage is cleared.
export async function hasBrowserSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  // Prefer ready so the SW is actually active before we try to subscribe.
  return navigator.serviceWorker.ready.catch(() => null);
}

async function postJSON(body: unknown): Promise<Response> {
  return fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
    body: JSON.stringify(body),
  });
}

export interface SubscribeResult {
  success: boolean;
  error?: string;
}

export async function subscribeToPush(vapidPublicKey: string): Promise<SubscribeResult> {
  if (!isPushSupported()) return { success: false, error: "Push not supported on this device" };
  if (!vapidPublicKey) return { success: false, error: "Missing VAPID public key" };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { success: false, error: permission === "denied" ? "Notifications blocked. Enable in browser settings." : "Permission not granted" };
    }

    const reg = await getRegistration();
    if (!reg) return { success: false, error: "Service worker not ready" };

    // Reuse existing subscription if present, otherwise create one.
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const json = sub.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { success: false, error: "Invalid subscription payload" };
    }

    let timezone: string | undefined;
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}

    const res = await postJSON({ action: "subscribe", subscription: json, timezone });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error || `Server rejected subscription (${res.status})` };
    }
    // Park the public key where the SW can read it on pushsubscriptionchange.
    await cacheVapidKey(vapidPublicKey);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Subscription failed" };
  }
}

export async function unsubscribeFromPush(): Promise<SubscribeResult> {
  try {
    const reg = await getRegistration();
    if (!reg) return { success: false, error: "Service worker not ready" };
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { success: true };
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await postJSON({ action: "unsubscribe", endpoint });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unsubscribe failed" };
  }
}

export async function sendTestPush(): Promise<{ success: boolean; error?: string; sent?: number }> {
  const res = await postJSON({ action: "test" });
  if (!res.ok) return { success: false, error: `Server error ${res.status}` };
  const data = await res.json();
  if (data.sent === 0) return { success: false, error: "No active subscriptions. Re-enable notifications.", sent: 0 };
  return { success: data.success, sent: data.sent };
}

export async function getPushStatus(): Promise<{ subscribed: boolean; deviceCount: number }> {
  const res = await postJSON({ action: "status" });
  if (!res.ok) return { subscribed: false, deviceCount: 0 };
  return await res.json();
}
