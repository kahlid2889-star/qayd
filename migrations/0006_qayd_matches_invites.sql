-- Server-side match register: XP only counts for a match the server saw start.
create table if not exists qayd_matches (
  match_id text primary key,
  kind text not null,
  owner_id text not null,
  code text,
  started_at bigint not null,
  ended_at bigint,
  winner integer
);

create index if not exists qayd_matches_owner_idx on qayd_matches (owner_id, started_at);

create table if not exists qayd_match_seats (
  match_id text not null,
  user_id text not null,
  seat integer not null,
  primary key (match_id, user_id)
);

-- Real friend invitations (the old button only opened a room for the sender).
create table if not exists qayd_invites (
  from_id text not null,
  to_id text not null,
  code text not null,
  at bigint not null,
  primary key (from_id, to_id)
);

create index if not exists qayd_invites_to_idx on qayd_invites (to_id, at);
create index if not exists qayd_xp_log_user_at_idx on qayd_xp_log (user_id, at);
create index if not exists qayd_members_user_idx on qayd_members (user_id);
