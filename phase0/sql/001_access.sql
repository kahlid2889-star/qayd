-- Phase 0 spike schema. LOCAL TEST DATABASE ONLY. Not a migration of the game.
drop table if exists public.p0_state, public.p0_members, public.p0_events cascade;

create table public.p0_members (code text not null, user_id text not null, seat int not null, primary key (code, user_id), unique (code, seat));
create table public.p0_state   (code text primary key, version int not null default 0, state jsonb not null default '{}'::jsonb);   -- holds every hand
create table public.p0_events  (id bigserial primary key, code text not null, seq int not null, kind text not null, body jsonb not null, unique (code, seq));

alter table public.p0_members enable row level security;
alter table public.p0_state   enable row level security;
alter table public.p0_events  enable row level security;

-- API roles may only see their own membership row. state/events: no policy => denied.
grant select on public.p0_members to authenticated;
create policy member_self on public.p0_members for select to authenticated using ((auth.jwt() ->> 'sub') = user_id);

-- Realtime Authorization: a seated player may RECEIVE on their own seat topic and on the table topic.
-- Nobody may SEND from the browser (no INSERT policy).
drop policy if exists p0_seat_read on realtime.messages;
create policy p0_seat_read on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'broadcast' and exists (
    select 1 from public.p0_members m
    where m.user_id = (auth.jwt() ->> 'sub')
      and (realtime.topic() = 'room:' || m.code || ':seat:' || m.seat or realtime.topic() = 'room:' || m.code || ':table')
  )
);

-- Server-side deal: secret hands go to seat topics only, public event carries no hand.
create or replace function public.p0_deal(p_code text) returns void language plpgsql security definer as $$
declare m record; hand text;
begin
  for m in select * from public.p0_members where code = p_code loop
    hand := 'HAND-OF-SEAT-' || m.seat;
    perform realtime.send(jsonb_build_object('hand', hand, 'sent_at', clock_timestamp()), 'deal', 'room:' || p_code || ':seat:' || m.seat, true);
  end loop;
  perform realtime.send(jsonb_build_object('event', 'dealt', 'sent_at', clock_timestamp()), 'table', 'room:' || p_code || ':table', true);
end $$;

-- Compare-and-swap apply: one atomic statement. Returns the new version, or -1 when the caller was stale.
create or replace function public.p0_apply(p_code text, p_expected int, p_kind text, p_body jsonb) returns int language plpgsql security definer as $$
declare v int;
begin
  update public.p0_state set version = version + 1, state = state || jsonb_build_object('last', p_kind)
   where code = p_code and version = p_expected returning version into v;
  if v is null then return -1; end if;
  insert into public.p0_events (code, seq, kind, body) values (p_code, v, p_kind, p_body);
  perform realtime.send(p_body || jsonb_build_object('seq', v, 'sent_at', clock_timestamp()), p_kind, 'room:' || p_code || ':table', true);
  return v;
end $$;
revoke all on function public.p0_deal(text), public.p0_apply(text,int,text,jsonb) from public, anon, authenticated;
