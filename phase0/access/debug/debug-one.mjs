import { newUser, localJwt, realtimeClient, join, sql, sleep } from "../common.mjs";
const anon = await localJwt("anon"); const code = "ONE" + Math.floor(Math.random()*900+100);
const us = []; for (let i=0;i<3;i++) us.push(await newUser(i));
for (const [i,u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code,u.id,i]);
const got=[0,0,0]; const cls = us.map((u)=>realtimeClient(anon,u.token));
for (let i=0;i<3;i++) { const r = await join(cls[i], `room:${code}:seat:${i}`, { deal: ()=>got[i]++ }); console.log("join", i, r.status); await sleep(200); }
console.log("T0", new Date().toISOString());
await sql("select realtime.send(jsonb_build_object('n',1),'deal','room:'||$1||':seat:'||g,true) from generate_series(0,2) g", [code]); await sleep(1500);
console.log("received:", got.join(","), "code", code);
process.exit(0);
