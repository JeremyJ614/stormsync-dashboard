-- "permission denied for table trivia_questions" when adding a trivia question.
--
-- The cause is narrower than it looks, and it is why EDITING a question worked
-- while ADDING one never did. `trivia_questions` deliberately has no
-- table-level SELECT for members — the answer key lives in `answer_index` and
-- `explanation`, and SELECT is granted column by column so those two stay
-- unreadable. Plain INSERT, UPDATE and DELETE all work under that shape.
--
-- `INSERT ... ON CONFLICT DO UPDATE` does not. Postgres requires table-level
-- SELECT for it, and a column-level grant does not satisfy that requirement:
--
--   ERROR:  42501: permission denied for table trivia_questions
--   HINT:   GRANT SELECT ON public.trivia_questions TO authenticated;
--
-- and the admin editor saves a new question as an upsert on (ask_date, slot),
-- because that pair is UNIQUE and "override slot 1" has to replace whatever
-- the generator already put there.
--
-- Taking the hint would hand every signed-in member the answer key, so the
-- write goes through a definer function instead — the same shape the editor
-- already uses to READ the answers (`admin_trivia_questions`). The admin check
-- is inside the function rather than left to RLS, because a definer function
-- runs as its owner and RLS would not otherwise apply.

create or replace function public.admin_save_trivia_question(
  p_id           uuid,
  p_ask_date     date,
  p_slot         integer,
  p_category     text,
  p_question     text,
  p_choices      jsonb,
  p_answer_index integer,
  p_explanation  text,
  p_points       integer,
  p_active       boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if p_question is null or btrim(p_question) = '' then
    raise exception 'question text is required';
  end if;
  if p_choices is null or jsonb_array_length(p_choices) < 2 then
    raise exception 'at least two answer choices are required';
  end if;
  if p_answer_index is null or p_answer_index < 0
     or p_answer_index >= jsonb_array_length(p_choices) then
    raise exception 'the correct answer points outside the list of choices';
  end if;

  -- Editing an existing row is addressed by id, so moving a question to another
  -- date or slot stays one row rather than quietly forking into two.
  if p_id is not null then
    update public.trivia_questions set
      ask_date     = p_ask_date,
      slot         = p_slot,
      category     = p_category,
      question     = btrim(p_question),
      choices      = p_choices,
      answer_index = p_answer_index,
      explanation  = nullif(btrim(coalesce(p_explanation, '')), ''),
      points       = p_points,
      source       = 'admin',
      active       = coalesce(p_active, true)
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'no question with id %', p_id;
    end if;
    return v_id;
  end if;

  insert into public.trivia_questions
    (ask_date, slot, category, question, choices, answer_index, explanation, points, source, active)
  values
    (p_ask_date, p_slot, p_category, btrim(p_question), p_choices, p_answer_index,
     nullif(btrim(coalesce(p_explanation, '')), ''), p_points, 'admin', coalesce(p_active, true))
  on conflict (ask_date, slot) do update set
    category     = excluded.category,
    question     = excluded.question,
    choices      = excluded.choices,
    answer_index = excluded.answer_index,
    explanation  = excluded.explanation,
    points       = excluded.points,
    source       = 'admin',
    active       = excluded.active
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.admin_save_trivia_question(
  uuid, date, integer, text, text, jsonb, integer, text, integer, boolean
) from public, anon;
grant execute on function public.admin_save_trivia_question(
  uuid, date, integer, text, text, jsonb, integer, text, integer, boolean
) to authenticated;
