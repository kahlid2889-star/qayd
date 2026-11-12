import { newUser, localJwt, realtimeClient, join, sql, sleep } from "../common.mjs";
const anon = await localJwt("anon");
async function trial(label, prep) {
  const code = "WRM" + Math.floor(Math.random()*900+100);
  const us = []; for (let i=0;i<4;i++) us.push(await newUser(i));
  for (const [i,u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code,u.id,i]);
  const got=[0,0,0,0]; const cls = us.map((u)=>realtimeClient(anon,u.token));
  await prep(code, cls);
  for (let i=0;i<4;i++) { await join(cls[i], `room:${code}:seat:${i}`, { deal: ()=>got[i]++ }); await sleep(200); }
  await sql("select p0_deal($1)", [code]); await sleep(1500);
  console.log(label.padEnd(44), "received per seat:", got.join(","));
  cls.forEach(c=>c.realtime.disconnect());
}
await trial("baseline (no warm-up)", async()=>{});
await trial("warm-up: seat0 user joins table first", async (code, cls)=>{ await join(cls[0], `room:${code}:table`, {}); await sleep(300); });
await trial("sleep 4s after joins before sending", async()=>{});
process.exit(0);
