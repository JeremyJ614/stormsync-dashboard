/**
 * Minimal, XSS-safe Markdown for SSWX News bodies.
 *
 * HTML is escaped first, then a small, well-known subset is applied: headings,
 * bold, italic, strikethrough, inline code, fenced code blocks, links, inline
 * images, bullet & numbered lists, blockquotes, horizontal rules, paragraphs —
 * and one extension of our own, below. Intentionally not a full Markdown
 * engine: just enough to make posts read nicely, and nothing that can put
 * author-supplied markup into the page.
 *
 * ── The styling extension ────────────────────────────────────────────────────
 * Markdown has no way to say "make this gold" or "make this bigger", which is
 * the first thing anyone writing a post wants. Rather than let the editor emit
 * raw HTML — which would mean writing and trusting a sanitiser — a post can
 * carry `{key|text}`, or `{key+key|text}` to combine them, where each key comes
 * from a fixed list defined here. The keys select classes from STYLE_CLASS;
 * nothing an author types ever reaches the DOM as markup or CSS. An
 * unrecognised key is left alone as literal text.
 *
 * Each rendered span also carries `data-ss="gold"`. That is what lets the
 * editor read a post back: it parses this very output, so what an admin edits
 * is by construction what a member will see.
 *
 * Lines may also start with `::center ` or `::right ` to align a paragraph.
 *
 * Nobody has to type any of this: the news editor writes it, and reads it back.
 */

/** The complete styling vocabulary. Adding a key here adds it to the editor. */
export const STYLE_CLASS: Record<string, string> = {
  // colour
  gold: "text-[#d9b775]",
  iris: "text-[#ccccff]",
  red: "text-red-400",
  amber: "text-amber-400",
  green: "text-emerald-400",
  cyan: "text-cyan-300",
  violet: "text-fuchsia-300",
  dim: "text-muted-foreground",
  // size
  xs: "text-[0.75em]",
  sm: "text-[0.875em]",
  lg: "text-[1.2em]",
  xl: "text-[1.45em] font-semibold",
  xxl: "text-[1.8em] font-bold leading-tight",
  // treatment
  mark: "bg-[#d9b775]/20 text-[#f1e4c6] rounded px-1",
  under: "underline underline-offset-4 decoration-[#d9b775]/60",
  caps: "uppercase tracking-[0.18em]",
};

/** Paragraph alignment, written as a `::key ` prefix on the line. */
const ALIGN_CLASS: Record<string, string> = {
  center: "text-center",
  right: "text-right",
};

export const STYLE_KEYS = Object.keys(STYLE_CLASS);
const KEY_ALT = STYLE_KEYS.join("|");
const STYLE_RE = new RegExp(`\\{((?:${KEY_ALT})(?:\\+(?:${KEY_ALT}))*)\\|([^{}]+)\\}`, "g");

/**
 * `<` and `&` go first, which is what stops author text becoming markup, and
 * `"` goes with them: the link and image rules interpolate a captured URL into
 * a quoted attribute, so an unescaped quote there would let a post close the
 * attribute and open an event handler.
 *
 * `>` is deliberately left alone. With `<` escaped it cannot start a tag, and
 * escaping it broke blockquotes outright — the `>` marker was already `&gt;`
 * by the time the line parser looked at it, so `> quoted` has been rendering
 * as literal text since this file was written.
 */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function inline(t: string): string {
  return t
    // Styling runs first so its contents still get the rest of the treatment:
    // `{gold|**loud**}` should be gold *and* bold.
    .replace(STYLE_RE, (_m, keys: string, body: string) => {
      // One span per key, nested. A single span carrying all of them would be
      // tidier HTML, but the editor's parser matches one rule per element, so
      // `{gold+xl|…}` would come back gold and nothing else.
      let html = body;
      const ks = keys.split("+");
      for (let i = ks.length - 1; i >= 0; i--) html = `<span data-ss="${ks[i]}" class="${STYLE_CLASS[ks[i]]}">${html}</span>`;
      return html;
    })
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" class="rounded-lg border border-border my-2 max-w-full h-auto" loading="lazy" />')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-muted/40 text-[0.85em]">$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>');
}

export function renderMarkdown(src: string): string {
  const lines = esc(src).split(/\r?\n/);
  const out: string[] = [];
  let inList = false, inOrdered = false, inQuote = false, inCode = false;
  const codeBuf: string[] = [];
  const closeList = () => { if (inList) { out.push("</ul>"); inList = false; } if (inOrdered) { out.push("</ol>"); inOrdered = false; } };
  const closeQuote = () => { if (inQuote) { out.push("</blockquote>"); inQuote = false; } };
  const flushCode = () => { out.push(`<pre class="bg-black/50 border border-border rounded-lg p-3 overflow-x-auto text-xs my-2"><code>${codeBuf.join("\n")}</code></pre>`); codeBuf.length = 0; };

  for (const raw of lines) {
    let line = raw.trim();
    // Fenced code block — collect verbatim until the closing fence.
    if (line.startsWith("```")) {
      if (inCode) { flushCode(); inCode = false; } else { closeList(); closeQuote(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }
    if (!line) { closeList(); closeQuote(); continue; }

    // `::center ` / `::right ` prefix, stripped before anything else looks at
    // the line so an aligned heading or list item still works.
    let align = "", alignAttr = "";
    const am = line.match(/^::(center|right)\s+(.*)$/);
    if (am) {
      align = ALIGN_CLASS[am[1]];
      alignAttr = ` style="text-align:${am[1]}"`;
      line = am[2].trim();
      if (!line) continue;
    }
    const cls = (base: string) => (align ? `${base} ${align}` : base);

    let m: RegExpMatchArray | null;
    if (/^(---|\*\*\*|___)$/.test(line)) { closeList(); closeQuote(); out.push('<hr class="border-border my-3" />'); continue; }
    if ((m = line.match(/^###\s+(.*)/))) { closeList(); closeQuote(); out.push(`<h3${alignAttr} class="${cls("text-base font-bold mt-3 mb-1")}">${inline(m[1])}</h3>`); continue; }
    if ((m = line.match(/^##\s+(.*)/))) { closeList(); closeQuote(); out.push(`<h2${alignAttr} class="${cls("text-lg font-bold mt-3 mb-1")}">${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^#\s+(.*)/))) { closeList(); closeQuote(); out.push(`<h1${alignAttr} class="${cls("text-xl font-bold mt-3 mb-1")}">${inline(m[1])}</h1>`); continue; }
    if ((m = line.match(/^\d+\.\s+(.*)/))) { closeQuote(); if (inList) { out.push("</ul>"); inList = false; } if (!inOrdered) { out.push('<ol class="list-decimal pl-5 space-y-1 my-1">'); inOrdered = true; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^[-*]\s+(.*)/))) { closeQuote(); if (inOrdered) { out.push("</ol>"); inOrdered = false; } if (!inList) { out.push('<ul class="list-disc pl-5 space-y-1 my-1">'); inList = true; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^>\s+(.*)/))) { closeList(); if (!inQuote) { out.push('<blockquote class="border-l-2 border-primary/50 pl-3 italic text-muted-foreground my-1">'); inQuote = true; } out.push(`<p>${inline(m[1])}</p>`); continue; }
    closeList(); closeQuote();
    out.push(`<p${alignAttr} class="${cls("leading-relaxed")}">${inline(line)}</p>`);
  }
  if (inCode && codeBuf.length) flushCode();
  closeList(); closeQuote();
  return out.join("\n");
}
