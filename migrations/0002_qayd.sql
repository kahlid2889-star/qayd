-- Accounts progress + online tables for قيد.
create table if not exists qayd_profiles (
  user_id text primary key,
  display_name text not null default '',
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null
);

create table if not exists qayd_rooms (
  code text primary key,
  title text not null,
  host_id text,
  phase text not null default 'lobby',
  updated_at bigint not null
);

create table if not exists qayd_members (
  code text not null references qayd_rooms(code) on delete cascade,
  user_id text not null,
  seat integer,
  name text not null,
  last_seen bigint not null,
  primary key (code, user_id)
);

create unique index if not exists qayd_members_seat_idx
  on qayd_members (code, seat)
  where seat is not null;

create table if not exists qayd_mail (
  id bigserial primary key,
  code text not null,
  to_user text,
  from_user text not null,
  kind text not null,
  body jsonb not null default '{}'::jsonb,
  at bigint not null
);

create index if not exists qayd_mail_code_id_idx on qayd_mail (code, id);
