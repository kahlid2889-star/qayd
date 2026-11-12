import { createRemoteJWKSet, jwtVerify, decodeProtectedHeader, decodeJwt } from "jose";
const BASE = process.env.BA_ISSUER || "http://127.0.0.1:3999";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail); };

async function signUp(i) {
  const email = `p0-${Date.now()}-${i}@test.local`;
  const r = await fetch(`${BASE}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email, password: "pw-Test-12345", name: `لاعب${i}` }) });
  const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  const body = await r.json();
  return { email, cookie, id: body.user?.id, status: r.status };
}
async function token(cookie) {
  const r = await fetch(`${BASE}/api/auth/token`, { headers: { cookie, origin: BASE } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

const disc = await (await fetch(`${BASE}/.well-known/openid-configuration`)).json();
check("discovery has issuer + jwks_uri", disc.issuer === BASE && disc.jwks_uri.startsWith(BASE), JSON.stringify(disc.jwks_uri));

const a = await signUp(1), b = await signUp(2);
check("two accounts created", a.id && b.id && a.id !== b.id, `${a.id} / ${b.id}`);
check("user ids are NOT uuids (auth.uid() would fail)", !/^[0-9a-f-]{36}$/i.test(a.id), a.id);

const ta = await token(a.cookie), tb = await token(b.cookie);
check("token endpoint returns a JWT", ta.status === 200 && typeof ta.body.token === "string", `status ${ta.status}`);
const anon = await fetch(`${BASE}/api/auth/token`);
check("no session -> no token", anon.status === 401 || anon.status === 403 || !(await anon.json().catch(() => ({}))).token, `status ${anon.status}`);

const hdr = decodeProtectedHeader(ta.body.token), claims = decodeJwt(ta.body.token);
check("header: asymmetric alg + kid", hdr.alg === "ES256" && !!hdr.kid, JSON.stringify(hdr));
check("claim role = authenticated", claims.role === "authenticated", String(claims.role));
check("claim sub = Better Auth user id", claims.sub === a.id, String(claims.sub));
check("claim iss = discovery issuer", claims.iss === disc.issuer, String(claims.iss));
check("claim exp in the future (<= 1h)", claims.exp > Date.now() / 1000 && claims.exp - claims.iat <= 3600, `ttl ${claims.exp - claims.iat}s`);

const jwks = createRemoteJWKSet(new URL(disc.jwks_uri));
let verified = null;
try { verified = await jwtVerify(ta.body.token, jwks, { issuer: disc.issuer }); } catch (e) { verified = { error: String(e) }; }
check("signature verifies against the published JWKS", verified?.payload?.sub === a.id, verified?.error || "");
check("kid in JWKS matches token", (await (await fetch(disc.jwks_uri)).json()).keys.some((k) => k.kid === hdr.kid));

const tampered = ta.body.token.slice(0, -4) + (ta.body.token.endsWith("AAAA") ? "BBBB" : "AAAA");
let rejected = false; try { await jwtVerify(tampered, jwks, { issuer: disc.issuer }); } catch { rejected = true; }
check("tampered token is rejected", rejected);
let wrongIss = false; try { await jwtVerify(ta.body.token, jwks, { issuer: "http://evil" }); } catch { wrongIss = true; }
check("wrong issuer is rejected", wrongIss);
check("two users get different subs", decodeJwt(tb.body.token).sub === b.id && decodeJwt(tb.body.token).sub !== claims.sub);

const priv = (await (await fetch(disc.jwks_uri)).json()).keys.some((k) => k.d);
check("JWKS exposes no private material", !priv);
console.log(JSON.stringify({ summary: { pass: results.filter((r) => r.ok).length, fail: results.filter((r) => !r.ok).length }, tokenA: ta.body.token, tokenB: tb.body.token, jwks: await (await fetch(disc.jwks_uri)).json() }, null, 0).slice(0, 0));
import { writeFileSync } from "node:fs";
writeFileSync(new URL("./last-run.json", import.meta.url), JSON.stringify({ results, tokenA: ta.body.token, tokenB: tb.body.token, idA: a.id, idB: b.id, jwks: await (await fetch(disc.jwks_uri)).json() }, null, 1));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
