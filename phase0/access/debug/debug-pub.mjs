import { newUser, localJwt, realtimeClient, sql, sleep, API } from "../common.mjs";
const anon = await localJwt("anon"), service = await localJwt("service_role");
function joinMode(client, topic, priv, onDeal) { return new Promise((res)=>{ const ch = client.channel(topic, { config: { private: priv } }); ch.on("broadcast",{event:"deal"},()=>onDeal()); const t=setTimeout(()=>res("TIMEOUT"),5000); ch.subscribe((s)=>{ if(["SUBSCRIBED","CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(s)){clearTimeout(t);res(s);} }); }); }
async function trial(label, priv, setup) {
  const code = "PUB" + Math.floor(Math.random()*900+100);
  const us = []; for (let i=0;i<3;i++) us.push(await newUser(i));
  for (const [i,u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code,u.id,i]);
  const got=[0,0,0]; const cls = us.map((u)=>realtimeClient(anon,u.token));
  for (let i=0;i<3;i++){ await joinMode(cls[i], `room:${code}:seat:${i}`, priv, ()=>got[i]++); await sleep(200); }
  for (let n=0;n<5;n++){ await fetch(`${API}/realtime/v1/api/broadcast`, { method:"POST", headers:{ "content-type":"application/json", authorization:`Bearer ${service}`, apikey: service }, body: JSON.stringify({ messages: [0,1,2].map(s=>({ topic:`room:${code}:seat:${s}`, event:"deal", payload:{n:1}, private:priv })) }) }); await sleep(60); }
  await sleep(1500); console.log(label.padEnd(50), got.join(",")); cls.forEach(c=>c.realtime.disconnect());
}
await trial("public channels (no authorization at all)", false);
await sql("create policy p0_tmp_all on realtime.messages for select to authenticated using (true)");
await trial("private, permissive policy USING (true)", true);
await sql("drop policy p0_tmp_all on realtime.messages");
await trial("private, my membership policy", true);
process.exit(0);
