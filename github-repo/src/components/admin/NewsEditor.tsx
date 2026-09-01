import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter, AlignLeft, AlignRight, Baseline, Bold, Code, Eye, Heading1, Heading2,
  Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Maximize2, Minimize2, Minus,
  Pencil, Quote, Redo2, Strikethrough, Type, Undo2, X,
} from "lucide-react";
import {
  docToMarkdown, ScaleMark, SCALE_KEYS, TONE_KEYS, ToneMark, TREAT_KEYS, TreatMark,
} from "../../lib/newsDoc";
import { renderMarkdown } from "../../lib/markdown";

/**
 * The SSWX News writing surface.
 *
 * What you type is what the post looks like. It replaces a Markdown textarea,
 * which meant knowing the syntax before you could make a word bold, and meant
 * writing on a phone with a keyboard full of asterisks.
 *
 * Storage is still Markdown — see newsDoc.ts — so nothing already published
 * changes, and the feed keeps one renderer. The editor loads a post by running
 * it through that same renderer and parsing the result, which is what stops the
 * two ever disagreeing.
 *
 * Built for a phone first: one scrolling row of 38px targets, a style sheet
 * that slides down rather than a hover menu that a thumb cannot reach, and a
 * full-screen mode so the keyboard does not leave two lines of visible text.
 */

const TONE_SWATCH: Record<string, string> = {
  gold: "#d9b775", iris: "#ccccff", red: "#f87171", amber: "#fbbf24",
  green: "#34d399", cyan: "#67e8f9", violet: "#f0abfc", dim: "#8b90a8",
};
const SCALE_LABEL: Record<string, string> = { xs: "XS", sm: "S", lg: "L", xl: "XL", xxl: "2XL" };
const TREAT_LABEL: Record<string, string> = { mark: "Highlight", under: "Underline", caps: "Caps" };

export function NewsEditor({
  value, onChange, resetToken, placeholder,
}: {
  value: string;
  onChange: (md: string) => void;
  /** Changes whenever the post being edited is swapped out, so content reloads. */
  resetToken: string;
  placeholder?: string;
}) {
  const [sheet, setSheet] = useState(false);
  const [full, setFull] = useState(false);
  const [preview, setPreview] = useState(false);
  const emitted = useRef(value);

  const editor = useEditor({
    // Underline is switched off: it is a mark the Markdown subset cannot carry,
    // and a formatting button that silently loses its formatting on save is
    // worse than no button.
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, underline: false, link: { openOnClick: false } }),
      Image.configure({ inline: false, allowBase64: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ToneMark, ScaleMark, TreatMark,
    ],
    content: renderMarkdown(value),
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "sswx-editor outline-none min-h-[220px] px-3 py-3 text-sm",
        "data-placeholder": placeholder ?? "Start writing…",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const md = docToMarkdown(ed.getJSON());
      emitted.current = md;
      onChange(md);
    },
  }, []);

  // Reload only when the *post* changes. Re-setting content on every keystroke
  // would fight the cursor.
  useEffect(() => {
    if (!editor) return;
    if (value === emitted.current) return;
    emitted.current = value;
    editor.commands.setContent(renderMarkdown(value), { emitUpdate: false });
  }, [resetToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const words = useMemo(() => (value.trim() ? value.trim().replace(/[#*_>`~|{}[\]()-]/g, " ").split(/\s+/).filter(Boolean).length : 0), [value]);
  const readMin = Math.max(1, Math.round(words / 200));

  const promptLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (!url.trim()) { editor.chain().focus().unsetLink().run(); return; }
    if (!/^https?:\/\//i.test(url)) { alert("Links must start with http:// or https://"); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }, [editor]);

  const promptImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Image URL", "https://");
    if (!url || !/^https?:\/\//i.test(url)) return;
    const alt = window.prompt("Describe the image (for screen readers)", "") ?? "";
    editor.chain().focus().setImage({ src: url.trim(), alt }).run();
  }, [editor]);

  if (!editor) return <div className="h-[260px] rounded-lg bg-muted/20 border border-border animate-pulse" />;

  const btn = (active: boolean) =>
    `shrink-0 w-9 h-9 rounded-lg grid place-items-center border transition-colors ${
      active
        ? "bg-primary/20 border-primary/50 text-primary"
        : "bg-muted/40 border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
    }`;

  const Tool = ({ on, run, title, children }: { on?: boolean; run: () => void; title: string; children: React.ReactNode }) => (
    <button type="button" title={title} aria-label={title} aria-pressed={!!on} onClick={run} className={btn(!!on)}>
      {children}
    </button>
  );

  const toolbar = (
    <div className="border-b border-border bg-card/80 backdrop-blur-sm">
      <div
        className="flex items-center gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        // A soft right edge, so it is obvious on a phone that the row keeps going.
        style={{
          maskImage: "linear-gradient(90deg, #000 0, #000 calc(100% - 26px), transparent 100%)",
          WebkitMaskImage: "linear-gradient(90deg, #000 0, #000 calc(100% - 26px), transparent 100%)",
        }}
      >
        <Tool title="Undo" run={() => editor.chain().focus().undo().run()}><Undo2 className="w-4 h-4" /></Tool>
        <Tool title="Redo" run={() => editor.chain().focus().redo().run()}><Redo2 className="w-4 h-4" /></Tool>
        <Sep />
        <Tool title="Bold" on={editor.isActive("bold")} run={() => editor.chain().focus().toggleBold().run()}><Bold className="w-4 h-4" /></Tool>
        <Tool title="Italic" on={editor.isActive("italic")} run={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-4 h-4" /></Tool>
        <Tool title="Strikethrough" on={editor.isActive("strike")} run={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-4 h-4" /></Tool>
        <Tool title="Inline code" on={editor.isActive("code")} run={() => editor.chain().focus().toggleCode().run()}><Code className="w-4 h-4" /></Tool>
        <Sep />
        <Tool title="Big heading" on={editor.isActive("heading", { level: 1 })} run={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="w-4 h-4" /></Tool>
        <Tool title="Heading" on={editor.isActive("heading", { level: 2 })} run={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="w-4 h-4" /></Tool>
        <Tool title="Small heading" on={editor.isActive("heading", { level: 3 })} run={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="w-4 h-4" /></Tool>
        <Sep />
        <Tool title="Bullet list" on={editor.isActive("bulletList")} run={() => editor.chain().focus().toggleBulletList().run()}><List className="w-4 h-4" /></Tool>
        <Tool title="Numbered list" on={editor.isActive("orderedList")} run={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-4 h-4" /></Tool>
        <Tool title="Quote" on={editor.isActive("blockquote")} run={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="w-4 h-4" /></Tool>
        <Sep />
        <Tool title="Link" on={editor.isActive("link")} run={promptLink}><Link2 className="w-4 h-4" /></Tool>
        <Tool title="Insert an image" run={promptImage}><ImagePlus className="w-4 h-4" /></Tool>
        <Tool title="Divider" run={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="w-4 h-4" /></Tool>
        <Sep />
        <button
          type="button"
          onClick={() => setSheet((s) => !s)}
          className={`shrink-0 h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${
            sheet ? "bg-primary/20 border-primary/50 text-primary" : "bg-muted/40 border-border text-muted-foreground hover:border-primary/40"
          }`}
        >
          <Type className="w-3.5 h-3.5" /> Style
        </button>
      </div>

      {sheet && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-border/60 pt-2.5">
          <Row label="Colour">
            {TONE_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                title={k}
                onClick={() => editor.chain().focus().toggleMark("tone", { key: k }).run()}
                className={`w-7 h-7 rounded-full border-2 shrink-0 ${
                  editor.isActive("tone", { key: k }) ? "border-primary scale-110" : "border-border/70"
                } transition-transform`}
                style={{ background: TONE_SWATCH[k] }}
              />
            ))}
            <button
              type="button"
              title="Default colour"
              onClick={() => editor.chain().focus().unsetMark("tone").run()}
              className="w-7 h-7 rounded-full border-2 border-border/70 grid place-items-center shrink-0 text-muted-foreground"
            >
              <Baseline className="w-3.5 h-3.5" />
            </button>
          </Row>

          <Row label="Size">
            {SCALE_KEYS.map((k) => (
              <Chip key={k} on={editor.isActive("scale", { key: k })} onClick={() => editor.chain().focus().toggleMark("scale", { key: k }).run()}>
                {SCALE_LABEL[k]}
              </Chip>
            ))}
            <Chip on={false} onClick={() => editor.chain().focus().unsetMark("scale").run()}>Reset</Chip>
          </Row>

          <Row label="Effect">
            {TREAT_KEYS.map((k) => (
              <Chip key={k} on={editor.isActive("treat", { key: k })} onClick={() => editor.chain().focus().toggleMark("treat", { key: k }).run()}>
                {TREAT_LABEL[k]}
              </Chip>
            ))}
          </Row>

          <Row label="Align">
            <Chip on={editor.isActive({ textAlign: "left" }) || !editor.isActive({ textAlign: "center" }) && !editor.isActive({ textAlign: "right" })}
              onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="w-3.5 h-3.5" /></Chip>
            <Chip on={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="w-3.5 h-3.5" /></Chip>
            <Chip on={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="w-3.5 h-3.5" /></Chip>
          </Row>
        </div>
      )}
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
      <span>{words} words · ~{readMin} min read</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className={`h-7 px-2.5 rounded-md border text-[11px] font-medium flex items-center gap-1 ${
            preview ? "bg-primary/15 border-primary/40 text-primary" : "bg-muted/40 border-border hover:border-primary/40"
          }`}
        >
          {preview ? <><Pencil className="w-3 h-3" /> Write</> : <><Eye className="w-3 h-3" /> Preview</>}
        </button>
        <button
          type="button"
          onClick={() => setFull((f) => !f)}
          title={full ? "Leave full screen" : "Full screen"}
          className="h-7 w-7 rounded-md border border-border bg-muted/40 grid place-items-center hover:border-primary/40"
        >
          {full ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );

  const surface = preview ? (
    <div
      className="sswx-editor px-3 py-3 text-sm overflow-y-auto flex-1"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(value || "_Nothing written yet._") }}
    />
  ) : (
    <div className="flex-1 min-h-0 overflow-y-auto" onClick={() => editor.chain().focus().run()}>
      <EditorContent editor={editor} />
    </div>
  );

  if (full) {
    return (
      <div className="fixed inset-0 z-[70] bg-background flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Writing</span>
          <button type="button" onClick={() => setFull(false)} className="h-8 px-3 rounded-lg border border-border bg-muted/40 text-xs flex items-center gap-1.5">
            <X className="w-3.5 h-3.5" /> Done
          </button>
        </div>
        {toolbar}
        {surface}
        {footer}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/10 overflow-hidden flex flex-col">
      {toolbar}
      {surface}
      {footer}
    </div>
  );
}

function Sep() {
  return <span className="shrink-0 w-px h-5 bg-border mx-0.5" aria-hidden />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 h-7 px-2.5 rounded-md border text-[11px] font-semibold grid place-items-center ${
        on ? "bg-primary/20 border-primary/50 text-primary" : "bg-muted/40 border-border text-muted-foreground hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}

export default NewsEditor;
