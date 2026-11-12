# Phase 0 results (local stack — see caveats)

## Identity (Better Auth JWT → Supabase)
- 16/16: ES256 token with `kid`, `role=authenticated`, `iss`=discovery issuer, `sub`=Better Auth user id (non-UUID), 1 h expiry,
  signature verifies against the published JWKS, tampered token and wrong issuer rejected, JWKS has no private material.
- `auth.uid()` cannot be used (non-UUID sub); policies use `auth.jwt() ->> 'sub'`. Verified working in RLS.
- NOT verified: a hosted project accepting the issuer through Custom OIDC (needs a public HTTPS issuer + a test project).

## Access control: 19/19
REST (anon/player/outsider/tampered/insert), private channels (own seat, other seat, outsider, anonymous), secret hands only to
their seat, public table event carries no hand, browser cannot publish.

## Client findings (supabase-js 2.119 vs Realtime 2.154, reproduced in Node and Chromium)
1. `await realtime.setAuth(token)` before any private join. Un-awaited → channel reports SUBSCRIBED but receives nothing.
2. Join all of a socket's private channels in the same tick. join A → setAuth again → join B leaves both deaf.
3. SUBSCRIBED does not prove delivery → the server must send a canary after join.
Raw WebSocket frames deliver correctly in every case; the problem is the client join sequence.

## Latency (software stack only, no WAN)
- Commit → client: p50 3 ms, p95 4 ms. Action → visible on all 4 clients through Edge+CAS: p50 11 ms, p95 14 ms, p99 27 ms, max 41 ms.
- 2,000 deliveries, 0 lost. 8 concurrent actions on one version: exactly 1 wins; event log and version stay equal.

## Bots (existing engine, unchanged)
- Per decision: strong p50 3 ms / p95 ≈ 30–47 ms / max ≈ 76 ms; strongest tier p95 ≈ 100 ms / max ≈ 170 ms.
- Edge runtime enforces the 2 s CPU limit: 10 bot-only rounds (tier 0) or 2 (tier 4) fit in one request. One bot move is far inside it.
- `postgres` driver hung inside the local Edge runtime; PostgREST RPC worked. Hosted behaviour untested.

## Timers (pg_cron 1.6.4, `'1 seconds'`)
- 93 ticks in 95 s, 0 failures, gap 1007–1011 ms. Deadline → fired: p50 0.53 s, p95 0.95 s, max 1.00 s, never early.
- pg_cron → pg_net → Edge Function adds ~0: p50 0.46 s, p95 0.98 s, max 1.04 s. 240/240 delivered.

## Volume (measured on the real game, 105 rounds / 12 matches)
- 43.2 logged events per round (32 card plays), 8.8 rounds per match. ≈ 466 public events + ≈ 70 private per match.
- Billing counts 1 sent + 1 per recipient: ≈ 2,470 messages per match (4 players).

## Ledger
- 20 concurrent identical settlements pay once; replay ignored; overdraft rejected without leaving a ledger row; clients cannot call it.
