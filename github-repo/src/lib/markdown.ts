/**
 * Minimal, XSS-safe Markdown for SSWX News bodies (U-25, extended P-18). HTML is
 * escaped first, then a small, well-known subset is applied: headings, bold,
 * italic, strikethrough, inline code, fenced code blocks, links, inline images,
 * bullet & numbered lists, blockquotes, horizontal rules, and paragraphs.
 * Intentionally not a full Markdown engine — just enough to make posts read
 * nicely and safely.
 */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(t: string): string {
  return t
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
    const line = raw.trim();
    // Fenced code block — collect verbatim until the closing fence.
    if (line.startsWith("```")) {
      if (inCode) { flushCode(); inCode = false; } else { closeList(); closeQuote(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }
    if (!line) { closeList(); closeQuote(); continue; }
    let m: RegExpMatchArray | null;
    if (/^(---|\*\*\*|___)$/.test(line)) { closeList(); closeQuote(); out.push('<hr class="border-border my-3" />'); continue; }
    if ((m = line.match(/^###\s+(.*)/))) { closeList(); closeQuote(); out.push(`<h3 class="text-base font-bold mt-3 mb-1">${inline(m[1])}</h3>`); continue; }
    if ((m = line.match(/^##\s+(.*)/))) { closeList(); closeQuote(); out.push(`<h2 class="text-lg font-bold mt-3 mb-1">${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^#\s+(.*)/))) { closeList(); closeQuote(); out.push(`<h1 class="text-xl font-bold mt-3 mb-1">${inline(m[1])}</h1>`); continue; }
    if ((m = line.match(/^\d+\.\s+(.*)/))) { closeQuote(); if (inList) { out.push("</ul>"); inList = false; } if (!inOrdered) { out.push('<ol class="list-decimal pl-5 space-y-1 my-1">'); inOrdered = true; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^[-*]\s+(.*)/))) { closeQuote(); if (inOrdered) { out.push("</ol>"); inOrdered = false; } if (!inList) { out.push('<ul class="list-disc pl-5 space-y-1 my-1">'); inList = true; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^>\s+(.*)/))) { closeList(); if (!inQuote) { out.push('<blockquote class="border-l-2 border-primary/50 pl-3 italic text-muted-foreground my-1">'); inQuote = true; } out.push(`<p>${inline(m[1])}</p>`); continue; }
    closeList(); closeQuote();
    out.push(`<p class="leading-relaxed">${inline(line)}</p>`);
  }
  if (inCode && codeBuf.length) flushCode();
  closeList(); closeQuote();
  return out.join("\n");
}
