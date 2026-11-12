import { newUser, localJwt, realtimeClient, join, sql, sleep, API } from "../common.mjs";
const anon = await localJwt("anon"), service = await localJwt("service_role");
async function trial(label, send) {
  const code = "RBC" + Math.floor(Math.random()*900+100);
  const us = []; for (let i=0;i<3;i++) us.push(await newUser(i));
  for (const [i,u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code,u.id,i]);
  const got=[0,0,0]; const cls = us.map((u)=>realtimeClient(anon,u.token));
  for (let i=0;i<3;i++){ await join(cls[i], `room:${code}:seat:${i}`, { deal: ()=>got[i]++ }); await sleep(200); }
  for (let n=0;n<10;n++) { await send(code); await sleep(60); } await sleep(1500);
  console.log(label.padEnd(46), "per seat (of 10):", got.join(","));
  cls.forEach(c=>c.realtime.disconnect());
}
await trial("DB path: realtime.send()", async (code)=>{ await sql("select realtime.send(jsonb_build_object('n',1),'deal','room:'||$1||':seat:'||g,true) from generate_series(0,2) g",[code]); });
await trial("HTTP path: POST /realtime/v1/api/broadcast", async (code)=>{
  const r = await fetch(`${API}/realtime/v1/api/broadcast`, { method:"POST", headers:{ "content-type":"application/json", authorization:`Bearer ${service}`, apikey: service },
    body: JSON.stringify({ messages: [0,1,2].map(s=>({ topic:`room:${code}:seat:${s}`, event:"deal", payload:{n:1}, private:true })) }) });
  if (r.status >= 300) console.log("   http", r.status, await r.text());
});
await trial("HTTP path again", async (code)=>{
  await fetch(`${API}/realtime/v1/api/broadcast`, { method:"POST", headers:{ "content-type":"application/json", authorization:`Bearer ${service}`, apikey: service },
    body: JSON.stringify({ messages: [0,1,2].map(s=>({ topic:`room:${code}:seat:${s}`, event:"deal", payload:{n:1}, private:true })) }) });
});
process.exit(0);
