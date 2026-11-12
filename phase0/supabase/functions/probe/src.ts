// Phase 0 probe: verify a Better Auth JWT (remote JWKS), map it to a seat, apply a move with CAS via PostgREST RPC,
// and let the database broadcast it. Same shape the production Edge Function would have.
import { createRemoteJWKSet, jwtVerify } from "jose";

const jwks = createRemoteJWKSet(new URL(Deno.env.get("BA_JWKS_URL")!));
const issuer = Deno.env.get("BA_ISSUER")!;
const REST = Deno.env.get("REST_URL")!;
const SERVICE = Deno.env.get("SERVICE_JWT")!;
const H = { "content-type": "application/json", authorization: `Bearer ${SERVICE}`, apikey: SERVICE };

Deno.serve(async (req) => {
  const t0 = performance.now();
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
    const { payload } = await jwtVerify(token, jwks, { issuer });
    const t1 = performance.now();
    const body = await req.json();
    const code = String(body.code);
    const seatRes = await fetch(`${REST}/p0_members?select=seat&code=eq.${encodeURIComponent(code)}&user_id=eq.${encodeURIComponent(String(payload.sub))}`, { headers: H });
    const seatRows = await seatRes.json();
    if (!Array.isArray(seatRows) || !seatRows.length) return Response.json({ ok: false, error: "not seated" }, { status: 403 });
    const seat = seatRows[0].seat;
    const t2 = performance.now();
    const r = await fetch(`${REST}/rpc/p0_apply`, { method: "POST", headers: H, body: JSON.stringify({ p_code: code, p_expected: Number(body.expected), p_kind: "play", p_body: { seat, card: body.card ?? null, client_sent: body.sent ?? null } }) });
    const v = await r.json();
    const t3 = performance.now();
    if (typeof v !== "number") return Response.json({ ok: false, error: JSON.stringify(v).slice(0, 160) }, { status: 500 });
    return Response.json({ ok: v >= 0, version: v, seat, verifyMs: +(t1 - t0).toFixed(1), seatMs: +(t2 - t1).toFixed(1), applyMs: +(t3 - t2).toFixed(1), totalMs: +(t3 - t0).toFixed(1) });
  } catch (e) {
    return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 401 });
  }
});
