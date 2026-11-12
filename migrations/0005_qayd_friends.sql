-- Friend graph keyed by the stable account id. Presence is last_seen, not a fake flag.
alter table qayd_profiles add column if not exists last_seen bigint;

create table if not exists qayd_friends (
  from_id text not null,
  to_id text not null,
  status text not null,
  created_at bigint not null,
  primary key (from_id, to_id)
);

create index if not exists qayd_friends_to_idx on qayd_friends (to_id, status);
