import { newUser, localJwt, realtimeClient, join, sql, sleep, API } from "./common.mjs";
const out = []; const check = (n, ok, d = "") => { out.push({ n, ok: !!ok, d }); console.log(ok ? "PASS" : "FAIL", n, d); };
const anon = await localJwt("anon");
const code = "ABC" + Math.floor(Math.random() * 900 + 100);
const users = []; for (let i = 0; i < 5; i++) users.push(await newUser(i));   // 4 players + 1 outsider
const [A, B, C, D, E] = users;
await sql("delete from p0_members where code=$1", [code]); await sql("delete from p0_state where code=$1", [code]);
for (const [i, u] of [A, B, C, D].entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code, u.id, i]);
await sql("insert into p0_state(code,state) values($1,$2)", [code, JSON.stringify({ hands: "SECRET" })]);

// ---- Data API (PostgREST) with the Better Auth JWT
const rest = (path, token) => fetch(`${API}/rest/v1/${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) }));
const anonRest = await rest("p0_state?select=*");
check("REST anon cannot read game state", (anonRest.s === 401 || anonRest.s === 403) || (Array.isArray(anonRest.b) && anonRest.b.length === 0), `status ${anonRest.s} rows ${Array.isArray(anonRest.b) ? anonRest.b.length : "-"}`);
const aState = await rest("p0_state?select=*", A.token);
check("REST player cannot read game state (hands)", (aState.s >= 400) || (Array.isArray(aState.b) && aState.b.length === 0), `status ${aState.s}`);
const aEvents = await rest("p0_events?select=*", A.token);
check("REST player cannot read events table", (aEvents.s >= 400) || (Array.isArray(aEvents.b) && aEvents.b.length === 0), `status ${aEvents.s}`);
const aMem = await rest("p0_members?select=*", A.token);
check("REST Better-Auth JWT is accepted (role authenticated)", aMem.s === 200, `status ${aMem.s}`);
check("REST player sees only their own membership (RLS on non-UUID sub)", Array.isArray(aMem.b) && aMem.b.length === 1 && aMem.b[0].user_id === A.id, JSON.stringify(aMem.b)?.slice(0, 90));
const eMem = await rest("p0_members?select=*", E.token);
check("REST outsider sees no memberships", Array.isArray(eMem.b) && eMem.b.length === 0);
const bad = await rest("p0_members?select=*", A.token.slice(0, -3) + "abc");
check("REST tampered JWT rejected", bad.s === 401 || bad.s === 403 || (bad.s >= 400), `status ${bad.s}`);
const wr = await fetch(`${API}/rest/v1/p0_members`, { method: "POST", headers: { authorization: `Bearer ${E.token}`, "content-type": "application/json" }, body: JSON.stringify({ code, user_id: E.id, seat: 9 }) });
check("REST player cannot insert themselves into a room", wr.status >= 400, `status ${wr.status}`);

// ---- Realtime private channels
const got = { A: [], B: [], C: [], D: [], tableC: [] };
const cl = { A: await realtimeClient(anon, A.token), B: await realtimeClient(anon, B.token), C: await realtimeClient(anon, C.token), D: await realtimeClient(anon, D.token), E: await realtimeClient(anon, E.token), anon: await realtimeClient(anon, anon) };
const seatTopic = (s) => `room:${code}:seat:${s}`, table = `room:${code}:table`;
const J = {}, T = {};
const tableHandlers = { dealt: (p) => got.tableC.push(p), table: (p) => got.tableC.push(p), chat: (p) => got.tableC.push({ chat: p }) };
const seatsOf = { A: [0, got.A], B: [1, got.B], C: [2, got.C], D: [3, got.D] };
await Promise.all(["A", "B", "C", "D"].map(async (k) => {
  const [s, bag] = seatsOf[k];
  [J[k], T[k]] = await Promise.all([join(cl[k], seatTopic(s), { deal: (p) => bag.push(p) }), join(cl[k], table, tableHandlers)]);
}));
check("players join their OWN seat channel", ["A", "B", "C", "D"].every((k) => J[k].status === "SUBSCRIBED"), ["A", "B", "C", "D"].map((k) => J[k].status).join(","));
check("seated players join the table channel too (2 channels on one socket)", ["A", "B", "C", "D"].every((k) => T[k].status === "SUBSCRIBED"), ["A", "B", "C", "D"].map((k) => T[k].status).join(","));
const stealer = await realtimeClient(anon, A.token); const steal = await join(stealer, seatTopic(1), {}, 4000); stealer.realtime.disconnect();
check("player CANNOT join another seat's channel", steal.status !== "SUBSCRIBED", steal.status + " " + (steal.err || ""));
const outsider = await join(cl.E, seatTopic(0), {}, 4000); cl.E.realtime.disconnect(); cl.E = await realtimeClient(anon, E.token);
check("outsider (valid JWT, not in room) cannot join a seat channel", outsider.status !== "SUBSCRIBED", outsider.status);
const outsiderTable = await join(cl.E, table, {}, 4000);
check("outsider cannot join the table channel", outsiderTable.status !== "SUBSCRIBED", outsiderTable.status);
const anonJoin = await join(cl.anon, seatTopic(0), {}, 4000); cl.anon.realtime.disconnect();
check("anonymous (publishable-key only) cannot join private channels", anonJoin.status !== "SUBSCRIBED", anonJoin.status);

// ---- Secrecy: server-side deal
await sql("select p0_deal($1)", [code]); await sleep(1500);
check("each player received exactly their own hand", got.A[0]?.hand === "HAND-OF-SEAT-0" && got.B[0]?.hand === "HAND-OF-SEAT-1" && got.C[0]?.hand === "HAND-OF-SEAT-2" && got.D[0]?.hand === "HAND-OF-SEAT-3", JSON.stringify([got.A[0]?.hand, got.B[0]?.hand, got.C[0]?.hand, got.D[0]?.hand]));
const leaks = JSON.stringify([got.A, got.B, got.C, got.D, got.tableC]);
check("no player ever received another seat's hand", !/HAND-OF-SEAT-1/.test(JSON.stringify(got.A)) && !/HAND-OF-SEAT-0/.test(JSON.stringify(got.B)) && !/HAND-OF-SEAT-[013]/.test(JSON.stringify(got.C)) && !/HAND-OF-SEAT-[012]/.test(JSON.stringify(got.D)));
check("public table event carries no hand", got.tableC.length >= 1 && !/HAND-OF/.test(JSON.stringify(got.tableC)), `${got.tableC.length} table msgs`);

// ---- Browser cannot publish
const before = got.tableC.length;
J.B.ch.send({ type: "broadcast", event: "chat", payload: { forged: "B plays A's card" } }); await sleep(1200);
check("a player's client cannot publish to the table channel (no INSERT policy)", got.tableC.length === before, `received ${got.tableC.length - before} forged`);
const rows = await sql("select count(*)::int n from realtime.messages where payload->>'forged' is not null").catch(() => [{ n: -1 }]);
check("forged broadcast not stored either", rows[0].n <= 0, `rows ${rows[0].n}`);

console.log(`\n${out.filter((x) => x.ok).length}/${out.length} passed`);
for (const c of Object.values(cl)) c.realtime.disconnect();
process.exit(out.every((x) => x.ok) ? 0 : 1);
