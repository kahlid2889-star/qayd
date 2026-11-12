-- Online matches: every phone runs the same table and only the moves travel.
-- One row per decision (deal, bid, card, bot catch), first write wins per step.
alter table qayd_matches add column if not exists info jsonb;

create table if not exists qayd_moves (
  match_id text not null,
  k integer not null,
  seat integer not null,
  user_id text not null,
  body jsonb not null,
  at bigint not null,
  primary key (match_id, k)
);

-- Same rule as 0011: nothing is reachable through the public Supabase API.
alter table qayd_moves enable row level security;
