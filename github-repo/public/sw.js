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
//
// v7: this cache poisoned itself and then could not recover.
//
// A missing asset does not 404 on this host — the SPA rewrite answers it with
// index.html, 200 OK, `text/html`. The asset strategy below saw `res.ok`, so it
// stored that HTML under the ASSET's URL. When MapLibre v6's worker file was
// briefly missing from the build, every client cached a page of HTML as
// `/assets/maplibre-gl-worker.mjs`, and a cache entry keyed by URL does not
// care that its body is the wrong media type. Those clients kept being handed
// HTML by their own service worker long after the server was fixed — which is
// why "the file is correct on the server" and "the maps still do not load" were
// both true at the same time.
//
// It could not heal itself either: stale-while-revalidate returned the cached
// copy and left the revalidation running outside `event.waitUntil`, so the
// browser was free to kill the worker before the good response was ever
// written back. Both are fixed below.
// Bumped to v8 to evict the shell caches that were poisoned with the
// platform's 404 page while the SPA rewrite was broken. Without this, clients
// that cached it keep serving it from disk until something else bumps the
// version.
const CACHE_VERSION = "sswx-v8";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

// `/offline.html` is the last resort when a navigation fails and no shell has
// been cached yet — a first visit that goes offline mid-load, or a cache that
// was cleared. Without it the browser's own error page is what people see,
// which on a severe-weather product looks like the app is simply broken.
const SHELL_URLS = ["/", "/index.html", "/offline.html", "/manifest.webmanifest", "/img/logo.webp", "/img/mark.webp", "/favicon.svg"];

self.addEventListener("install", (event) => {
  // Cache shell URLs individually so one failure can't block the worker installing.
  //
  // NO self.skipWaiting() HERE. It used to be on the end of this chain, and it
  // is why the app reloaded out from under people who had switched away and
  // come back. Calling it at install means a newly downloaded worker activates
  // the instant it is ready; `clients.claim()` below then takes over the open
  // page, which fires `controllerchange`, which reloads it. Whatever was on
  // screen — a half-written chase, a menu mid-reorder — went with it, and the
  // route reset to the section root.
  //
  // The page already decides this properly. `pwa.ts` watches for a waiting
  // worker and either hands over immediately (nobody is typing) or holds it
  // and offers a refresh chip, then takes it when the member leaves with no
  // unsaved work. All of that was dead code while this line existed, because
  // the worker never waited long enough to be asked. The handover now happens
  // on the "SKIP_WAITING" message at the bottom of this file, and only then.
  //
  // A first-ever install is unaffected: with no worker already in control there
  // is nothing to wait behind, so it activates on its own.
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => Promise.all(SHELL_URLS.map((u) => c.add(u).catch(() => {})))),
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
/**
 * Could this response ever answer this request?
 *
 * Script, worker, style and image requests cannot be satisfied by an HTML
 * document. On a single-page app every missing file comes back as one, so this
 * is the difference between a cache that survives a bad deploy and a cache that
 * memorises it.
 */
const NEEDS_CODE = ["script", "worker", "sharedworker", "serviceworker", "style", "image", "font"];
function isWrongType(req, res) {
  if (!NEEDS_CODE.includes(req.destination)) return false;
  const type = (res.headers.get("content-type") || "").toLowerCase();
  return type.includes("text/html");
}

const isSupabaseApi = (url) => url.pathname.includes("/rest/") || url.pathname.includes("/auth/") || url.pathname.includes("/functions/v1/storm-engine") || url.pathname.includes("/functions/v1/relay");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // App navigations: network-first, fall back to the cached shell (offline-friendly).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        // Only a GOOD response is allowed to become the shell.
        //
        // THE BUG THIS FIXES. This cached whatever came back, status and all.
        // While the SPA rewrite was broken every navigation to /dashboard,
        // /spc, /game and forty-four others returned the platform's 404 page —
        // and this wrote that 404 into the shell cache under "/". From then on
        // the offline fallback, and the first paint of any cold start served
        // from cache, was a page saying "This page doesn't exist".
        //
        // The routing fault is fixed separately, but caching an error response
        // as the app shell is wrong on its own: any transient 502 from the edge
        // would do the same thing, and it persists until the cache version is
        // bumped. A bad answer should never outlive the request that caused it.
        if (res.ok && res.type !== "opaque") {
          caches.open(SHELL_CACHE).then((c) => c.put("/", res.clone())).catch(() => {});
        }
        return res;
      }).catch(() =>
        caches.match("/")
          .then((r) => r || caches.match("/index.html"))
          .then((r) => r || caches.match("/offline.html"))
          // Even the precache can be missing — a failed install, or storage
          // evicted under pressure. Answer with something rather than letting
          // the fetch handler reject into the browser's error page.
          .then((r) => r || new Response(
            "<!doctype html><meta charset=utf-8><title>Offline</title>" +
            "<body style=\"background:#070713;color:#f1f4ff;font:16px/1.6 system-ui;" +
            "display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center\">" +
            "<div><p>You're offline.</p><p style=\"color:#a3a3cc;font-size:14px\">" +
            "Anything still on screen may be out of date.</p></div>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
          )),
      ),
    );
    return;
  }

  // Never cache Supabase auth/REST/engine — they're auth-sensitive and dynamic.
  if (isSupabaseApi(url)) return;

  // Weather data (our proxy + public weather APIs): network-first, cache fallback.
  //
  // The cache fallback used to be `.catch(() => caches.match(req))` on its own,
  // and `caches.match` resolves to UNDEFINED when nothing has been stored yet.
  // Handing undefined to respondWith is not "fall through to the network" — it
  // is a network error, delivered to the page as a rejected fetch with no
  // status and no body. On the Home page that is the Weather News tab dying on
  // a first visit, or on any visit where the request fails before a single good
  // response has ever been cached, with nothing to say why.
  //
  // So: cache if we have it, and otherwise answer in the shape the caller
  // already knows how to read. `/news/weather` is consumed as `{ items: [] }`,
  // and a 503 with an empty list lets the page render "no headlines right now"
  // instead of showing a spinner for ever.
  if (isWeatherFn(url) || DATA_HOSTS.includes(url.hostname)) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(DATA_CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || new Response(
        JSON.stringify({ items: [], error: "offline" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ))),
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate. Serve the cached copy
  // immediately, but always re-fetch in the background so a new deploy's files
  // replace the old ones instead of living in the cache indefinitely.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        // A cached response whose media type cannot possibly answer this
        // request is the SPA rewrite's HTML, stored back when the real file was
        // missing. Ignore it and go to the network, or the app stays broken
        // until something else clears the cache.
        const usable = cached && !isWrongType(req, cached) ? cached : null;
        if (cached && !usable) caches.open(ASSET_CACHE).then((c) => c.delete(req)).catch(() => {});

        const network = fetch(req).then((res) => {
          // Only store something that could actually serve this request next
          // time. This single check is what stopped the cache poisoning itself.
          if (res.ok && !isWrongType(req, res)) {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch((err) => {
          if (usable) return usable;
          throw err;
        });

        // Keep the worker alive until the revalidation finishes. Without this
        // the browser may terminate it the moment `respondWith` resolves from
        // cache, so the background refresh never lands and a bad entry can
        // survive indefinitely.
        event.waitUntil(network.catch(() => {}));
        return usable || network;
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
