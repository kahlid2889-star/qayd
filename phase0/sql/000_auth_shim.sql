-- LOCAL ONLY. The local stack runs without GoTrue, so the auth helpers that hosted Supabase
-- defines are recreated here with the same definition (read the JWT claims PostgREST/Realtime set).
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
