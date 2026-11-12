# Phase 0 — technical spikes for the server-authoritative online design

Not part of the game: nothing here is imported by it. Everything ran against a **local** Supabase stack
(Postgres, Realtime, PostgREST, Edge runtime in Docker) and a **standalone** Better Auth instance in its own
schema. No production data, secrets or Supabase project was used.

| Folder | What it tests |
|---|---|
| `identity/` | Better Auth as an OIDC-style issuer: ES256 JWT with `kid`, `role=authenticated`, non-UUID `sub`, discovery document, JWKS |
| `access/` | Private Realtime channels, RLS on a non-UUID `sub`, secret hand delivery, forged publishes, latency, CAS concurrency |
| `engine/` | Extracts the existing rules and bots from `public/qayd.html` (read only) and benchmarks them in Node, Deno and the Edge runtime |
| `sql/` | Spike schema: RLS, CAS apply function, timer table, idempotent ledger |
| `supabase/functions/` | `probe` (verify JWT → seat → CAS → broadcast), `bench` (bots in the Edge runtime), `tick` (pg_cron → pg_net arrival) |
| `scripts/` | Helpers to make the local stack trust the test keys, and to bundle the probe |

Results and caveats: see `RESULTS.md`.
