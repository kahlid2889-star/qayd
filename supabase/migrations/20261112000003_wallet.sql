-- ============================================================================
-- Qayd v2 — server-owned coins for ONLINE play.
-- The local game keeps its own device coins untouched; this wallet only moves through settle_coins(),
-- which clients cannot call. Every movement is a ledger row; (user, reason, ref) is unique, so a replayed
-- settlement pays once.
-- ============================================================================
create table public.wallets (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  coins      bigint not null check (coins >= 0),
  updated_at timestamptz not null default now()
);
create table public.wallet_ledger (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  delta      bigint not null,
  reason     text not null,
  ref        text not null,
  created_at timestamptz not null default now(),
  unique (user_id, reason, ref)
);
create index wallet_ledger_user_idx on public.wallet_ledger (user_id, created_at desc);
alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;
revoke all on public.wallets, public.wallet_ledger from anon, authenticated;
grant select on public.wallets, public.wallet_ledger to authenticated;
create policy wallets_own on public.wallets for select to authenticated using (user_id = auth.uid());
create policy ledger_own on public.wallet_ledger for select to authenticated using (user_id = auth.uid());

-- Single place that decides the welcome grant. Change it here, in a later migration, if the policy changes.
create or replace function public.welcome_grant() returns bigint
language sql immutable set search_path = '' as $$ select 1000::bigint $$;

create or replace function public.give_welcome_wallet() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.wallets (user_id, coins) values (new.id, public.welcome_grant());
  insert into public.wallet_ledger (user_id, delta, reason, ref) values (new.id, public.welcome_grant(), 'welcome', 'signup');
  return new;
end $$;
create trigger on_profile_created after insert on public.profiles
for each row execute function public.give_welcome_wallet();

create or replace function public.get_my_wallet() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  return jsonb_build_object(
    'coins', coalesce((select coins from public.wallets where user_id = uid), 0),
    'history', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select delta, reason, ref, created_at from public.wallet_ledger where user_id = uid order by created_at desc limit 30) x), '[]'::jsonb));
end $$;

-- Server-only. Returns the new balance. Replays return the current balance without paying again.
create or replace function public.settle_coins(p_user uuid, p_reason text, p_ref text, p_delta bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare inserted int; bal bigint;
begin
  insert into public.wallet_ledger (user_id, delta, reason, ref) values (p_user, p_delta, p_reason, p_ref) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then
    update public.wallets set coins = coins + p_delta, updated_at = now() where user_id = p_user returning coins into bal;
  else
    select coins into bal from public.wallets where user_id = p_user;
  end if;
  return bal;
end $$;

-- Backfill: profiles created before this migration get the grant too.
insert into public.wallets (user_id, coins) select id, public.welcome_grant() from public.profiles on conflict do nothing;
insert into public.wallet_ledger (user_id, delta, reason, ref)
  select id, public.welcome_grant(), 'welcome', 'signup' from public.profiles on conflict do nothing;

-- Canary for the app's realtime health check: ring my own channel and see it arrive.
create or replace function public.ping_me() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  perform realtime.send(jsonb_build_object('kind', 'pong', 'at', now()), 'pong', 'user:' || uid::text, true);
end $$;

revoke execute on function public.welcome_grant(), public.give_welcome_wallet(), public.get_my_wallet(),
  public.settle_coins(uuid, text, text, bigint), public.ping_me() from public, anon, authenticated;
grant execute on function public.get_my_wallet(), public.ping_me() to authenticated;
grant execute on function public.settle_coins(uuid, text, text, bigint) to service_role;
