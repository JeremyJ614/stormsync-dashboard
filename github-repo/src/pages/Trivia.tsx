import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Brain, CloudLightning, Sparkles, Check, X, Loader2, Trophy, Clock, Lock,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Leaderboard } from "../components/Leaderboard";
import {
  getTodayQuestions, getMyAnswers, submitAnswer, todayUTC,
  type TriviaQuestion, type TriviaAnswer,
} from "../lib/trivia";

/**
 * Daily Trivia (Phase 5) — two questions a day (one weather, one deliberately
 * random), multiple choice, scored into the shared leaderboard alongside the
 * Forecast Game.
 */

type Result = { correct: boolean; points: number; answerIndex: number; explanation?: string | null };

export default function Trivia() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"play" | "board">("play");
  const [answers, setAnswers] = useState<Record<string, TriviaAnswer>>({});
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const qs = useQuery({
    queryKey: ["trivia", todayUTC()],
    queryFn: getTodayQuestions,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const questions = useMemo(() => qs.data ?? [], [qs.data]);

  useEffect(() => {
    if (!user || questions.length === 0) return;
    getMyAnswers(user.id, questions.map((q) => q.id)).then(setAnswers);
  }, [user, questions]);

  async function pick(q: TriviaQuestion, idx: number) {
    if (!user || answers[q.id] || results[q.id] || busy) return;
    setBusy(q.id);
    const r = await submitAnswer(q, user.id, user.name, idx);
    setBusy(null);
    if (!r.ok) return;
    setAnswers((a) => ({ ...a, [q.id]: { questionId: q.id, choiceIndex: idx, correct: !!r.correct, points: r.points ?? 0 } }));
    setResults((s) => ({ ...s, [q.id]: { correct: !!r.correct, points: r.points ?? 0, answerIndex: r.answerIndex ?? -1, explanation: r.explanation } }));
  }

  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const todayPoints = questions.reduce((n, q) => n + (answers[q.id]?.points ?? 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-full overflow-x-hidden">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-wide uppercase flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" /> Daily Trivia
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Two questions every day — one weather, one totally random. Points count toward the same leaderboard as the Forecast Game.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 bg-card border border-border rounded-xl p-1.5">
        <button onClick={() => setTab("play")}
          className={`py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 ${tab === "play" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
          <Sparkles className="w-4 h-4" /> Today
        </button>
        <button onClick={() => setTab("board")}
          className={`py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 ${tab === "board" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
          <Trophy className="w-4 h-4" /> Leaderboard
        </button>
      </div>

      {tab === "board" ? (
        <Leaderboard meId={user?.id} />
      ) : !user ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <Lock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Sign in to play and score points.</p>
        </div>
      ) : qs.isLoading ? (
        <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : questions.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Today's questions haven't been generated yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">They're written fresh each morning — check back shortly.</p>
        </div>
      ) : (
        <>
          {/* progress */}
          <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Today</div>
              <div className="text-sm font-semibold">{answeredCount} of {questions.length} answered</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Points earned</div>
              <div className="text-lg font-extrabold tabular-nums text-primary">{todayPoints}</div>
            </div>
          </div>

          {questions.map((q) => {
            const mine = answers[q.id];
            const res = results[q.id];
            const revealed = !!mine;
            const correctIdx = res?.answerIndex ?? -1;
            const Icon = q.category === "weather" ? CloudLightning : Sparkles;
            return (
              <div key={q.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${q.category === "weather" ? "text-[#d9b775]" : "text-fuchsia-400"}`} />
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {q.category === "weather" ? "Weather" : "Random"}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">{q.points} pts</span>
                </div>

                <div className="p-4 space-y-3">
                  <p className="text-sm font-medium leading-relaxed">{q.question}</p>

                  <div className="space-y-2">
                    {q.choices.map((c, i) => {
                      const chosen = mine?.choiceIndex === i;
                      const isRight = revealed && correctIdx === i;
                      const isWrongPick = revealed && chosen && correctIdx !== i;
                      return (
                        <button key={i} onClick={() => pick(q, i)} disabled={revealed || busy === q.id}
                          className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors flex items-center gap-2.5
                            ${isRight ? "bg-green-500/15 border-green-500/50 text-green-200"
                              : isWrongPick ? "bg-red-500/15 border-red-500/50 text-red-200"
                              : revealed ? "bg-muted/10 border-border text-muted-foreground"
                              : "bg-muted/20 border-border hover:border-primary/40"}`}>
                          <span className="w-5 h-5 rounded-full border border-current/40 grid place-items-center text-[10px] font-bold shrink-0">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="flex-1 min-w-0">{c}</span>
                          {isRight && <Check className="w-4 h-4 shrink-0" />}
                          {isWrongPick && <X className="w-4 h-4 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {busy === q.id && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…
                    </div>
                  )}

                  {revealed && (
                    <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      mine.correct ? "bg-green-500/10 border border-green-500/30 text-green-200"
                                   : "bg-red-500/10 border border-red-500/30 text-red-200"}`}>
                      <strong>{mine.correct ? `Correct — +${mine.points} points` : "Not this time."}</strong>
                      {res?.explanation && <span className="block mt-1 text-muted-foreground">{res.explanation}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <p className="text-[11px] text-muted-foreground text-center">
            One attempt per question. New questions each morning.
          </p>
        </>
      )}
    </div>
  );
}
