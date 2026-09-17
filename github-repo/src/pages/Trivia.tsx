/**
 * Daily Trivia.
 *
 * REDESIGNED. The module had the right idea and none of the occasion. It was
 * two questions a day with one attempt each and real points on the line,
 * presented as a form: a hand-rolled header in the old generic theme, two grey
 * buttons for tabs, choices as `bg-muted/20` rectangles, and a result that
 * appeared instantly in a green or red block. Nothing about it said this was a
 * thing you get one shot at, once a day, and none of it belonged to the same
 * app as the modules around it.
 *
 * Now it opens in `ModuleShell` like everything else, the day's standing leads
 * as a scoreboard, and answering has a moment to it — the row presses, the
 * medallion fills, and a single champagne pass runs across the answer that was
 * right. Everything one-shot; nothing loops.
 *
 * The mechanics are unchanged: the same two questions, the same one attempt,
 * the same shared leaderboard with the Forecast Game, and grading still happens
 * in the database so a browser can neither see the key early nor mint points.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Lock, Clock, Loader2, Trophy, Sparkles } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { ModuleShell } from "../components/ModuleShell";
import { SegmentedTabs } from "../components/forecast/SegmentedTabs";
import { SubmittingAsNotice } from "../components/SubmittingAsNotice";
import { Leaderboard } from "../components/Leaderboard";
import { DayMeter, type Pip } from "../components/trivia/DayMeter";
import { QuestionCard } from "../components/trivia/QuestionCard";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";
import {
  getTodayQuestions, getMyAnswers, getAnswerKeys, submitAnswer, todayUTC,
  type TriviaQuestion, type TriviaAnswer,
} from "../lib/trivia";

type Tab = "play" | "board";
const TABS = [
  { id: "play" as const, label: "Today", sub: "Two questions" },
  { id: "board" as const, label: "Leaderboard", sub: "All players" },
];

/** What the page knows about a question's answer, however it learned it. */
interface Key { answerIndex: number; explanation: string | null }

export default function Trivia() {
  const { user } = useAuth();
  const still = prefersReducedMotion();
  const [tab, setTab] = useState<Tab>("play");
  const [answers, setAnswers] = useState<Record<string, TriviaAnswer>>({});
  const [keys, setKeys] = useState<Record<string, Key>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const qs = useQuery({
    queryKey: ["trivia", todayUTC()],
    queryFn: getTodayQuestions,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const questions = useMemo(() => qs.data ?? [], [qs.data]);

  // Answers first, then the keys for whatever has been answered. Two calls
  // rather than one because the key function is deliberately scoped to answered
  // questions — it cannot be used to look ahead, which is the point of it.
  useEffect(() => {
    if (!user || questions.length === 0) return;
    let live = true;
    const ids = questions.map((q) => q.id);
    getMyAnswers(user.id, ids).then((mine) => {
      if (!live) return;
      setAnswers(mine);
      if (Object.keys(mine).length === 0) return;
      getAnswerKeys(Object.keys(mine)).then((k) => { if (live) setKeys((prev) => ({ ...k, ...prev })); });
    });
    return () => { live = false; };
  }, [user, questions]);

  async function pick(q: TriviaQuestion, idx: number) {
    if (!user || answers[q.id] || busy) return;
    setBusy(q.id);
    const r = await submitAnswer(q, user.id, user.name, idx);
    setBusy(null);
    if (!r.ok) return;
    setAnswers((a) => ({
      ...a,
      [q.id]: { questionId: q.id, choiceIndex: idx, correct: !!r.correct, points: r.points ?? 0 },
    }));
    // The submit response carries the key, so the first reveal never waits on
    // a second round trip.
    setKeys((k) => ({
      ...k,
      [q.id]: { answerIndex: r.answerIndex ?? -1, explanation: r.explanation ?? null },
    }));
  }

  const answered = questions.filter((q) => answers[q.id]).length;
  const todayPoints = questions.reduce((n, q) => n + (answers[q.id]?.points ?? 0), 0);
  const allDone = questions.length > 0 && answered === questions.length;

  const pips: Pip[] = questions.map((q) => ({
    id: q.id,
    correct: answers[q.id] ? answers[q.id].correct : null,
  }));

  const note = !questions.length
    ? "Written fresh each morning."
    : allDone
      ? "That is today. New questions in the morning."
      : "One attempt each. Points count toward the Forecast Game leaderboard.";

  return (
    <ModuleShell
      eyebrow="StormSync · Daily"
      title="Daily Trivia"
      subtitle="Two questions every day — one weather, one deliberately random. One attempt each, scored into the same leaderboard as the Forecast Game."
      status={
        <div className="space-y-3">
          <SegmentedTabs segments={TABS} value={tab} onChange={setTab}
                         layoutId="trivia-tabs" controls="trivia-panel" label="Trivia sections" />
          {tab === "play" && user && questions.length > 0 && (
            <DayMeter pips={pips} points={todayPoints} still={still} note={note} />
          )}
        </div>
      }
    >
      <div id="trivia-panel">
        {tab === "board" ? (
          <Leaderboard meId={user?.id} />
        ) : !user ? (
          <Notice icon={Lock} title="Sign in to play"
                  body="Answers are scored against your account, so the points can land on the leaderboard." />
        ) : qs.isLoading ? (
          <div className="py-14 grid place-items-center">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: ROYAL.dim }} />
          </div>
        ) : questions.length === 0 ? (
          <Notice icon={Clock} title="Today's questions aren't up yet"
                  body="They're written fresh each morning — check back shortly." />
        ) : (
          <div className="space-y-4">
            <SubmittingAsNotice what="An answer" />

            {questions.map((q, i) => {
              const mine = answers[q.id] ?? null;
              const key = keys[q.id];
              return (
                <QuestionCard
                  key={q.id}
                  q={q}
                  index={i + 1}
                  picked={mine ? mine.choiceIndex : null}
                  // When the key is unavailable — an older database without the
                  // `trivia_answer_keys` migration — a right answer still knows
                  // itself, because the member picked it.
                  correctIndex={key ? key.answerIndex : mine?.correct ? mine.choiceIndex : -1}
                  points={mine?.points ?? null}
                  explanation={key?.explanation ?? null}
                  busy={busy === q.id}
                  locked={busy !== null && busy !== q.id}
                  still={still}
                  onPick={(idx) => pick(q, idx)}
                />
              );
            })}

            {allDone && (
              <motion.p
                initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: still ? 0.2 : 0.5, delay: 0.15, ease: EASE }}
                className="text-center text-[11px] flex items-center justify-center gap-1.5"
                style={{ color: ROYAL.dim }}>
                <Sparkles className="w-3.5 h-3.5" style={{ color: ROYAL.gold }} />
                {todayPoints > 0
                  ? `${todayPoints} point${todayPoints === 1 ? "" : "s"} banked. Come back in the morning.`
                  : "Nothing banked today. The next two are already being written."}
              </motion.p>
            )}

            {!allDone && (
              <p className="text-center text-[11px] flex items-center justify-center gap-1.5"
                 style={{ color: ROYAL.dim }}>
                <Trophy className="w-3.5 h-3.5" />
                One attempt per question. New questions each morning.
              </p>
            )}
          </div>
        )}
      </div>
    </ModuleShell>
  );
}

/** The module's empty and locked states, so neither is a bare sentence. */
function Notice({
  icon: Icon, title, body,
}: { icon: typeof Lock; title: string; body: string }) {
  return (
    <div className="relative rounded-2xl overflow-hidden px-6 py-12 text-center"
         style={{
           border: `1px solid ${ROYAL.hairline}`,
           background: `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
         }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />
      <Icon className="w-7 h-7 mx-auto mb-3" style={{ color: ROYAL.goldSoft }} />
      <h2 className="text-base font-semibold" style={{ fontFamily: HEADING, color: ROYAL.text }}>{title}</h2>
      <p className="mt-1.5 text-sm max-w-sm mx-auto leading-relaxed" style={{ color: ROYAL.dim }}>{body}</p>
    </div>
  );
}
