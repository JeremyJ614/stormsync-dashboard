/* StormSync VIP service worker (Phase 8).
 * - Makes the app installable + offline (app shell precache, runtime caching).
 * - Serves the last forecast/alerts from cache when the network is down.
 * - Handles Web Push notifications (Part B): shows them and focuses the app on tap.
 * Bump CACHE_VERSION to force clients onto a new worker.
 */
// Bumped whenever the caching strategy changes. Note the *asset* cache is now
// revalidated in the background rather than served blindly, because a fixed
// version plus cache-first meant a stale index.html could keep pointing at
// chunk hashes that no longer exist after a deploy — every route is a lazy
// import, so that renders as a page that simply never appears.
const CACHE_VERSION = "sswx-v6";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

const SHELL_URLS = ["/", "/index.html", "/manifest.webmanifest", "/img/logo.webp", "/img/mark.webp", "/favicon.svg"];

self.addEventListener("install", (event) => {
  // Cache shell URLs individually so one failure can't block the worker installing.
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => Promise.all(SHELL_URLS.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

// Hosts whose GET responses are worth caching for offline "last forecast/alerts".
const DATA_HOSTS = ["api.open-meteo.com", "api.weather.gov", "www.spc.noaa.gov", "services.swpc.noaa.gov"];
const isWeatherFn = (url) => url.pathname.includes("/functions/v1/weather");
const isSupabaseApi = (url) => url.pathname.includes("/rest/") || url.pathname.includes("/auth/") || url.pathname.includes("/functions/v1/storm-engine") || url.pathname.includes("/functions/v1/relay");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // App navigations: network-first, fall back to the cached shell (offline-friendly).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        caches.open(SHELL_CACHE).then((c) => c.put("/", res.clone())).catch(() => {});
        return res;
      }).catch(() => caches.match("/").then((r) => r || caches.match("/index.html"))),
    );
    return;
  }

  // Never cache Supabase auth/REST/engine — they're auth-sensitive and dynamic.
  if (isSupabaseApi(url)) return;

  // Weather data (our proxy + public weather APIs): network-first, cache fallback.
  if (isWeatherFn(url) || DATA_HOSTS.includes(url.hostname)) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(DATA_CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() => caches.match(req)),
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate. Serve the cached copy
  // immediately, but always re-fetch in the background so a new deploy's files
  // replace the old ones instead of living in the cache indefinitely.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch((err) => {
          if (cached) return cached;
          throw err;
        });
        return cached || network;
      }),
    );
  }
});

// Let a waiting worker take over as soon as the page asks it to, so a deploy
// does not sit behind an old worker until every tab is closed.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// ── Web Push (Part B) ────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "StormSync Alert";
  const options = {
    body: data.body || "A weather alert is active for one of your saved locations.",
    icon: "/img/logo.webp",
    badge: "/favicon.svg",
    tag: data.tag || "sswx-alert",
    data: { url: data.url || "/warnings" },
    vibrate: [200, 100, 200],
    requireInteraction: data.severe === true,
  };
  // Delivery receipt. A push service returns 201 for any subscription it still
  // recognises, including one belonging to a browser profile wiped months ago —
  // so the server cannot tell "delivered" from "accepted". The device can, and
  // says so here.
  //
  // The endpoint comes from the payload rather than from getSubscription(): the
  // server addressed this push to that endpoint, the payload is encrypted end to
  // end, and it means the receipt does not depend on a second async lookup that
  // can come back empty. getSubscription() is only the fallback.
  //
  // Best-effort throughout — a failed receipt must never cost the notification,
  // which is why showNotification is the thing that has to succeed.
  const ack = data.ackUrl
    ? Promise.resolve(data.endpoint || self.registration.pushManager.getSubscription().then((s) => s && s.endpoint))
        .then((endpoint) => endpoint && fetch(data.ackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
          keepalive: true,
        }))
        .catch(() => {})
    : Promise.resolve();

  event.waitUntil(Promise.all([self.registration.showNotification(title, options), ack]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => "focus" in c);
      if (existing) { existing.navigate(target); return existing.focus(); }
      return self.clients.openWindow(target);
    }),
  );
});
