/**
 * What each page tells a search engine and a link preview.
 *
 * The app served ONE title and ONE description for all forty-seven routes,
 * because a Vite SPA sends the same `index.html` for every URL. Google saw
 * "StormSync Media — VIP Forecast Group" forty-seven times and treated it as
 * one page with forty-six duplicates. Nothing linked to StormSync anywhere
 * ever showed a picture, because `opengraph.jpg` existed in `public/` and was
 * never referenced by a single tag.
 *
 * Two things use this table.
 *
 * At BUILD time, `scripts/seo-build.mjs` writes a real HTML file per public
 * route with these values baked into the head. That is the only version social
 * crawlers ever see — Facebook, X, Discord, iMessage and Slack do not run
 * JavaScript, so a title set by React is a title they will never read.
 *
 * At RUN time, `useSeo` applies the same values on client-side navigation, so
 * the tab, the history entry and a bookmark are right, and so Google's renderer
 * agrees with the HTML it was served.
 *
 * ONLY PUBLIC PAGES BELONG HERE. The thirty-nine gated routes are excluded
 * deliberately: they all render a sign-in wall to a crawler, so indexing them
 * would spend the crawl budget on forty near-identical pages and teach Google
 * that most of the site is a login form.
 */

export const SITE_URL = "https://vip.sswx.space";
export const SITE_NAME = "StormSync Media";
export const OG_IMAGE = `${SITE_URL}/opengraph.jpg`;

export interface PageSeo {
  path: string;
  title: string;
  description: string;
  /** Left off a page that should be reachable but not ranked. */
  index?: boolean;
}

/**
 * Titles are written to be READ IN A RESULT LIST, not to stuff keywords.
 * Each one says what the page is and who it is for, and each is different from
 * the others — two pages with the same title compete with each other.
 */
export const PAGES: PageSeo[] = [
  {
    path: "/",
    title: "StormSync Media — Severe Weather Intelligence for Storm Chasers",
    description:
      "Live severe weather tracking built for people who take storms seriously: SPC outlooks, "
      + "real-time warnings, HRRR, GFS and HREF ensemble model maps, radar and MRMS, live "
      + "lightning, daily chase targets and a national storm score — from NOAA and the "
      + "National Weather Service.",
    index: true,
  },
  {
    path: "/plans",
    title: "Plans & Pricing — StormSync Media",
    description:
      "Start free and add only the modules you want. Four tiers, month-to-month or yearly, with "
      + "lifetime options. Every plan reads from the same live NOAA, SPC and NWS feeds.",
    index: true,
  },
  {
    path: "/faq",
    title: "Frequently Asked Questions — StormSync Media",
    description:
      "How StormSync works, where the data comes from, what each module does, how billing and "
      + "cancellation work, and what the app can and cannot tell you about your own area.",
    index: true,
  },
  {
    path: "/contact",
    title: "Contact StormSync Media",
    description:
      "Get in touch with the StormSync team about membership, billing, a module request, or a "
      + "problem with the app.",
    index: true,
  },
  {
    path: "/login",
    title: "Sign in — StormSync Media",
    description: "Sign in to your StormSync Media account.",
    // Reachable, not ranked. A sign-in form has nothing to offer a searcher,
    // and letting it compete for the brand name pushes the real pages down.
    index: false,
  },
];

export const pageSeo = (path: string): PageSeo | undefined =>
  PAGES.find((p) => p.path === path);

/** Absolute, no trailing slash except the root — one URL per page, always. */
export function canonical(path: string): string {
  if (path === "/") return `${SITE_URL}/`;
  return SITE_URL + path.replace(/\/+$/, "");
}

/* ── structured data ───────────────────────────────────────────────────────
 *
 * Written by hand rather than by a library so every claim in it is one this
 * app can actually keep. Schema that overstates — a rating nobody left, an
 * event that is not scheduled — is worse than none: it is the kind of thing
 * that gets rich results revoked for a whole domain.
 */

export function organizationSchema() {
  return {
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
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "en-US",
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
}

/**
 * The app itself, as a product.
 *
 * `offers` carries the real tier prices. They are the shipped defaults, which
 * are what is in force — there is no pricing override configured — and the
 * lowest is zero because the free tier is genuinely free rather than a trial.
 */
export function appSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: "WeatherApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires a modern browser with JavaScript enabled.",
    description:
      "Live severe weather tracking: SPC convective outlooks, National Weather Service warnings, "
      + "HRRR, GFS and HREF ensemble model maps rendered from NOAA's own files, radar and MRMS, "
      + "GOES lightning, hurricane and tropical tracking, daily storm-chase targets, tornado "
      + "climatology and a national storm-activity score.",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: "Basic", price: "2.99", priceCurrency: "USD" },
      { "@type": "Offer", name: "VIP", price: "4.99", priceCurrency: "USD" },
      { "@type": "Offer", name: "Advanced", price: "7.99", priceCurrency: "USD" },
    ],
  };
}

export function breadcrumbSchema(path: string, label: string) {
  const items = [{ "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` }];
  if (path !== "/") {
    items.push({ "@type": "ListItem", position: 2, name: label, item: canonical(path) });
  }
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items };
}

/** FAQPage, built from real questions. Google will not show it otherwise. */
export function faqSchema(entries: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((e) => ({
      "@type": "Question",
      name: e.q,
      acceptedAnswer: { "@type": "Answer", text: e.a },
    })),
  };
}
