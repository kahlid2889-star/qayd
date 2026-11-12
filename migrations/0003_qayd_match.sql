-- One id per live hand, cleared when the hand ends or the host leaves.
alter table qayd_rooms add column if not exists match_id text;
