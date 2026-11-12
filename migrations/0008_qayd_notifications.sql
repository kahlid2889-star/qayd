-- Per-account notices. A normal player can only read and change their own rows.
create table if not exists qayd_notifications (
  id bigserial primary key,
  user_id text not null,
  kind text not null,
  title text not null,
  body text not null default '',
  href text not null default '',
  dedupe text not null,
  read_at bigint,
  created_at bigint not null
);

create unique index if not exists qayd_notifications_dedupe_idx
  on qayd_notifications (user_id, dedupe);

create index if not exists qayd_notifications_user_idx
  on qayd_notifications (user_id, created_at desc);
