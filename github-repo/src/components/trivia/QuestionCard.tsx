/**
 * One question, and the moment it is answered.
 *
 * WHAT WAS WRONG WITH THE LAST ONE
 * The choices were `bg-muted/20` rectangles that swapped to `bg-green-500/15`
 * or `bg-red-500/15` on reveal, and the explanation landed in a third coloured
 * rectangle underneath. Three saturated blocks on a champagne and periwinkle
 * page, in colours borrowed from nothing else in the app — and the whole
 * transition happened instantly, so the one interesting second in the module
 * (finding out) had no moment to it at all.
 *
 * WHAT THIS IS
 * A card that is closed until you commit, then opens.
 *
 * Committing is deliberately physical: the row presses, the letter medallion
 * fills, and a single champagne sweep runs across the row that was right. One
 * pass, no loop — an answer reveals once. The wrong pick is not shouted at;
 * it dims and takes a small marker, because a member who guessed wrong already
 * knows, and a red rectangle is just the app being rude about it.
 *
 * Correct is champagne, the page's own accent, rather than green. The marker
 * glyphs carry the semantics — a check and a cross — so the result is legible
 * without relying on colour at all.
 */
import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X, CloudLightning, Sparkles, Loader2 } from "lucide-react";
import { ROYAL, HEADING, EASE, SPRING } from "../../lib/royal";
import type { TriviaQuestion } from "../../lib/trivia";

const WRONG = "#e88a6e";

interface Props {
  q: TriviaQuestion;
  /** 1-based, shown as the card's index. */
  index: number;
  /** The choice this member picked, or null while the question is open. */
  picked: number | null;
  /** Revealed only after answering — the server does not send it before. */
  correctIndex: number;
  points: number | null;
  explanation: string | null;
  busy: boolean;
  locked: boolean;
  still: boolean;
  onPick: (index: number) => void;
}

export const QuestionCard = memo(function QuestionCard({
  q, index, picked, correctIndex, points, explanation, busy, locked, still, onPick,
}: Props) {
  const revealed = picked !== null;
  const weather = q.category === "weather";
  const Sigil = weather ? CloudLightning : Sparkles;
  const sigilColor = weather ? ROYAL.gold : ROYAL.iris;
  const gotIt = revealed && picked === correctIndex;

  return (
    <motion.article
      initial={still ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: still ? 0.2 : 0.5, delay: still ? 0 : 0.06 * index, ease: EASE }}
      className="relative rounded-2xl overflow-hidden"
      style={{
        border: `1px solid ${revealed && gotIt ? ROYAL.goldSoft : ROYAL.hairline}`,
        background: `linear-gradient(180deg, rgba(18,18,34,0.72), rgba(10,10,22,0.72))`,
        boxShadow: "0 20px 44px -30px rgba(0,0,0,0.95)",
      }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

      <header className="px-4 py-3 flex items-center gap-2.5 border-b" style={{ borderColor: ROYAL.hairline }}>
        <span className="tabular-nums text-[11px] font-semibold" style={{ color: ROYAL.dim }}>
          {String(index).padStart(2, "0")}
        </span>
        <Sigil className="w-4 h-4 shrink-0" style={{ color: sigilColor }} />
        <span className="text-[10px] uppercase tracking-[0.28em] font-semibold" style={{ color: ROYAL.dim }}>
          {weather ? "Weather" : "Random"}
        </span>
        <span className="ml-auto text-[11px] tabular-nums" style={{ color: ROYAL.dim }}>
          {q.points} pts
        </span>
      </header>

      <div className="p-4 space-y-3.5">
        <p className="text-[15px] leading-relaxed font-medium"
           style={{ fontFamily: HEADING, color: ROYAL.text }}>
          {q.question}
        </p>

        <div className="space-y-2" role="group" aria-label="Answer choices">
          {q.choices.map((choice, i) => (
            <Choice
              key={i}
              letter={String.fromCharCode(65 + i)}
              text={choice}
              state={
                !revealed ? "open"
                  : i === correctIndex ? "right"
                  : i === picked ? "wrong"
                  : "spent"
              }
              disabled={revealed || busy || locked}
              still={still}
              onPick={() => onPick(i)}
            />
          ))}
        </div>

        <AnimatePresence initial={false}>
          {busy && (
            <motion.div key="busy"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-[11px]" style={{ color: ROYAL.dim }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…
            </motion.div>
          )}

          {revealed && (
            <motion.div key="verdict"
              initial={still ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: still ? 0.2 : 0.42, ease: EASE }}
              className="overflow-hidden">
              <div className="pt-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold"
                        style={{ fontFamily: HEADING, color: gotIt ? ROYAL.gold : ROYAL.text }}>
                    {gotIt ? "Correct" : "Not this time"}
                  </span>
                  {gotIt && points ? (
                    <span className="text-xs tabular-nums" style={{ color: ROYAL.gold }}>+{points}</span>
                  ) : null}
                </div>
                {explanation && (
                  <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: ROYAL.dim }}>
                    {explanation}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
});

type ChoiceState = "open" | "right" | "wrong" | "spent";

function Choice({
  letter, text, state, disabled, still, onPick,
}: {
  letter: string; text: string; state: ChoiceState;
  disabled: boolean; still: boolean; onPick: () => void;
}) {
  const right = state === "right";
  const wrong = state === "wrong";
  const open = state === "open";

  return (
    <motion.button
      type="button"
      onClick={onPick}
      disabled={disabled}
      // Hover and press exist only while the row can still be chosen. A
      // revealed row that lifts under the cursor is telling you it is still a
      // choice, which it is not — and that was the old version's quietest
      // failure: nothing on the page ever indicated the answers were clickable
      // in the first place.
      whileHover={open && !disabled && !still ? { y: -1 } : undefined}
      whileTap={open && !disabled && !still ? { scale: 0.985 } : undefined}
      transition={SPRING.pop}
      className={`sx-choice relative w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-3
                  overflow-hidden disabled:cursor-default transition-colors
                  ${open && !disabled ? "sx-choice-open cursor-pointer" : ""}`}
      style={{
        border: `1px solid ${right ? ROYAL.goldSoft : wrong ? "rgba(232,138,110,0.45)" : ROYAL.hairline}`,
        background: right ? "rgba(217,183,117,0.10)" : "rgba(255,255,255,0.02)",
        color: state === "spent" ? ROYAL.dim : ROYAL.text,
        opacity: state === "spent" ? 0.55 : 1,
      }}
    >
      {/* The reveal. One pass across the row that was right, then gone. */}
      {right && !still && (
        <motion.span
          aria-hidden
          className="absolute inset-y-0 w-1/3 pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldFaint}, transparent)` }}
          initial={{ x: "-120%" }}
          animate={{ x: "420%" }}
          transition={{ duration: 0.85, ease: EASE }}
        />
      )}

      <span
        className="relative grid place-items-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0"
        style={{
          border: `1px solid ${right ? ROYAL.gold : wrong ? WRONG : ROYAL.hairline}`,
          background: right ? ROYAL.gold : "transparent",
          color: right ? ROYAL.ink : wrong ? WRONG : ROYAL.dim,
        }}
      >
        {letter}
      </span>

      <span className="relative flex-1 min-w-0 text-sm leading-snug">{text}</span>

      {right && <Check className="relative w-4 h-4 shrink-0" style={{ color: ROYAL.gold }} />}
      {wrong && <X className="relative w-4 h-4 shrink-0" style={{ color: WRONG }} />}
    </motion.button>
  );
}
