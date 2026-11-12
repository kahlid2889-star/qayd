import { newUser, localJwt, sql, sleep, API } from "../common.mjs";
const anon = await localJwt("anon"), service = await localJwt("service_role");
const code = "RAW" + Math.floor(Math.random()*900+100);
const us = []; for (let i=0;i<3;i++) us.push(await newUser(i));
for (const [i,u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code,u.id,i]);
const frames = [[],[],[]];
function open(i) { return new Promise((res)=>{ const ws = new WebSocket(`ws://127.0.0.1:54321/realtime/v1/websocket?apikey=${anon}&vsn=1.0.0`);
  ws.onmessage = (e)=>{ const m = JSON.parse(e.data); if (m.event !== "phx_reply" && m.event !== "presence_state") frames[i].push(m.event + ":" + JSON.stringify(m.payload).slice(0,50)); if (m.event==="phx_reply" && m.topic.includes("seat")) frames[i].push("reply:"+m.payload.status); };
  ws.onopen = ()=>{ ws.send(JSON.stringify({ topic:`realtime:room:${code}:seat:${i}`, event:"phx_join", payload:{ config:{ broadcast:{ self:false, ack:false }, presence:{ enabled:false, key:"" }, postgres_changes:[], private:true }, access_token: us[i].token }, ref:"1", join_ref:"1" })); res(ws); }; }); }
const socks = []; for (let i=0;i<3;i++) { socks.push(await open(i)); await sleep(300); }
await sleep(800);
if (process.env.PUSH) { socks.forEach((ws,i)=>ws.send(JSON.stringify({ topic:`realtime:room:${code}:seat:${i}`, event:'access_token', payload:{ access_token: us[i].token }, ref:'9', join_ref:'1' }))); await sleep(800); }
for (let n=0;n<3;n++){ await fetch(`${API}/realtime/v1/api/broadcast`, { method:"POST", headers:{ "content-type":"application/json", authorization:`Bearer ${service}`, apikey: service }, body: JSON.stringify({ messages: [0,1,2].map(s=>({ topic:`room:${code}:seat:${s}`, event:"deal", payload:{n}, private:true })) }) }); await sleep(100); }
await sleep(1500);
frames.forEach((f,i)=>console.log("raw socket", i, "->", f.filter(x=>x.startsWith("broadcast")).length, "broadcasts;", f.filter(x=>!x.startsWith("broadcast")).join(" | ").slice(0,120)));
process.exit(0);
