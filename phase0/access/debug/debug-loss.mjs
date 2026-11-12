import { newUser, localJwt, realtimeClient, join, sql, sleep } from "../common.mjs";
const anon = await localJwt("anon"); const code = "LOS" + Math.floor(Math.random()*900+100);
const us = []; for (let i=0;i<4;i++) us.push(await newUser(i));
for (const [i,u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code,u.id,i]);
const got = [[],[],[],[]]; const cls = us.map((u)=>realtimeClient(anon,u.token));
for (let i=0;i<4;i++) await join(cls[i], `room:${code}:seat:${i}`, { deal: (p)=>got[i].push(p.hand) });
// Round 1: one transaction, 4 sends (what p0_deal does)
await sql("select p0_deal($1)", [code]); await sleep(1500);
console.log("1 tx x4 sends   :", got.map(g=>g.length));
// Round 2: each send in its own statement/transaction
for (let i=0;i<4;i++) await sql("select realtime.send(jsonb_build_object('hand','R2-'||$2::text),'deal',$1,true)", [`room:${code}:seat:${i}`, i]);
await sleep(1500); console.log("separate tx     :", got.map(g=>g.length));
// Round 3: 20 rapid sends to seat 0 from one transaction
await sql("select realtime.send(jsonb_build_object('hand','R3-'||g),'deal',$1,true) from generate_series(1,20) g", [`room:${code}:seat:0`]); await sleep(1500);
console.log("20 sends seat 0 :", got[0].length - 2, "of 20");
// Round 4: warm path — repeat round 1
got.forEach(g=>g.length=0); await sql("select p0_deal($1)", [code]); await sleep(1500); console.log("1 tx x4 again   :", got.map(g=>g.length));
process.exit(0);
