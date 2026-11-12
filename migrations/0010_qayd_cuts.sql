-- Host-reported cut counts for an online match. Guests cannot invent these numbers.
alter table qayd_matches add column if not exists cuts jsonb;
