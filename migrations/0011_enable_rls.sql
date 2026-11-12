-- Row-level security on every table in the public schema.
--
-- Supabase exposes the public schema through its REST API, and the publishable
-- key is public by design. A table without RLS would be readable and writable
-- by anyone holding that key, including the Better Auth tables (user, session,
-- account) that hold password hashes and session tokens.
--
-- With RLS on and no policies the API roles are denied everything. The game
-- server is unaffected: it connects through DATABASE_URL as the table owner,
-- which bypasses RLS. Safe to re-run; also harmless on plain Postgres and PGLite.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
