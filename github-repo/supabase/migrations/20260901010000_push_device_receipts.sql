-- Proof that a push actually arrived.
--
-- "Send a test push" reported `sent: 1` and nothing appeared on the phone.
-- That report was not wrong, it was just answering a different question: a web
-- push service returns 201 for any well-formed subscription it recognises,
-- including one belonging to a browser profile that was wiped months ago. The
-- server cannot tell delivery from acceptance.
--
-- So the device says so itself. The service worker acknowledges a test push
-- back to `push-ack`, which stamps the row. A device that accepts but never
-- acknowledges is a dead registration, and now looks like one.

alter table public.push_subscriptions
  add column if not exists user_agent  text,
  add column if not exists last_ack_at timestamptz,
  add column if not exists last_push_at timestamptz;

comment on column public.push_subscriptions.last_ack_at is
  'Set by the push-ack function when this device''s service worker confirms it received a push. Absent means never proven.';

-- The device list behind the admin card. Scoped to the caller: an admin has no
-- business enumerating other people's phones, and does not need to.
create or replace function public.my_push_devices()
returns table (
  id uuid,
  host text,
  tail text,
  user_agent text,
  created_at timestamptz,
  last_push_at timestamptz,
  last_ack_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id,
         -- Just the service, never the token: the endpoint is a bearer secret.
         split_part(split_part(s.endpoint, '://', 2), '/', 1) as host,
         -- Enough to recognise your own browser in the list, nowhere near
         -- enough to push to it. Only ever returned to the row's own owner.
         right(s.endpoint, 12) as tail,
         s.user_agent,
         s.created_at,
         s.last_push_at,
         s.last_ack_at
    from public.push_subscriptions s
   where s.user_id = (select auth.uid())
   order by s.created_at desc;
$$;

revoke all on function public.my_push_devices() from public, anon;
grant execute on function public.my_push_devices() to authenticated;

-- Removing a device you can see, without handing the client the endpoint.
create or replace function public.forget_push_device(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  delete from public.push_subscriptions
   where id = p_id and user_id = (select auth.uid());
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function public.forget_push_device(uuid) from public, anon;
grant execute on function public.forget_push_device(uuid) to authenticated;

-- Called by the ack function under the service role. Matching on the endpoint
-- is what makes it safe to leave unauthenticated: you cannot stamp a row
-- without already holding that device's endpoint, which only that device and
-- this server have.
create or replace function public.record_push_ack(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  update public.push_subscriptions
     set last_ack_at = now()
   where endpoint = p_endpoint;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function public.record_push_ack(text) from public, anon, authenticated;
grant execute on function public.record_push_ack(text) to service_role;
