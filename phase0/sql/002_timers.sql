-- Phase 0 timer accuracy spike (LOCAL TEST DATABASE ONLY).
create table if not exists public.p0_timers (id bigserial primary key, kind text not null, deadline_at timestamptz not null, fired_at timestamptz, http_sent_at timestamptz, edge_at timestamptz);
grant all on public.p0_timers to service_role; grant usage, select on sequence public.p0_timers_id_seq to service_role;
create or replace function public.p0_tick() returns void language plpgsql as $$
declare r record;
begin
  update public.p0_timers set fired_at = clock_timestamp() where fired_at is null and deadline_at <= clock_timestamp();
  for r in select id from public.p0_timers where kind = 'http' and fired_at is not null and http_sent_at is null loop
    perform net.http_post(url := 'http://kong:8000/functions/v1/tick', body := jsonb_build_object('id', r.id),
                          headers := jsonb_build_object('Content-Type', 'application/json'), timeout_milliseconds := 5000);
    update public.p0_timers set http_sent_at = clock_timestamp() where id = r.id;
  end loop;
end $$;
