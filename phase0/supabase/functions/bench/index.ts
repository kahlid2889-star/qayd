// Phase 0: run the existing bots INSIDE the Edge runtime and report wall + CPU time.
import { runRounds } from "../_shared/bench-bots.mjs";
Deno.serve((req) => {
  const u = new URL(req.url);
  const rounds = Number(u.searchParams.get("rounds") || 10), tier = Number(u.searchParams.get("tier") || 0);
  const t0 = performance.now();
  const r = runRounds(rounds, tier);
  return Response.json({ runtime: "Deno " + Deno.version.deno, ...r, totalWallMs: Math.round(performance.now() - t0) });
});
