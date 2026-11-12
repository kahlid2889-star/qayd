-- Host-reported buyer grades for an online match. Guests cannot invent this number.
alter table qayd_matches add column if not exists eval jsonb;
