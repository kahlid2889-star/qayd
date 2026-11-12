-- Session settings chosen by the table owner: play mode, match length, stake.
alter table qayd_rooms add column if not exists settings jsonb not null default '{}'::jsonb;
