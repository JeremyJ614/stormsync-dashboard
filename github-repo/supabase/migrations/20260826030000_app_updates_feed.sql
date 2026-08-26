-- The App Updates feed, assembled server-side.
--
-- Two reasons this is a function rather than five client queries.
--
-- The first is correctness. `profiles` is readable only by its owner and by
-- admins, which is right — but it means a client building this feed cannot
-- resolve anybody's name and every line comes out as "Someone earned a badge".
-- The feed is meant to be the room talking.
--
-- The second is disclosure. Rather than opening `profiles` up so the client can
-- do the join, this returns **first names only**, and only for rows that are
-- already public knowledge inside the app: a badge someone earned, a game they
-- won, a trivia answer they got right, the fact that they joined. No email, no
-- surname, no tier, no counts. A member sees what a member would see standing
-- in the room; nothing more leaves the table.
create or replace function public.app_updates_feed(p_days integer default 45, p_limit integer default 60)
returns table (
  id      text,
  kind    text,
  at      timestamptz,
  who     text,
  text    text,
  detail  text
)
language sql
stable
security definer
set search_path = public
as $$
  with since as (select now() - make_interval(days => greatest(p_days, 1)) as t)
  select * from (
    -- badges earned
    select 'badge:' || a.id::text,
           'badge',
           a.awarded_at,
           split_part(coalesce(p.name, 'Someone'), ' ', 1),
           split_part(coalesce(p.name, 'Someone'), ' ', 1) || ' earned ' || d.label || '.',
           null::text
    from public.badge_awards a
    join public.badge_defs d on d.id = a.badge_id
    left join public.profiles p on p.id = a.user_id
    where a.awarded_at >= (select t from since)

    union all
    -- releases
    select 'news:' || n.id::text,
           'release',
           coalesce(n.publish_at, n.created_at),
           null,
           n.title,
           nullif(n.excerpt, '')
    from public.news_posts n
    where n.status = 'published'
      and coalesce(n.publish_at, n.created_at) >= (select t from since)

    union all
    -- forecast game winners
    select 'win:' || w.month,
           'winner',
           w.created_at,
           split_part(coalesce(w.user_name, 'Someone'), ' ', 1),
           split_part(coalesce(w.user_name, 'Someone'), ' ', 1) || ' won the Forecast Game for ' ||
             to_char(to_date(w.month || '-01', 'YYYY-MM-DD'), 'FMMonth YYYY') || '.',
           w.points::text || ' points.'
    from public.game_winners w
    where w.created_at >= (select t from since)

    union all
    -- trivia, right answers
    select 'trivia:' || t.id::text,
           'trivia',
           t.answered_at,
           split_part(coalesce(t.user_name, 'Someone'), ' ', 1),
           split_part(coalesce(t.user_name, 'Someone'), ' ', 1) || ' got the trivia right.',
           case when coalesce(t.points, 0) > 0 then t.points::text || ' points.' end
    from public.trivia_answers t
    where t.correct and t.answered_at >= (select t from since)

    union all
    -- new members
    select 'member:' || p.id::text,
           'member',
           p.joined_at,
           split_part(coalesce(p.name, 'Someone'), ' ', 1),
           split_part(coalesce(p.name, 'Someone'), ' ', 1) || ' joined StormSync.',
           null
    from public.profiles p
    where p.joined_at >= (select t from since)
  ) feed(id, kind, at, who, text, detail)
  order by at desc
  limit greatest(p_limit, 1);
$$;

revoke execute on function public.app_updates_feed(integer, integer) from public, anon;
grant execute on function public.app_updates_feed(integer, integer) to authenticated;
