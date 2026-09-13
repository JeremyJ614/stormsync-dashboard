-- Let a member see the answer to a question they have already answered.
--
-- `trivia_questions` withholds `answer_index` and `explanation` from members on
-- purpose: the row for today is readable, so granting those columns would put
-- tomorrow morning's answer key one `select` away. The consequence nobody
-- intended is that the answer is also gone the moment you reload. Get one
-- wrong, refresh, and the module shows you a red cross and never tells you what
-- the right answer was — which is the one thing a trivia module exists to do.
--
-- This function closes only that gap: it returns the key for questions this
-- member has ALREADY answered, and nothing else. An unanswered question
-- produces no row, so it cannot be used to look ahead.
create or replace function public.trivia_answer_keys(p_questions uuid[])
returns table (question_id uuid, answer_index integer, explanation text)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.answer_index, q.explanation
  from public.trivia_questions q
  join public.trivia_answers a
    on a.question_id = q.id
   and a.user_id = auth.uid()
  where q.id = any(p_questions);
$$;

comment on function public.trivia_answer_keys(uuid[]) is
  'Answer key and explanation for questions the calling member has already answered. '
  'Returns nothing for an unanswered question, so it cannot be used to read ahead.';

revoke all on function public.trivia_answer_keys(uuid[]) from public, anon;
grant execute on function public.trivia_answer_keys(uuid[]) to authenticated;
