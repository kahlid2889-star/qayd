import { createClient } from "@supabase/supabase-js";
import { newUser, localJwt, sql, sleep, API } from "../common.mjs";
const anon = await localJwt("anon"), service = await localJwt("service_role");
const code = "FRM" + Math.floor(Math.random()*900+100);
const us = []; for (let i=0;i<3;i++) us.push(await newUser(i));
for (const [i,u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code,u.id,i]);
const got=[0,0,0], frames=[[],[],[]], sent=[[],[],[]]; 
const cls = us.map((u)=>{ const c = createClient(API, anon, { auth:{persistSession:false,autoRefreshToken:false} }); c.realtime.setAuth(u.token); return c; });
for (let i=0;i<3;i++){
  await new Promise((res)=>{ const ch = cls[i].channel(`room:${code}:seat:${i}`, { config:{ private:true } }); ch.on("broadcast",{event:"deal"},()=>got[i]++);
    ch.subscribe((s)=>{ if(["SUBSCRIBED","CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(s)) res(); }); });
  const conn = cls[i].realtime.conn; conn.addEventListener("message",(e)=>{ try{ const m=JSON.parse(e.data); if(m.event!=="phx_reply"&&m.event!=="presence_state"&&m.event!=="system") frames[i].push(m.event+":"+(m.payload?.event||"")); }catch{} });
  const origSend = conn.send.bind(conn); conn.send = (d)=>{ try{ const m=JSON.parse(d); if(m.event==="phx_join"||m.event==="access_token") sent[i].push(m.event); }catch{} return origSend(d); };
  await sleep(200);
}
for (let n=0;n<3;n++){ await fetch(`${API}/realtime/v1/api/broadcast`, { method:"POST", headers:{ "content-type":"application/json", authorization:`Bearer ${service}`, apikey: service }, body: JSON.stringify({ messages: [0,1,2].map(s=>({ topic:`room:${code}:seat:${s}`, event:"deal", payload:{n}, private:true })) }) }); await sleep(80); }
await sleep(1500);
console.log("handler counts:", got.join(","));
frames.forEach((f,i)=>console.log("client",i,"frames reaching socket after attach:", f.join(",")||"(none)"));
const c0 = cls[0].realtime; console.log("channels on client0:", c0.channels.map(c=>c.topic+":"+c.state).join(" "));
process.exit(0);
