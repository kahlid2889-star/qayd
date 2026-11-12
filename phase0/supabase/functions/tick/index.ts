// Phase 0: stamps the moment a pg_cron -> pg_net -> Edge Function call arrives.
const REST = Deno.env.get("REST_URL")!, SERVICE = Deno.env.get("SERVICE_JWT")!;
Deno.serve(async (req) => {
  const arrived = new Date().toISOString();
  const { id } = await req.json();
  const r = await fetch(`${REST}/p0_timers?id=eq.${id}`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${SERVICE}`, apikey: SERVICE }, body: JSON.stringify({ edge_at: arrived }) });
  return Response.json({ ok: r.ok });
});
