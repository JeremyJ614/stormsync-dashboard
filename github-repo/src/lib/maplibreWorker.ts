/**
 * Where MapLibre's worker lives, stated rather than guessed.
 *
 * TWO BUGS MET HERE, AND THIS IS THE ESCAPE HATCH FROM BOTH.
 *
 * MapLibre v6 resolves its worker at runtime from a filename it assembles out
 * of a variable, so no bundler can see it and Rollup never emitted the file.
 * The built app asked for `/assets/maplibre-gl-worker.mjs` and Vercel's SPA
 * rewrite answered with `index.html` — 200 OK, `text/html`. Tile parsing lives
 * in that worker, so every map mounted, painted its background and waited
 * for ever, with nothing logged on the page.
 *
 * The Vite plugin now emits the file, which fixes the server. It does not fix
 * the browsers that already asked. The service worker's asset strategy cached
 * that 200-OK HTML *under the worker's own URL*, and a cache entry keyed by URL
 * does not care that its body is the wrong media type. Those clients keep being
 * handed HTML by their own service worker no matter what the server sends.
 *
 * So the worker moved. `assets/mlv6/` is a path no client has ever requested,
 * which means no client has a poisoned entry for it: the service worker misses,
 * goes to the network, and gets JavaScript. That heals every existing install
 * on its next load without waiting for a new service worker to take over —
 * which matters, because this one deliberately waits for a quiet moment rather
 * than reloading the page out from under whoever is using it.
 *
 * `sw.js` is fixed too (it will no longer store an HTML body for a script
 * request, and its revalidation is no longer killed mid-flight). This module is
 * what makes the repair immediate instead of eventual.
 *
 * Import it for side effects before constructing any Map. It is idempotent and
 * costs one function call.
 */
import { setWorkerUrl } from "maplibre-gl";

/** Kept in step with the directory the Vite plugin emits into. */
const WORKER_PATH = "assets/mlv6/maplibre-gl-worker.mjs";

let done = false;

export function useMapLibreWorker(): void {
  if (done || typeof window === "undefined") return;
  done = true;
  const base = import.meta.env.BASE_URL || "/";
  setWorkerUrl(new URL(`${base}${WORKER_PATH}`, window.location.origin).href);
}

useMapLibreWorker();
