import { useEffect } from "react";
import { useLocation } from "wouter";
import { PAGES, SITE_NAME, SITE_URL, OG_IMAGE, canonical, pageSeo } from "../lib/seo";

/**
 * Keeps the document head honest as you move around the app.
 *
 * The build writes a real HTML file per public route, which is what a crawler
 * and a link preview see. But once React takes over, wouter changes the URL
 * without reloading, and the head would keep whatever the first page set —
 * so the tab, the history entry, the bookmark and anything Google's renderer
 * looks at after hydration would all name the wrong page.
 *
 * GATED PAGES ARE MARKED `noindex` HERE. Every one of the thirty-nine renders
 * a sign-in wall to anything without a session, so letting them be indexed
 * would fill the index with forty near-identical login pages and bury the four
 * that are worth finding. They stay crawlable — `noindex, follow` — so links
 * out of them still count.
 */
export function useSeo() {
  const [path] = useLocation();

  useEffect(() => {
    const page = pageSeo(path);
    const isPublic = Boolean(page);

    const title = page?.title ?? `${moduleName(path)} — ${SITE_NAME}`;
    const description = page?.description
      ?? "Live severe weather intelligence for storm chasers, spotters and weather enthusiasts.";

    document.title = title;
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", canonical(path));
    setMeta("property", "og:image", OG_IMAGE);
    setMeta("property", "og:site_name", SITE_NAME);
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", OG_IMAGE);

    // A page behind a sign-in wall has nothing to offer a searcher.
    setMeta("name", "robots", isPublic && page?.index !== false
      ? "index, follow, max-image-preview:large"
      : "noindex, follow");

    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = canonical(path);
  }, [path]);
}

function setMeta(kind: "name" | "property", key: string, value: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${kind}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(kind, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

/**
 * A readable name for a gated route, for the browser tab.
 *
 * These are not indexed, so this is for the person with fourteen tabs open
 * rather than for a search engine: "Hurricane Tracker — StormSync Media" is
 * findable in a tab strip and "StormSync Media" forty times over is not.
 */
const MODULE_NAMES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/forecast": "Forecast",
  "/spc": "SPC Outlooks",
  "/warnings": "Active Warnings",
  "/hurricane": "Hurricane Tracker",
  "/hurricane/history": "Storm Archive",
  "/swti": "Severe Threat Index",
  "/timing": "Storm Timing",
  "/sswxcon": "SSWXCon Score",
  "/lightning-globe": "Lightning",
  "/history": "Severe Weather History",
  "/aurora": "Aurora & Stargazing",
  "/moon": "Moon Phase & Astronomy",
  "/game": "Forecast Game",
  "/trivia": "Daily Trivia",
  "/raffles": "Raffles",
  "/glossary": "Weather Glossary",
  "/wpi": "Weather Patterns",
  "/profile": "Your Profile",
  "/subscription": "Subscription",
  "/admin": "Admin",
};

function moduleName(path: string): string {
  if (MODULE_NAMES[path]) return MODULE_NAMES[path];
  if (path.startsWith("/hurricane/")) return "Storm Tracker";
  const seg = path.split("/").filter(Boolean)[0];
  return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : "Home";
}

/** Every public path, for the sitemap and for tests. */
export const PUBLIC_PATHS = PAGES.filter((p) => p.index !== false).map((p) => p.path);
export { SITE_URL };
