/**
 * Minimal, XSS-safe Markdown for SSWX News bodies (U-25). HTML is escaped first,
 * then a small, well-known subset is applied: headings, bold, italic, inline
 * code, links, bullet lists, blockquotes, and paragraphs. Intentionally not a
 * full Markdown engine — just enough to make posts read nicely and safely.
 */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(t: string): string {
  return t
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-muted/40 text-[0.85em]">$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>');
}

export function renderMarkdown(src: string): string {
  const lines = esc(src).split(/\r?\n/);
  const out: string[] = [];
  let inList = false, inQuote = false;
  const closeList = () => { if (inList) { out.push("</ul>"); inList = false; } };
  const closeQuote = () => { if (inQuote) { out.push("</blockquote>"); inQuote = false; } };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); closeQuote(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^###\s+(.*)/))) { closeList(); closeQuote(); out.push(`<h3 class="text-base font-bold mt-3 mb-1">${inline(m[1])}</h3>`); continue; }
    if ((m = line.match(/^##\s+(.*)/))) { closeList(); closeQuote(); out.push(`<h2 class="text-lg font-bold mt-3 mb-1">${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^#\s+(.*)/))) { closeList(); closeQuote(); out.push(`<h1 class="text-xl font-bold mt-3 mb-1">${inline(m[1])}</h1>`); continue; }
    if ((m = line.match(/^[-*]\s+(.*)/))) { closeQuote(); if (!inList) { out.push('<ul class="list-disc pl-5 space-y-1 my-1">'); inList = true; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^>\s+(.*)/))) { closeList(); if (!inQuote) { out.push('<blockquote class="border-l-2 border-primary/50 pl-3 italic text-muted-foreground my-1">'); inQuote = true; } out.push(`<p>${inline(m[1])}</p>`); continue; }
    closeList(); closeQuote();
    out.push(`<p class="leading-relaxed">${inline(line)}</p>`);
  }
  closeList(); closeQuote();
  return out.join("\n");
}
