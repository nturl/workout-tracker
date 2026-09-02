// BUG-28: bump this version suffix on every deploy that changes cached HTML
// or assets. That's what actually keeps users off a stale shell here - the
// activate handler below deletes any cache whose name isn't in this list, so
// a version bump throws away the previous deploy's cached "/" shell and any
// static assets cached under it (which would otherwise reference chunk URLs
// from a build that no longer exists on the server). There's no build step
// wired up to bump this automatically; it has to be done by hand per deploy.
const CACHE_NAME = "workout-tracker-v6";
const STATIC_CACHE = "workout-static-v6";
const API_CACHE = "workout-api-v6";

// Deliberately NOT listing hashed Next.js chunk/CSS filenames here: they
// change every build, so a hand-maintained list would go stale (missing new
// chunks, holding dead ones) the moment code changes. Instead:
//   - the navigate handler below re-caches the HTML shell on every
//     successful online load, so it can't go stale while the user is online;
//   - the static-assets handler is cache-first but populates the cache the
//     first time each asset is actually requested, so a chunk referenced by
//     a freshly-fetched shell gets fetched (and cached) right behind it.
// Tradeoff: a user who goes offline before ever loading a given route in
// this session can still hit a cache-miss for that route's chunks. Fully
// closing that gap would mean precaching every build's hashed asset list,
// which needs a build-time manifest this file doesn't have access to - out
// of scope for this fix. What IS fixed here is the deploy-to-deploy case:
// the version bump above ensures no one keeps running yesterday's cached
// shell/assets indefinitely.
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
];

// Offline sync queue stored in IndexedDB
const DB_NAME = "workout-sync";
const STORE_NAME = "queue";

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function addToQueue(data) {
  const db = await openSyncDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).add({ ...data, timestamp: Date.now() });
  return new Promise((resolve) => { tx.oncomplete = resolve; });
}

async function drainQueue() {
  const db = await openSyncDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const items = await new Promise((resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
  });

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body),
      });
      // Delete on success OR client errors (4xx) — only retry on server errors (5xx)
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        const delTx = db.transaction(STORE_NAME, "readwrite");
        delTx.objectStore(STORE_NAME).delete(item.id);
        await new Promise((resolve, reject) => {
          delTx.oncomplete = resolve;
          delTx.onerror = () => reject(delTx.error);
        });
      }
    } catch {
      // Network error — still offline, stop draining
      break;
    }
  }
}

// Install: precache essential resources
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  const validCaches = [CACHE_NAME, STATIC_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !validCaches.includes(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: strategy-based caching
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Navigation: network first, fallback to cache
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // API sync requests: queue if offline
  if (url.pathname === "/api/sync" && event.request.method === "POST") {
    event.respondWith(
      fetch(event.request.clone()).catch(async () => {
        const body = await event.request.json();
        await addToQueue({ url: url.pathname, method: "POST", body });
        return new Response(JSON.stringify({ queued: true }), {
          headers: { "Content-Type": "application/json" },
        });
      })
    );
    return;
  }

  // API GET: network first, cache fallback (stale-while-revalidate)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets: cache first
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Everything else: network first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Background sync: drain queue when back online
self.addEventListener("sync", (event) => {
  if (event.tag === "workout-sync") {
    event.waitUntil(drainQueue());
  }
});

// Listen for online event to drain queue
self.addEventListener("message", (event) => {
  if (event.data === "drain-queue") {
    drainQueue().catch((err) => console.error("Queue drain failed:", err));
  }
});

// --- V16: Web Push ---
// Server posts JSON payloads: { title, body, tag?, url?, icon?, badge?, requireInteraction?, data? }
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Workout Tracker", body: event.data ? event.data.text() : "" };
  }
  const title = (payload.title || "Workout Tracker").slice(0, 60);
  const options = {
    body: (payload.body || "").slice(0, 200),
    tag: payload.tag || "workout-tracker",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/badge.svg",
    vibrate: payload.vibrate || [100, 50, 100],
    requireInteraction: !!payload.requireInteraction,
    data: { url: payload.url || "/", ...(payload.data || {}) },
    renotify: !!payload.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Focus an open tab when a notification is clicked; otherwise open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) {
            try { await client.navigate(targetUrl); } catch {}
          }
          return;
        }
      } catch {}
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

// iOS Safari and Chromium rotate push subscriptions occasionally. When the
// browser notifies us, the PWA is usually closed - so we self-heal:
//   1. Read the VAPID public key from a cache the client populated on subscribe.
//   2. Re-subscribe inside the service worker.
//   3. Park the new subscription in cache for the client to upload next open.
// No authenticated HTTP call happens here because the SW has no Clerk session.
const PUSH_CONFIG_CACHE = "push-config";
const VAPID_KEY_URL = "/__push-vapid";
const PENDING_SUB_URL = "/__push-pending-sub";

function b64ToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(PUSH_CONFIG_CACHE);
      const keyRes = await cache.match(VAPID_KEY_URL);
      if (!keyRes) return;
      const vapidPublic = await keyRes.text();

      const newSub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToBytes(vapidPublic),
      });

      await cache.put(PENDING_SUB_URL, new Response(JSON.stringify(newSub.toJSON()), {
        headers: { "Content-Type": "application/json" },
      }));

      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        client.postMessage({ type: "push-subscription-changed" });
      }
    } catch {
      // Swallow - client-side reconciliation on next mount is the safety net.
    }
  })());
});
