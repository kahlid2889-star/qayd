-- Phase 0 spike: idempotent server-side settlement (LOCAL TEST DATABASE ONLY).
drop table if exists public.p0_wallet, public.p0_ledger cascade;
create table public.p0_wallet (user_id text primary key, coins bigint not null check (coins >= 0));
create table public.p0_ledger (id bigserial primary key, user_id text not null, match_id text not null, reason text not null, delta bigint not null, created_at timestamptz not null default now(), unique (user_id, match_id, reason));
alter table public.p0_wallet enable row level security; alter table public.p0_ledger enable row level security;
create or replace function public.p0_settle(p_user text, p_match text, p_reason text, p_delta bigint) returns bigint language plpgsql security definer as $$
declare ins int; bal bigint;
begin
  insert into public.p0_ledger (user_id, match_id, reason, delta) values (p_user, p_match, p_reason, p_delta) on conflict do nothing;
  get diagnostics ins = row_count;
  if ins = 1 then update public.p0_wallet set coins = coins + p_delta where user_id = p_user returning coins into bal;
  else select coins into bal from public.p0_wallet where user_id = p_user; end if;
  return bal;
end $$;
revoke all on function public.p0_settle(text,text,text,bigint) from public, anon, authenticated;
