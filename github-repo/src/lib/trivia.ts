/**
 * Daily Trivia (Phase 5).
 *
 * Two questions a day — one weather, one deliberately random — generated once
 * per day by Gemini via the storm-engine cron, with admin overrides. Points land
 * in the shared `game_points` ledger so trivia and the Forecast Game share one
 * leaderboard.
 *
 * RLS only exposes questions dated today or earlier, so tomorrow's answers can't
 * be pulled from the client.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { viewingAs } from "./impersonate";
import { logger } from "./logger";

export interface TriviaQuestion {
  id: string;
  askDate: string;
  slot: number;
  category: "weather" | "random";
  question: string;
  choices: string[];
  points: number;
  source: "ai" | "admin";
  active: boolean;
  /** Only present for admins / after answering. */
  answerIndex?: number;
  explanation?: string | null;
}

export interface TriviaAnswer {
  questionId: string;
  choiceIndex: number;
  correct: boolean;
  points: number;
}

export const todayUTC = (): string => new Date().toISOString().slice(0, 10);

interface Row {
  id: string; ask_date: string; slot: number; category: string; question: string;
  choices: string[] | null; answer_index: number; explanation: string | null;
  points: number; source: string; active: boolean;
}
const toQ = (r: Row, withAnswer: boolean): TriviaQuestion => ({
  id: r.id, askDate: r.ask_date, slot: r.slot,
  category: (r.category === "random" ? "random" : "weather"),
  question: r.question, choices: r.choices ?? [],
  points: r.points, source: (r.source === "admin" ? "admin" : "ai"), active: r.active,
  ...(withAnswer ? { answerIndex: r.answer_index, explanation: r.explanation } : {}),
});

/** Today's active questions (answers withheld until the member responds). */
export async function getTodayQuestions(): Promise<TriviaQuestion[]> {
  if (!isSupabaseConfigured) return [];
  // Explicit columns, not `select *`: answer_index and explanation are no
  // longer granted to members, and asking for them would fail the whole query.
  // This is also what makes the docstring above true — before, the answer was
  // in the response and merely dropped by the mapper.
  const { data, error } = await supabase
    .from("trivia_questions")
    .select("id,ask_date,slot,category,question,choices,points,source,active")
    .eq("ask_date", todayUTC())
    .eq("active", true)
    .order("slot");
  if (error) throw error;
  return (data ?? []).map((r) => toQ(r as Row, false));
}

/** This member's answers for the given question ids. */
export async function getMyAnswers(userId: string, questionIds: string[]): Promise<Record<string, TriviaAnswer>> {
  if (!isSupabaseConfigured || !userId || questionIds.length === 0) return {};
  // trivia_answers is readable only by its owner, so through the view-as lens
  // this would come back empty and show a member who has answered as having
  // answered nothing. The admin function reads the same four columns.
  if (viewingAs()) {
    const { data: rpcRows } = await supabase.rpc("admin_trivia_answers", {
      p_user: userId, p_questions: questionIds,
    });
    const seen: Record<string, TriviaAnswer> = {};
    for (const r of (rpcRows ?? []) as { question_id: string; choice_index: number; correct: boolean; points: number }[]) {
      seen[r.question_id] = {
        questionId: r.question_id, choiceIndex: r.choice_index,
        correct: r.correct, points: r.points,
      };
    }
    return seen;
  }
  const { data } = await supabase
    .from("trivia_answers")
    .select("question_id,choice_index,correct,points")
    .eq("user_id", userId)
    .in("question_id", questionIds);
  const out: Record<string, TriviaAnswer> = {};
  for (const r of data ?? []) {
    out[r.question_id] = {
      questionId: r.question_id, choiceIndex: r.choice_index,
      correct: r.correct, points: r.points,
    };
  }
  return out;
}

/**
 * Submit an answer. Grading happens server-side-ish: we re-read the question row
 * (RLS lets us, it's today's) to get the correct index rather than trusting any
 * value the client already had.
 */
export async function submitAnswer(
  q: TriviaQuestion, userId: string, userName: string, choiceIndex: number,
): Promise<{ ok: boolean; correct?: boolean; points?: number; answerIndex?: number; explanation?: string | null; error?: string }> {
  // Scoring happens in the database. The client sends a choice index and gets
  // back a verdict — it never sees the answer key beforehand, and it never
  // writes to the points ledger, because a browser that can mint points is a
  // browser that will. Through the view-as lens the same work is done by the
  // admin twin, which additionally records who did it.
  const rpc = viewingAs()
    ? supabase.rpc("admin_submit_trivia", {
        p_user: userId, p_user_name: userName, p_question: q.id, p_choice: choiceIndex,
      })
    : supabase.rpc("submit_trivia_answer", { p_question: q.id, p_choice: choiceIndex });

  const { data: res, error } = await rpc;
  if (error) {
    logger.error("submitAnswer failed", { scope: "trivia", error });
    return { ok: false, error: error.message };
  }
  const r = (res ?? {}) as {
    ok?: boolean; error?: string; correct?: boolean; points?: number;
    answer_index?: number; explanation?: string | null;
  };
  if (!r.ok) return { ok: false, error: r.error ?? "Could not record that answer." };
  return {
    ok: true,
    correct: r.correct,
    points: r.points,
    answerIndex: r.answer_index,
    explanation: r.explanation ?? null,
  };
}

// ── Admin ───────────────────────────────────────────────────────────────────
export async function adminListQuestions(fromDate: string, toDate: string): Promise<TriviaQuestion[]> {
  // Through the RPC, because the editor is the one place that must see the
  // answer key and the column grant no longer covers even admins.
  const { data, error } = await supabase.rpc("admin_trivia_questions", {
    p_from: fromDate, p_to: toDate,
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => toQ(r, true));
}

export interface QuestionInput {
  askDate: string; slot: number; category: "weather" | "random";
  question: string; choices: string[]; answerIndex: number;
  explanation?: string; points: number; active?: boolean;
}

export async function adminSaveQuestion(input: QuestionInput, id?: string) {
  const row = {
    ask_date: input.askDate, slot: input.slot, category: input.category,
    question: input.question, choices: input.choices, answer_index: input.answerIndex,
    explanation: input.explanation ?? null, points: input.points,
    source: "admin", active: input.active ?? true,
  };
  const { error } = id
    ? await supabase.from("trivia_questions").update(row).eq("id", id)
    : await supabase.from("trivia_questions").upsert(row, { onConflict: "ask_date,slot" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function adminDeleteQuestion(id: string) {
  await supabase.from("trivia_questions").delete().eq("id", id);
}

/** Change just the point value of one question. */
export async function adminSetPoints(id: string, points: number) {
  await supabase.from("trivia_questions").update({ points }).eq("id", id);
}
