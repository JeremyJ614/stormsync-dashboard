import { useEffect } from "react";

/**
 * Structured data for a page that knows its own content.
 *
 * The build writes Organization, WebSite and breadcrumb schema into every
 * public page's HTML, because those are the same on every render. This is for
 * schema that only exists once the data has loaded — the FAQ's sixty-one
 * questions live in the database, not in the source.
 *
 * The node is removed on unmount. Without that, navigating FAQ → Plans → FAQ
 * would leave three copies in the head, and a page describing itself three
 * times is a page a validator rejects.
 */
export function JsonLd({ id, data }: { id: string; data: unknown }) {
  useEffect(() => {
    if (!data) return;
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = `ld-${id}`;
    el.textContent = JSON.stringify(data);
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [id, data]);
  return null;
}
