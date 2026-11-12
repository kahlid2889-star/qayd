import { newUser, localJwt, realtimeClient, sql, sleep } from "../common.mjs";
const anon = await localJwt("anon");
const A = await newUser(1);
function j(c, topic, ms=4000) { return new Promise((res)=>{ const ch = c.channel(topic, { config:{ private:true } }); ch.on("broadcast",{event:"x"},()=>{}); const t=setTimeout(()=>res("TIMEOUT"),ms); ch.subscribe((s)=>{ if(["SUBSCRIBED","CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(s)){clearTimeout(t);res(s);} }); }); }
async function trial(label, fn) { const code = "TW2" + Math.floor(Math.random()*900+100); await sql("insert into p0_members(code,user_id,seat) values($1,$2,0) on conflict (code,user_id) do nothing", [code, A.id]); const r = await fn(code); console.log(label.padEnd(46), JSON.stringify(r)); }
await trial("(a) table alone, awaited setAuth", async (c)=>{ const cl = await realtimeClient(anon, A.token); const r = await j(cl, `room:${c}:table`); cl.realtime.disconnect(); return r; });
await trial("(b) seat then table", async (c)=>{ const cl = await realtimeClient(anon, A.token); const r=[await j(cl, `room:${c}:seat:0`), await j(cl, `room:${c}:table`)]; cl.realtime.disconnect(); return r; });
await trial("(c) table then seat", async (c)=>{ const cl = await realtimeClient(anon, A.token); const r=[await j(cl, `room:${c}:table`), await j(cl, `room:${c}:seat:0`)]; cl.realtime.disconnect(); return r; });
await trial("(d) seat, re-await setAuth, then table", async (c)=>{ const cl = await realtimeClient(anon, A.token); const a = await j(cl, `room:${c}:seat:0`); await cl.realtime.setAuth(A.token); const b = await j(cl, `room:${c}:table`); cl.realtime.disconnect(); return [a,b]; });
await trial("(e) two sockets, one channel each", async (c)=>{ const c1 = await realtimeClient(anon, A.token), c2 = await realtimeClient(anon, A.token); const r=[await j(c1, `room:${c}:seat:0`), await j(c2, `room:${c}:table`)]; c1.realtime.disconnect(); c2.realtime.disconnect(); return r; });
process.exit(0);
