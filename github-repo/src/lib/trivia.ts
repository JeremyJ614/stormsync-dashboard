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
import { gameDate } from "./gameDay";
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

/**
 * Today, for trivia.
 *
 * Named `todayUTC` when the day really was UTC. It is the Eastern contest day
 * now — shared with the Forecast Game, so the two cannot roll over at
 * different moments — and the name is kept only because it is what every
 * caller already imports.
 */
export const todayUTC = (): string => gameDate();

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

/**
 * The answer key for questions this member has already answered.
 *
 * The question row deliberately withholds `answer_index` and `explanation` from
 * members — today's row is readable, so granting those columns would put the
 * answer key one `select` away. The side effect was that a member who reloaded
 * lost the answer too: a red cross, and no way to find out what was right.
 *
 * `trivia_answer_keys` returns the key only for questions this member has
 * already answered, so it cannot be used to read ahead. Absent (an older
 * database without the migration) it degrades to what the page did before —
 * the verdict, without the explanation.
 */
export async function getAnswerKeys(
  questionIds: string[],
): Promise<Record<string, { answerIndex: number; explanation: string | null }>> {
  if (!isSupabaseConfigured || questionIds.length === 0) return {};
  const { data, error } = await supabase.rpc("trivia_answer_keys", { p_questions: questionIds });
  if (error) {
    logger.warn("answer keys unavailable", { scope: "trivia", error });
    return {};
  }
  const out: Record<string, { answerIndex: number; explanation: string | null }> = {};
  for (const r of (data ?? []) as { question_id: string; answer_index: number; explanation: string | null }[]) {
    out[r.question_id] = { answerIndex: r.answer_index, explanation: r.explanation };
  }
  return out;
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

export interface MutationOutcome { ok: boolean; error?: string }

/**
 * Save a question, through the definer function rather than the table.
 *
 * Adding a question always failed with "permission denied for table
 * trivia_questions" while editing one worked, and the difference was the
 * upsert. Members have no table-level SELECT here — the answer key is kept
 * unreadable by granting SELECT column by column — and `INSERT ... ON CONFLICT
 * DO UPDATE` is the one write Postgres requires table-level SELECT for. A
 * column grant does not satisfy it. PostgREST even returns the hint "GRANT
 * SELECT ON public.trivia_questions TO authenticated", which would have handed
 * every signed-in member tomorrow's answers.
 *
 * The upsert is needed: (ask_date, slot) is UNIQUE, and "override slot 1" has
 * to replace whatever the generator put there. So it happens inside
 * `admin_save_trivia_question`, which runs as its owner and checks for admin
 * itself — the same shape the editor already uses to READ the answer key.
 */
export async function adminSaveQuestion(input: QuestionInput, id?: string): Promise<MutationOutcome> {
  const { error } = await supabase.rpc("admin_save_trivia_question", {
    p_id: id ?? null,
    p_ask_date: input.askDate,
    p_slot: input.slot,
    p_category: input.category,
    p_question: input.question,
    p_choices: input.choices,
    p_answer_index: input.answerIndex,
    p_explanation: input.explanation ?? null,
    p_points: input.points,
    p_active: input.active ?? true,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Delete and point changes report failures now.
 *
 * They used to discard the error, which is how the admin panel's hide button
 * came to "do nothing": the column-level SELECT grant on `trivia_questions` did
 * not survive the move to the new Supabase project, and Postgres needs SELECT on
 * a column to reference it in a WHERE clause — so `update … where id = ?` was
 * being refused, the refusal was thrown away, and the UI reloaded and showed the
 * unchanged row. A write that cannot fail visibly is a write you cannot trust.
 */
export async function adminDeleteQuestion(id: string): Promise<MutationOutcome> {
  const { error } = await supabase.from("trivia_questions").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Change just the point value of one question. */
export async function adminSetPoints(id: string, points: number): Promise<MutationOutcome> {
  const { error } = await supabase.from("trivia_questions").update({ points }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
