import { createClient } from "@supabase/supabase-js";
import { newUser, localJwt, sql, sleep, API } from "../common.mjs";
const anon = await localJwt("anon"), service = await localJwt("service_role");
const code = "WSX" + Math.floor(Math.random()*900+100);
const us = []; for (let i=0;i<3;i++) us.push(await newUser(i));
for (const [i,u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code,u.id,i]);
const got=[0,0,0]; const cls = us.map((u)=>{ const c = createClient(API, anon, { accessToken: async () => u.token }); return c; });
for (let i=0;i<3;i++){ await new Promise((res)=>{ const ch = cls[i].channel(`room:${code}:seat:${i}`, { config:{ private:true } }); ch.on("broadcast",{event:"deal"},()=>got[i]++); ch.subscribe((s)=>{ if(["SUBSCRIBED","CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(s)) res(); }); }); await sleep(200); }
for (let n=0;n<5;n++){ await fetch(`${API}/realtime/v1/api/broadcast`, { method:"POST", headers:{ "content-type":"application/json", authorization:`Bearer ${service}`, apikey: service }, body: JSON.stringify({ messages: [0,1,2].map(s=>({ topic:`room:${code}:seat:${s}`, event:"deal", payload:{n}, private:true })) }) }); await sleep(80); }
await sleep(1500); console.log("node supabase-js with accessToken option per seat (of 5):", got.join(",")); process.exit(0);
