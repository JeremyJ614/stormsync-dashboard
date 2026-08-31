-- Trivia scoring moves into the database, where it should always have been.
--
-- Two things were wrong, and they are the same thing seen from two sides.
--
-- 1. Members could not earn trivia points. `game_points` is admin-write by
--    policy, and the client awarded points straight from the browser, so every
--    member's award was rejected by RLS. The failure was swallowed, so the page
--    said "+100" and the ledger recorded nothing. Confirmed against the data:
--    every trivia point row in the table belongs to an admin.
--
-- 2. The answer key was public. `trivia_questions` is readable by any signed-in
--    member and the client fetched `select *`, so `answer_index` was sitting in
--    the network response before anybody chose anything. Hiding it in the
--    TypeScript model is not hiding it.
--
-- Both are fixed by scoring server-side: the client sends a choice index and
-- gets back a verdict, and the answer column stops being readable at all.

-- ── one answer, scored and paid ──────────────────────────────────────────────
create or replace function public.submit_trivia_answer(
  p_question uuid,
  p_choice   integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_name    text;
  q         record;
  v_correct boolean;
  v_points  integer;
  v_fresh   boolean := true;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;

  select answer_index, explanation, points, ask_date into q
  from public.trivia_questions
  where id = p_question and active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Question unavailable');
  end if;
  -- A question that has not been asked yet cannot be answered early.
  if q.ask_date > ((now() at time zone 'utc')::date) then
    return jsonb_build_object('ok', false, 'error', 'Question unavailable');
  end if;

  select name into v_name from public.profiles where id = v_uid;

  v_correct := (p_choice = q.answer_index);
  v_points  := case when v_correct then coalesce(q.points, 100) else 0 end;

  begin
    insert into public.trivia_answers (question_id, user_id, user_name, choice_index, correct, points)
    values (p_question, v_uid, coalesce(v_name, 'Member'), p_choice, v_correct, v_points);
  exception
    when unique_violation then
      v_fresh := false;
      select ta.correct, ta.points into v_correct, v_points
      from public.trivia_answers ta
      where ta.question_id = p_question and ta.user_id = v_uid;
  end;

  -- The ledger row is written here, under the definer's rights, because the
  -- member has none on game_points — by design, so that points can only ever be
  -- minted by code that also decided they were earned.
  if v_fresh and v_points > 0 then
    insert into public.game_points (user_id, user_name, source, points, earned_on, detail)
    values (v_uid, coalesce(v_name, 'Member'), 'trivia', v_points,
            (now() at time zone 'utc')::date,
            jsonb_build_object('questionId', p_question));
  end if;

  return jsonb_build_object(
    'ok', true,
    'correct', v_correct,
    'points', v_points,
    'answer_index', q.answer_index,
    'explanation', q.explanation
  );
end;
$$;

revoke execute on function public.submit_trivia_answer(uuid, integer) from public, anon;
grant  execute on function public.submit_trivia_answer(uuid, integer) to authenticated;

-- ── the same, on a member's behalf, for the view-as lens ─────────────────────
-- Replaces the version added alongside the lens, which recorded the answer but
-- not the points and so reproduced bug 1 through the admin path.
create or replace function public.admin_submit_trivia(
  p_user      uuid,
  p_user_name text,
  p_question  uuid,
  p_choice    integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  q         record;
  v_correct boolean;
  v_points  integer;
  v_fresh   boolean := true;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select answer_index, explanation, points into q
  from public.trivia_questions where id = p_question;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Question unavailable');
  end if;

  v_correct := (p_choice = q.answer_index);
  v_points  := case when v_correct then coalesce(q.points, 100) else 0 end;

  begin
    insert into public.trivia_answers (question_id, user_id, user_name, choice_index, correct, points)
    values (p_question, p_user, p_user_name, p_choice, v_correct, v_points);

    insert into public.admin_audit (actor_id, actor_email, action, target_type, target_id, target_label, detail)
    values (
      auth.uid(),
      (select email from public.profiles where id = auth.uid()),
      'user.submit_as',
      'trivia_answer', p_user::text, p_user_name,
      jsonb_build_object('question', p_question, 'choice', p_choice, 'correct', v_correct)
    );
  exception
    when unique_violation then
      v_fresh := false;
      select ta.correct, ta.points into v_correct, v_points
      from public.trivia_answers ta
      where ta.question_id = p_question and ta.user_id = p_user;
  end;

  if v_fresh and v_points > 0 then
    insert into public.game_points (user_id, user_name, source, points, earned_on, detail)
    values (p_user, p_user_name, 'trivia', v_points,
            (now() at time zone 'utc')::date,
            jsonb_build_object('questionId', p_question, 'via', 'view-as'));
  end if;

  return jsonb_build_object(
    'ok', true,
    'correct', v_correct,
    'points', v_points,
    'answer_index', q.answer_index,
    'explanation', q.explanation
  );
end;
$$;

revoke execute on function public.admin_submit_trivia(uuid, text, uuid, integer) from public, anon;
grant  execute on function public.admin_submit_trivia(uuid, text, uuid, integer) to authenticated;

-- ── the answer key stops being readable ──────────────────────────────────────
-- Column-level SELECT, so the row policy is untouched and every other column
-- keeps working exactly as before. Admins are `authenticated` too, so the
-- editor reads through admin_trivia_questions below rather than the table.
--
-- The table-level grant has to come off FIRST. A column-level revoke against a
-- role that holds SELECT on the whole table is a no-op — the table grant still
-- covers every column — which is exactly what happened on the first attempt:
-- the revoke reported success and the answer key was still being served.
revoke select on public.trivia_questions from anon, authenticated;
grant  select (id, ask_date, slot, category, question, choices, points, source, active, created_at)
  on public.trivia_questions to anon, authenticated;

create or replace function public.admin_trivia_questions(p_from date, p_to date)
returns setof public.trivia_questions
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select * from public.trivia_questions
    where ask_date >= p_from and ask_date <= p_to
    order by ask_date desc, slot;
end;
$$;

revoke execute on function public.admin_trivia_questions(date, date) from public, anon;
grant  execute on function public.admin_trivia_questions(date, date) to authenticated;
