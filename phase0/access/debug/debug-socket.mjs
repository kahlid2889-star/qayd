import { newUser, localJwt, realtimeClient, join, sql, sleep, API } from "../common.mjs";
const anon = await localJwt("anon"), service = await localJwt("service_role");
async function trial(label, pre) {
  const code = "SKT" + Math.floor(Math.random()*900+100);
  const us = []; for (let i=0;i<3;i++) us.push(await newUser(i));
  for (const [i,u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code,u.id,i]);
  const extra = await pre(code, us);
  const got=[0,0,0]; const cls = us.map((u)=>realtimeClient(anon,u.token));
  for (let i=0;i<3;i++){ await join(cls[i], `room:${code}:seat:${i}`, { deal: ()=>got[i]++ }); await sleep(200); }
  for (let n=0;n<5;n++){ await fetch(`${API}/realtime/v1/api/broadcast`, { method:"POST", headers:{ "content-type":"application/json", authorization:`Bearer ${service}`, apikey: service }, body: JSON.stringify({ messages: [0,1,2].map(s=>({ topic:`room:${code}:seat:${s}`, event:"deal", payload:{n:1}, private:true })) }) }); await sleep(60); }
  await sleep(1500); console.log(label.padEnd(58), got.join(",")); cls.forEach(c=>c.realtime.disconnect()); extra?.realtime?.disconnect();
}
await trial("baseline", async()=>null);
await trial("extra PRIVATE channel by an unrelated 4th user first", async (code, us)=>{ const x = await newUser(9); await sql("insert into p0_members(code,user_id,seat) values($1,$2,7)", [code,x.id]); const c = realtimeClient(anon, x.token); await join(c, `room:${code}:seat:7`, {}); await sleep(500); return c; });
await trial("extra PRIVATE channel, same user, different room, first", async (code, us)=>{ const c = realtimeClient(anon, us[0].token); await sql("insert into p0_members(code,user_id,seat) values($1,$2,5) on conflict do nothing", ["ZZZ"+code,us[0].id]).catch(()=>{}); await join(c, `room:${code}:table`, {}); await sleep(500); return c; });
process.exit(0);
