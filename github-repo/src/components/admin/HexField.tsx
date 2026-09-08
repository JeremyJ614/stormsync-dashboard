import { useEffect, useRef, useState } from "react";

/**
 * A hex box you can actually type into.
 *
 * The obvious version is a controlled input whose `value` is the colour and
 * whose `onChange` commits only when the string parses. That version cannot be
 * typed into AT ALL, and it is what shipped: to reach `#4FFFB0` you must pass
 * through `#`, `#4`, `#4F` and so on, none of which parse, so nothing is
 * committed, so `value` never changes, so every keystroke is thrown away and
 * the box snaps back to what it held before. It looks like the field is
 * refusing input, because it is.
 *
 * Worse, in the map-colour card the non-parsing branch DELETED the override.
 * So typing a colour did not merely fail — it cleared the entry, and Save then
 * wrote the empty result. That is why the stored palette was `{"colors": {}}`
 * after an evening of changing colours.
 *
 * The fix is to separate what is being typed from what has been decided. This
 * keeps its own text while focused and commits upward only when the text is a
 * whole colour; on blur it either keeps what it committed or snaps back to the
 * authoritative value, so the box can never be left showing something that is
 * not the real colour.
 */
export function HexField({
  value, onCommit, ariaLabel, className,
}: {
  value: string;
  onCommit: (hex: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [text, setText] = useState(value.toUpperCase());
  const focused = useRef(false);

  // Follow the outside world, but never while somebody is mid-word: the colour
  // picker and the reset button both change `value`, and a swatch reset should
  // update the box — a keystroke should not fight it.
  useEffect(() => {
    if (!focused.current) setText(value.toUpperCase());
  }, [value]);

  /**
   * Committed on every keystroke, but only from a whole six-digit value.
   *
   * Shorthand is deliberately NOT accepted mid-word. `#4FFFB0` passes through
   * `#4FF` on its way in, which is a valid three-digit colour — so accepting
   * shorthand as you type makes the map flash cyan halfway through somebody
   * typing mint green. Pasting `#4fb` still works: blur and Enter take it.
   */
  function handle(raw: string) {
    setText(raw);
    const hex = parseHex(raw, { shorthand: false });
    if (hex) onCommit(hex);
  }

  function commitFinal() {
    const hex = parseHex(text);
    if (hex) onCommit(hex);
    return hex;
  }

  return (
    <input
      value={text}
      spellCheck={false}
      autoComplete="off"
      aria-label={ariaLabel}
      onFocus={(e) => { focused.current = true; e.currentTarget.select(); }}
      onBlur={() => {
        focused.current = false;
        // Last chance for a shorthand value, then show the colour that is
        // actually set — the box can never be left displaying something the
        // map is not painting.
        const hex = commitFinal();
        setText((hex ?? value).toUpperCase());
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      onChange={(e) => handle(e.target.value)}
      className={className ??
        "w-[92px] bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-[11px] font-mono uppercase outline-none focus:border-primary/40"}
    />
  );
}

/**
 * `#4FFFB0`, `4fffb0`, `#4FB` and `4fb` all mean a colour; anything else means
 * the person is still typing. Shorthand is expanded because a three-digit hex
 * is a real thing people paste, and rejecting it would look like another field
 * that refuses input — but `shorthand: false` turns it off for the
 * keystroke-by-keystroke path, where a three-digit read of a half-typed
 * six-digit colour is always wrong.
 */
export function parseHex(raw: string, opts?: { shorthand?: boolean }): string | null {
  const s = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toUpperCase()}`;
  if (opts?.shorthand !== false && /^[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s.split("").map((c) => c + c).join("").toUpperCase()}`;
  }
  return null;
}
