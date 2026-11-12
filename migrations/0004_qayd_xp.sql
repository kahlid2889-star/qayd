-- Server-owned XP. The client may display it, but only settle writes the total.
alter table qayd_profiles add column if not exists xp_total integer;

update qayd_profiles
set xp_total = case
  when coalesce(data->'rank'->>'total', '') ~ '^[0-9]+$' then (data->'rank'->>'total')::int
  else 0
end
where xp_total is null;

create table if not exists qayd_xp_log (
  user_id text not null,
  match_id text not null,
  kind text not null,
  base_xp integer not null,
  eval_xp integer not null,
  cheat_xp integer not null,
  net_xp integer not null,
  total_before integer not null,
  total_after integer not null,
  level_after integer not null,
  at bigint not null,
  primary key (user_id, match_id)
);
