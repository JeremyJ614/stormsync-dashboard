-- Submitting while "viewing as" a member.
--
-- The view-as lens is deliberately not an authentication switch: it swaps the
-- profile that drives gating and navigation, and leaves the Supabase session as
-- the admin's own. That is what makes it safe, and it is also why the two
-- interactive modules could not be used through it — game_guesses and
-- trivia_answers both check `user_id = auth.uid()` on insert, so a submission
-- made through the lens was written with the member's id under the admin's
-- session and rejected. Trivia was worse than rejected: its SELECT policy is
-- also auth.uid()-scoped, so the page read back an empty answer set and showed
-- the member as having answered nothing.
--
-- These three functions are the narrow, auditable exception. An admin — and
-- only an admin — may write one guess and one trivia answer on a named member's
-- behalf, and every such write leaves an admin_audit row naming both parties.
-- Nothing here can be reached by a member, and nothing here grants an admin any
-- read they did not already have.

-- ── one guess, on someone's behalf ───────────────────────────────────────────
create or replace function public.admin_lock_guess(
  p_user           uuid,
  p_user_name      text,
  p_date           date,
  p_lat            double precision,
  p_lon            double precision,
  p_city_label     text,
  p_tor_lat        double precision default null,
  p_tor_lon        double precision default null,
  p_tor_city_label text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  insert into public.game_guesses
    (user_id, user_name, guess_date, lat, lon, city_label, tor_lat, tor_lon, tor_city_label)
  values
    (p_user, p_user_name, p_date, p_lat, p_lon, p_city_label, p_tor_lat, p_tor_lon, p_tor_city_label);

  insert into public.admin_audit (actor_id, actor_email, action, target_type, target_id, target_label, detail)
  values (
    auth.uid(),
    (select email from public.profiles where id = auth.uid()),
    'user.submit_as',
    'game_guess', p_user::text, p_user_name,
    jsonb_build_object('date', p_date, 'city', p_city_label, 'tornado_city', p_tor_city_label)
  );
  return 'ok';
exception
  when unique_violation then
    return 'duplicate';
end;
$$;

revoke execute on function public.admin_lock_guess(uuid, text, date, double precision, double precision, text, double precision, double precision, text) from public, anon;
grant  execute on function public.admin_lock_guess(uuid, text, date, double precision, double precision, text, double precision, double precision, text) to authenticated;

-- ── one trivia answer, on someone's behalf ───────────────────────────────────
-- Scoring stays in the database, exactly as it does for a member answering for
-- themselves: the admin sends a choice index, never a verdict.
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
      -- Already answered. Hand back what is on record rather than an error, so
      -- the page shows the same thing it would for the member themselves.
      select ta.correct, ta.points into v_correct, v_points
      from public.trivia_answers ta
      where ta.question_id = p_question and ta.user_id = p_user;
  end;

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

-- ── reading a member's answers ───────────────────────────────────────────────
-- trivia_answers is readable only by its owner, so without this the lens shows
-- a member who has answered everything as having answered nothing.
create or replace function public.admin_trivia_answers(p_user uuid, p_questions uuid[])
returns table (question_id uuid, choice_index integer, correct boolean, points integer)
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
    select ta.question_id, ta.choice_index, ta.correct, ta.points
    from public.trivia_answers ta
    where ta.user_id = p_user and ta.question_id = any(p_questions);
end;
$$;

revoke execute on function public.admin_trivia_answers(uuid, uuid[]) from public, anon;
grant  execute on function public.admin_trivia_answers(uuid, uuid[]) to authenticated;
