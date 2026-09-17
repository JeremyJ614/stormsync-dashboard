-- Restore the column-level SELECT grant on `trivia_questions`.
--
-- The trivia table is the one place in this schema that uses column-level
-- privileges: the table grant is revoked so `answer_index` and `explanation`
-- cannot be read by a member sitting on the answers, and SELECT is then granted
-- back on every other column. That shape did not survive the move to the new
-- Supabase project — table grants came across, column grants did not, and
-- `information_schema.role_column_grants` had no rows at all for this table.
--
-- The effect was two failures that looked unrelated:
--   · members could not read the day's questions, so Daily Trivia was empty;
--   · adding a question in the admin panel returned "permission denied for
--     table trivia_questions", because PostgREST asks for the inserted row back
--     by default and the INSERT grant does not carry SELECT with it.
--
-- The order matters and is the same as the original: the table-level grant has
-- to be off first, because a column-level grant is redundant while a table-level
-- one covers every column, and re-revoking afterwards would take the column
-- grants with it.

revoke select on public.trivia_questions from anon, authenticated;

grant select (id, ask_date, slot, category, question, choices, points, source, active, created_at)
  on public.trivia_questions to anon, authenticated;

-- Belt and braces for the same class of drift: a fresh restore should not be
-- able to serve the answer key even for a moment.
revoke select (answer_index, explanation) on public.trivia_questions from anon, authenticated;
