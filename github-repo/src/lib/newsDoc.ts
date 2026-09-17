/**
 * The bridge between the news editor and what a news post actually is.
 *
 * Posts are stored as Markdown and always have been, so every post written
 * before the editor existed still renders, and the feed keeps exactly one
 * renderer (`renderMarkdown`). The editor is therefore a view onto Markdown,
 * not a replacement for it:
 *
 *   reading   markdown → renderMarkdown() → HTML → TipTap parses it
 *   writing   TipTap JSON → docToMarkdown() → markdown
 *
 * Going in through `renderMarkdown` is deliberate. It means the editor cannot
 * drift from the feed: what an admin is looking at is literally the output the
 * member will get, parsed back into an editable document.
 *
 * The three style marks below exist because Markdown has no way to say "gold"
 * or "bigger". They serialise to the `{key|text}` extension documented in
 * markdown.ts, which is a closed vocabulary — an author can never emit markup.
 */
import { Mark, mergeAttributes } from "@tiptap/core";
import type { JSONContent } from "@tiptap/react";
import { STYLE_CLASS } from "./markdown";

export const TONE_KEYS = ["gold", "iris", "red", "amber", "green", "cyan", "violet", "dim"] as const;
export const SCALE_KEYS = ["xs", "sm", "lg", "xl", "xxl"] as const;
export const TREAT_KEYS = ["mark", "under", "caps"] as const;

/** Canonical emission order, so the same document always serialises the same. */
const GROUPS: readonly (readonly string[])[] = [TONE_KEYS, SCALE_KEYS, TREAT_KEYS];

/**
 * One mark type per group rather than one for all of them: ProseMirror will not
 * hold two marks of the same type on one range, and gold + large + highlight has
 * to be expressible.
 */
function styleMark(name: string, keys: readonly string[]) {
  return Mark.create({
    name,
    addAttributes: () => ({ key: { default: null } }),
    parseHTML: () => [
      {
        tag: "span[data-ss]",
        getAttrs: (el) => {
          const raw = (el as HTMLElement).getAttribute("data-ss") ?? "";
          const hit = raw.split(/\s+/).find((k) => keys.includes(k));
          return hit ? { key: hit } : false;
        },
      },
    ],
    renderHTML: ({ HTMLAttributes }) => {
      const key = String(HTMLAttributes.key ?? "");
      return [
        "span",
        mergeAttributes({ "data-ss": key, class: STYLE_CLASS[key] ?? "" }),
        0,
      ];
    },
  });
}

export const ToneMark = styleMark("tone", TONE_KEYS);
export const ScaleMark = styleMark("scale", SCALE_KEYS);
export const TreatMark = styleMark("treat", TREAT_KEYS);
export const STYLE_MARK_NAMES = ["tone", "scale", "treat"] as const;

// ── serialiser ───────────────────────────────────────────────────────────────

interface Mk { type: string; attrs?: Record<string, unknown> }

/** The style keys on a node, in canonical order, so `{gold+xl|…}` is stable. */
function styleKeys(node: JSONContent): string[] {
  const marks = (node.marks ?? []) as Mk[];
  const keys: string[] = [];
  for (const group of GROUPS) {
    const m = marks.find((x) => STYLE_MARK_NAMES.includes(x.type as never) && group.includes(String(x.attrs?.key)));
    if (m) keys.push(String(m.attrs?.key));
  }
  return keys;
}

/** Inline text plus its character formats. Styling is applied by the caller. */
function textOut(node: JSONContent): string {
  let t = node.text ?? "";
  if (!t) return "";
  const marks = (node.marks ?? []) as Mk[];
  const has = (n: string) => marks.find((m) => m.type === n);

  // Innermost outwards. Code first so its contents stay literal.
  if (has("code")) t = `\`${t}\``;
  if (has("bold")) t = `**${t}**`;
  if (has("italic")) t = `*${t}*`;
  if (has("strike")) t = `~~${t}~~`;
  const link = has("link");
  if (link) {
    const href = String((link.attrs as { href?: string } | undefined)?.href ?? "");
    if (/^https?:\/\//.test(href)) t = `[${t}](${href})`;
  }
  return t;
}

function oneInline(n: JSONContent): string {
  if (n.type === "text") return textOut(n);
  if (n.type === "hardBreak") return "\n";
  if (n.type === "image") {
    const a = (n.attrs ?? {}) as { src?: string; alt?: string };
    return a.src ? `![${a.alt ?? ""}](${a.src})` : "";
  }
  return inlineOut(n.content);
}

/**
 * Consecutive nodes carrying the same styling share one `{…|…}` wrapper. A
 * coloured sentence with a link in the middle is three text nodes in the
 * document but one run of colour to a reader, and should be written that way.
 */
function inlineOut(nodes: JSONContent[] | undefined): string {
  let out = "";
  let runKeys = "";
  let run = "";
  const flush = () => {
    if (!run) { runKeys = ""; return; }
    out += runKeys ? `{${runKeys}|${run}}` : run;
    run = ""; runKeys = "";
  };
  for (const n of nodes ?? []) {
    const keys = styleKeys(n).join("+");
    if (keys !== runKeys) flush();
    runKeys = keys;
    run += oneInline(n);
  }
  flush();
  return out;
}

function alignPrefix(node: JSONContent): string {
  const a = (node.attrs as { textAlign?: string } | undefined)?.textAlign;
  return a === "center" || a === "right" ? `::${a} ` : "";
}

/** List items, flattened — the renderer has no nested-list syntax to target. */
function listOut(node: JSONContent, ordered: boolean): string[] {
  const rows: string[] = [];
  let n = 1;
  for (const item of node.content ?? []) {
    for (const child of item.content ?? []) {
      if (child.type === "bulletList" || child.type === "orderedList") {
        rows.push(...listOut(child, child.type === "orderedList"));
        continue;
      }
      const body = inlineOut(child.content).trim();
      if (!body) continue;
      rows.push(ordered ? `${n++}. ${body}` : `- ${body}`);
    }
  }
  return rows;
}

function blockOut(node: JSONContent): string {
  switch (node.type) {
    case "heading": {
      const lvl = Math.min(3, Math.max(1, Number((node.attrs as { level?: number } | undefined)?.level ?? 2)));
      return `${alignPrefix(node)}${"#".repeat(lvl)} ${inlineOut(node.content).trim()}`;
    }
    case "bulletList":
      return listOut(node, false).join("\n");
    case "orderedList":
      return listOut(node, true).join("\n");
    case "blockquote":
      return (node.content ?? [])
        .map((c) => `> ${inlineOut(c.content).trim()}`)
        .filter((l) => l !== "> ")
        .join("\n");
    case "codeBlock":
      return "```\n" + inlineOut(node.content) + "\n```";
    case "horizontalRule":
      return "---";
    case "image": {
      const a = (node.attrs ?? {}) as { src?: string; alt?: string };
      return a.src ? `![${a.alt ?? ""}](${a.src})` : "";
    }
    case "paragraph":
    default: {
      const body = inlineOut(node.content).trim();
      return body ? `${alignPrefix(node)}${body}` : "";
    }
  }
}

/** A TipTap document as the Markdown that gets stored. */
export function docToMarkdown(doc: JSONContent): string {
  return (doc.content ?? [])
    .map(blockOut)
    .filter((b) => b !== "")
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
