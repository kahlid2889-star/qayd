import { newUser, localJwt, realtimeClient, join, sql, sleep } from "../common.mjs";
const anon = await localJwt("anon");
async function trial(label, fn) {
  const code = "VAR" + Math.floor(Math.random()*900+100);
  const us = []; for (let i=0;i<3;i++) us.push(await newUser(i));
  for (const [i,u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code,u.id,i]);
  const got=[0,0,0]; const cls = us.map((u)=>realtimeClient(anon,u.token));
  await fn(code, cls, got);
  await sql("select realtime.send(jsonb_build_object('n',1),'deal','room:'||$1||':seat:'||g,true) from generate_series(0,2) g", [code]); await sleep(1500);
  console.log(label.padEnd(52), got.join(","));
  cls.forEach(c=>c.realtime.disconnect());
}
const seat = (code, cls, got, i) => join(cls[i], `room:${code}:seat:${i}`, { deal: ()=>got[i]++ });
await trial("A. plain sequential joins", async (c,cl,g)=>{ for (let i=0;i<3;i++){ await seat(c,cl,g,i); await sleep(200);} });
await trial("B. first channel joined, wait 4s, then others", async (c,cl,g)=>{ await seat(c,cl,g,0); await sleep(4000); await seat(c,cl,g,1); await seat(c,cl,g,2); });
await trial("C. dummy sacrificial channel first (same socket user0)", async (c,cl,g)=>{ await join(cl[0], `room:${c}:table`, {}); await sleep(300); for (let i=0;i<3;i++){ await seat(c,cl,g,i); await sleep(200);} });
await trial("D. all joined concurrently", async (c,cl,g)=>{ await Promise.all([0,1,2].map(i=>seat(c,cl,g,i))); });
await trial("E. first channel left and re-joined", async (c,cl,g)=>{ const r = await seat(c,cl,g,0); await r.ch.unsubscribe(); await sleep(300); await seat(c,cl,g,0); await seat(c,cl,g,1); await seat(c,cl,g,2); });
await trial("F. A repeated (is it stable?)", async (c,cl,g)=>{ for (let i=0;i<3;i++){ await seat(c,cl,g,i); await sleep(200);} });
process.exit(0);
