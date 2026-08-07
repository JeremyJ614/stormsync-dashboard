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
import { awardPoints } from "./gamePoints";

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
  const { data, error } = await supabase
    .from("trivia_questions")
    .select("*")
    .eq("ask_date", todayUTC())
    .eq("active", true)
    .order("slot");
  if (error) throw error;
  return (data ?? []).map((r) => toQ(r as Row, false));
}

/** This member's answers for the given question ids. */
export async function getMyAnswers(userId: string, questionIds: string[]): Promise<Record<string, TriviaAnswer>> {
  if (!isSupabaseConfigured || !userId || questionIds.length === 0) return {};
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
  const { data: row, error: readErr } = await supabase
    .from("trivia_questions")
    .select("answer_index,explanation,points")
    .eq("id", q.id)
    .maybeSingle();
  if (readErr || !row) return { ok: false, error: readErr?.message ?? "Question unavailable" };

  const correct = choiceIndex === row.answer_index;
  const points = correct ? (row.points ?? 100) : 0;

  const { error } = await supabase.from("trivia_answers").insert({
    question_id: q.id, user_id: userId, user_name: userName,
    choice_index: choiceIndex, correct, points,
  });
  if (error) {
    // 23505 = already answered; surface the existing result rather than erroring
    if (error.code === "23505") {
      const mine = await getMyAnswers(userId, [q.id]);
      const a = mine[q.id];
      return { ok: true, correct: a?.correct, points: a?.points, answerIndex: row.answer_index, explanation: row.explanation };
    }
    return { ok: false, error: error.message };
  }
  if (points > 0) {
    await awardPoints({
      userId, userName, source: "trivia", points, earnedOn: todayUTC(),
      detail: { questionId: q.id, category: q.category, slot: q.slot },
    });
  }
  return { ok: true, correct, points, answerIndex: row.answer_index, explanation: row.explanation };
}

// ── Admin ───────────────────────────────────────────────────────────────────
export async function adminListQuestions(fromDate: string, toDate: string): Promise<TriviaQuestion[]> {
  const { data, error } = await supabase
    .from("trivia_questions").select("*")
    .gte("ask_date", fromDate).lte("ask_date", toDate)
    .order("ask_date", { ascending: false }).order("slot");
  if (error) throw error;
  return (data ?? []).map((r) => toQ(r as Row, true));
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
