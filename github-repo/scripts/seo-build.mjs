/**
 * Give every public page its own real HTML file.
 *
 * A Vite SPA ships one `index.html` and lets the router decide what to render.
 * That is invisible to half the internet: Facebook, X, Discord, iMessage,
 * Slack and LinkedIn fetch a URL and read the head WITHOUT running JavaScript.
 * A title set by React is a title they never see. So every StormSync link
 * shared anywhere showed "StormSync Media — VIP Forecast Group", no picture,
 * for every one of the forty-seven routes — including the front page.
 *
 * Google does render JavaScript, but it renders on a queue and it compares
 * what it rendered against what was served. Forty-seven URLs served with one
 * identical title is the textbook signature of duplicate content, and it is
 * why a site with real pages can end up with one of them indexed.
 *
 * This runs after `vite build` and writes, for each public route, a copy of
 * the built index.html with that page's own title, description, canonical,
 * Open Graph, Twitter card and JSON-LD in the head. The bundle is untouched,
 * so the app still hydrates and takes over exactly as before — the difference
 * is only what arrives before it does.
 *
 * It also emits robots.txt, sitemap.xml and llms.txt from the same table, so
 * the three cannot drift apart.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

/* The page table is TypeScript, and this is a plain node script run by the
   build, so the values are read out of the source rather than imported. One
   table, parsed — not a second copy that would quietly disagree with the app. */
const seoSrc = await readFile(join(ROOT, "src/lib/seo.ts"), "utf8");

const SITE_URL = pick(seoSrc, /export const SITE_URL = "([^"]+)"/);
const SITE_NAME = pick(seoSrc, /export const SITE_NAME = "([^"]+)"/);
const OG_IMAGE = `${SITE_URL}/opengraph.jpg`;

function pick(src, re) {
  const m = src.match(re);
  if (!m) throw new Error(`seo-build: could not read ${re} from src/lib/seo.ts`);
  return m[1];
}

/**
 * The pages, parsed out of the same array the app uses.
 *
 * Deliberately strict: if the shape of `PAGES` changes and this stops
 * matching, the build FAILS rather than silently emitting a sitemap with no
 * pages in it. A quiet SEO regression is one nobody notices for months.
 */
function parsePages(src) {
  const block = src.match(/export const PAGES: PageSeo\[\] = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error("seo-build: could not find the PAGES array");
  const pages = [];
  for (const entry of block[1].split(/\n  \{/).slice(1)) {
    const path = entry.match(/path: "([^"]+)"/)?.[1];
    const title = entry.match(/title:\s*\n?\s*"((?:[^"\\]|\\.)*)"/)?.[1]
      ?? entry.match(/title: "((?:[^"\\]|\\.)*)"/)?.[1];
    // Descriptions are written as concatenated string literals for line width;
    // join the pieces back into the one sentence they are.
    const descBlock = entry.match(/description:([\s\S]*?)(?:\n    index:|\n  \})/);
    const description = descBlock
      ? [...descBlock[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("")
      : "";
    const index = !/index: false/.test(entry);
    if (path && title && description) pages.push({ path, title, description, index });
  }
  if (pages.length === 0) throw new Error("seo-build: parsed zero pages");
  return pages;
}

const PAGES = parsePages(seoSrc);
const canonical = (p) => (p === "/" ? `${SITE_URL}/` : SITE_URL + p.replace(/\/+$/, ""));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ── the shared schema blocks ───────────────────────────────────────────── */

const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
  description:
    "Severe weather intelligence and live storm tracking for storm chasers, spotters and "
    + "weather enthusiasts across the United States.",
  areaServed: { "@type": "Country", name: "United States" },
};

const website = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: "en-US",
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
};

const application = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: "WeatherApplication",
  operatingSystem: "Any",
  description:
    "Live severe weather tracking: SPC convective outlooks, National Weather Service warnings, "
    + "hurricane and tropical tracking, radar, lightning, a national storm-activity score and a "
    + "daily forecasting game.",
  offers: [
    { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
    { "@type": "Offer", name: "Basic", price: "2.99", priceCurrency: "USD" },
    { "@type": "Offer", name: "VIP", price: "4.99", priceCurrency: "USD" },
    { "@type": "Offer", name: "Advanced", price: "7.99", priceCurrency: "USD" },
  ],
};

const breadcrumb = (path, label) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: path === "/"
    ? [{ "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` }]
    : [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: label, item: canonical(path) },
      ],
});

const ld = (obj) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

/* ── head assembly ──────────────────────────────────────────────────────── */

/**
 * The general FAQ, read out of `faqDefaults.ts`.
 *
 * `faqSchema()` has existed in `src/lib/seo.ts` since the SEO work went in, and
 * `FAQ.tsx` calls it — but only at RUN time, so the block lands in the DOM
 * after React mounts and is absent from the HTML every crawler is actually
 * served. Building it here puts it in the file.
 *
 * Only the General FAQ, deliberately. The Module Guide section is generated
 * from `moduleGuide.ts` and is thirty-eight entries of product description
 * rather than questions anybody typed into a search box, and padding FAQPage
 * markup with things that are not questions is how a site loses the markup's
 * benefit of the doubt.
 *
 * Worth being honest about the ceiling: since 2023 Google has shown FAQ rich
 * results only for government and health sites, so this is not going to draw an
 * accordion under the listing. What it still does is let Bing, and the answer
 * engines that read structured data rather than rendering pages, quote the
 * answers instead of guessing at them.
 */
function parseFaq(src) {
  const block = src.match(/const GENERAL: DefaultEntry\[\] = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error("seo-build: could not find the GENERAL FAQ array");
  const out = [];
  for (const entry of block[1].split(/\n  \{/).slice(1)) {
    const q = entry.match(/title: "((?:[^"\\]|\\.)*)"/)?.[1];
    // The first section's body. A section with a heading is a sub-answer; the
    // first one is the answer, and concatenating all of them produces a wall
    // of text no answer engine would quote.
    const a = entry.match(/S\("(?:[^"\\]|\\.)*",\s*"((?:[^"\\]|\\.)*)"\)/)?.[1];
    if (q && a) out.push({ q: unesc(q), a: unesc(a) });
  }
  if (!out.length) throw new Error("seo-build: parsed no FAQ entries");
  return out;
}

const unesc = (v) => v.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

const faqEntries = parseFaq(
  await readFile(join(ROOT, "src/lib/faqDefaults.ts"), "utf8"));

const faqPage = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqEntries.map((e) => ({
    "@type": "Question",
    name: e.q,
    acceptedAnswer: { "@type": "Answer", text: e.a },
  })),
};

function headFor(page) {
  const url = canonical(page.path);
  const label = page.title.split("—")[0].trim();
  const robots = page.index
    ? "index, follow, max-image-preview:large, max-snippet:-1"
    : "noindex, follow";

  const schemas = [organization, website];
  if (page.path === "/") schemas.push(application);
  if (page.path === "/faq") schemas.push(faqPage);
  schemas.push(breadcrumb(page.path, label));

  return [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    // The real dimensions of public/opengraph.jpg. These said 1200x630, which
    // is the usual recommendation but not what the file is — and a crawler that
    // trusts the declared size to lay out a card before the image arrives lays
    // out the wrong box.
    `<meta property="og:image:width" content="1280" />`,
    `<meta property="og:image:height" content="720" />`,
    `<meta property="og:image:alt" content="StormSync Media severe weather tracking" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:url" content="${url}" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    `<meta name="twitter:image:alt" content="StormSync Media severe weather tracking" />`,
    ...schemas.map(ld),
  ].join("\n    ");
}

/**
 * Replace the head tags the template ships with, and insert the page's own.
 *
 * Anything the generator owns is stripped first; leaving the originals in
 * would give the page two titles and two descriptions, and a crawler picking
 * whichever came first would read the generic one every time.
 */
function pageHtml(template, page) {
  let html = template;
  html = html.replace(/\n\s*<title>[\s\S]*?<\/title>/g, "");
  html = html.replace(/\n\s*<meta\s+name="(description|robots|twitter:[a-z:]+)"[^>]*>/g, "");
  html = html.replace(/\n\s*<meta\s+property="og:[a-z:]+"[^>]*>/g, "");
  html = html.replace(/\n\s*<link\s+rel="canonical"[^>]*>/g, "");
  html = html.replace(/\n\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "");
  return html.replace("</head>", `  ${headFor(page)}\n  </head>`);
}

/* ── write everything ───────────────────────────────────────────────────── */

const template = await readFile(join(DIST, "index.html"), "utf8");
const today = new Date().toISOString().slice(0, 10);
const written = [];

for (const page of PAGES) {
  const html = pageHtml(template, page);
  if (page.path === "/") {
    await writeFile(join(DIST, "index.html"), html);
  } else {
    // `/plans/index.html` is what Vercel serves for `/plans`, and the
    // filesystem is checked before the SPA catch-all rewrite — so these win
    // for a crawler while the router still handles everything else.
    const dir = join(DIST, page.path.replace(/^\//, ""));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), html);
  }
  written.push(page.path);
}

/*
 * The SPA fallback gets its own shell, and it is `noindex`.
 *
 * Vercel rewrites every unmatched path to one file. If that file is
 * `index.html`, then a crawler asking for /dashboard, /spc, /raffles — all
 * thirty-nine gated routes — is handed the HOME PAGE's markup, complete with
 * the home page's title and a canonical pointing at "/". Thirty-nine URLs
 * returning the front page is the exact duplicate-content signature this whole
 * exercise exists to remove.
 *
 * So the catch-all points at `app.html` instead: same bundle, same app, but
 * marked `noindex, follow` and carrying no canonical of its own. The router
 * still renders the right page for a real visitor, and `useSeo` fills the head
 * in once React is running.
 */
const fallback = pageHtml(template, {
  path: "/app",
  title: `${SITE_NAME} — Severe Weather Intelligence`,
  description:
    "Live severe weather tracking for storm chasers, spotters and weather enthusiasts.",
  index: false,
}).replace(/\n\s*<link rel="canonical"[^>]*>/g, "");
/*
 * Written as `app/index.html`, NOT `app.html`.
 *
 * THE BUG THIS FIXES, and it was a total outage of the app's navigation.
 * `vercel.json` sets `cleanUrls: true`, which makes Vercel serve `app.html` at
 * `/app` and 308-REDIRECT `/app.html` to it. The catch-all rewrite pointed at
 * `/app.html`, a path that therefore no longer resolves to a file — so every
 * route without its own prerendered page returned Vercel's own 404. All
 * forty-seven of them. `/`, `/plans`, `/faq`, `/contact` and `/login` worked,
 * because those have real files; everything behind them — the dashboard, the
 * radar, the game, every module a subscriber pays for — did not, on direct
 * navigation, on refresh, and on every shared link.
 *
 * A directory index sidesteps the whole question: `/app` is served from
 * `app/index.html` whether cleanUrls is on or off, so the rewrite destination
 * cannot be transformed out from under it again.
 */
await mkdir(join(DIST, "app"), { recursive: true });
await writeFile(join(DIST, "app", "index.html"), fallback);

const indexable = PAGES.filter((p) => p.index);

await writeFile(join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n`
  + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
  + indexable.map((p) =>
      `  <url>\n    <loc>${canonical(p.path)}</loc>\n`
      + `    <lastmod>${today}</lastmod>\n`
      + `    <changefreq>${p.path === "/" ? "daily" : "weekly"}</changefreq>\n`
      + `    <priority>${p.path === "/" ? "1.0" : "0.8"}</priority>\n  </url>`).join("\n")
  + `\n</urlset>\n`);

/*
 * robots.txt closes the app to indexing on purpose.
 *
 * Thirty-nine gated routes all render a sign-in wall to a crawler. Indexed,
 * they are forty near-identical login pages competing with the four that are
 * worth finding, and they burn the crawl budget on a site that has very few
 * pages to spend it on. `Disallow` here plus `noindex, follow` in the app
 * keeps the links in them counting while keeping them out of results.
 */
const GATED = [
  "/dashboard", "/forecast", "/discussion", "/comparator", "/spc", "/thunder",
  "/hurricane", "/meso", "/ingredients", "/swti", "/timing", "/warnings", "/aqi",
  "/hazards", "/rivers", "/fire", "/summary", "/sswxcon", "/moon", "/aurora",
  "/rotation", "/climatology", "/history", "/wpi", "/duel", "/glossary", "/chasing",
  "/chases", "/raffles", "/flooding", "/winter", "/cameras", "/mosquito",
  "/lightning-globe", "/loyalty", "/trivia", "/game", "/profile", "/admin",
  "/subscription",
];

await writeFile(join(DIST, "robots.txt"),
  `# ${SITE_NAME}\n`
  + `User-agent: *\n`
  + `Allow: /$\n`
  + indexable.filter((p) => p.path !== "/").map((p) => `Allow: ${p.path}`).join("\n") + "\n"
  + `\n# Behind a sign-in wall — every one of these renders a login form to a\n`
  + `# crawler, so indexing them would bury the pages that are worth finding.\n`
  + GATED.map((p) => `Disallow: ${p}`).join("\n") + "\n"
  + `\nSitemap: ${SITE_URL}/sitemap.xml\n`);

/*
 * llms.txt — the same courtesy for assistants that robots.txt is for crawlers.
 *
 * When somebody asks an AI where to track a storm, what it can read about you
 * is what it can recommend. This is a short, plain description of what the
 * site is and which pages are open.
 */
await writeFile(join(DIST, "llms.txt"),
  `# ${SITE_NAME}\n\n`
  + `> Severe weather intelligence and live storm tracking for the United States, built for\n`
  + `> storm chasers, spotters and weather enthusiasts. Data comes from NOAA, the Storm\n`
  + `> Prediction Center, the National Weather Service, the National Hurricane Center and\n`
  + `> Open-Meteo. Not an official NWS product; always follow official warnings.\n\n`
  + `## Open pages\n\n`
  + indexable.map((p) => `- [${p.title}](${canonical(p.path)}): ${p.description}`).join("\n")
  + `\n\n## What the app does\n\n`
  + `- SPC convective outlooks, days 1 through 8, with the real risk polygons and SPC's conditional intensity tiers\n`
  + `- Live National Weather Service watches and warnings\n`
  + `- Hurricane and tropical tracking from the National Hurricane Center, with an archive\n`
  + `- Radar, GOES satellite and eight MRMS products including rainfall totals from one hour to three days\n`
  + `- Model maps rendered here from NOAA's own files: HRRR at 3 km, GFS, and HREF, a 21-member ensemble — 84 parameters, four cycles a day, with playback\n`
  + `- Live lightning from GOES-East's geostationary lightning mapper, plus LightningCast's probability of a flash in the next hour\n`
  + `- Daily storm-chase targets, scored inside the SPC risk areas on instability, shear, helicity, cloud base, cap and terrain\n`
  + `- A national storm-activity score, and a local severe threat index\n`
  + `- National outlooks in one place: WPC rainfall and HeatRisk, CPC 6-10 and 8-14 day, drought, and autumn foliage\n`
  + `- Winter Center: winter storm severity, snow on the ground, and hour-by-hour precipitation type\n`
  + `- Thunder-day climatology, 74 years of tornado climatology, and ten years of tornado tracks filterable by month, EF rating and state\n`
  + `- River and flood gauges, air quality and pollen, fire weather, and roughly 6,500 public traffic cameras\n`
  + `- Weather news from seven publishers, with the full text readable in the app where the publisher syndicates it\n`
  + `- A daily forecasting game and trivia, scored against real storm reports\n\n`
  + `## Note\n\n`
  + `Most modules require an account. The pages listed above are open to everyone.\n`);

console.log(
  `seo-build: ${written.length} pages (${written.join(", ")}), `
  + `${faqEntries.length} FAQ questions, app/ fallback, `
  + `sitemap with ${indexable.length} urls, robots.txt, llms.txt`);
