const Native = globalThis.WebSocket; const log = [];
globalThis.WebSocket = class extends Native { send(d){ if (typeof d !== "string") log.push("BINARY frame " + d.byteLength); if (typeof d === "string") { try { let m = JSON.parse(d); if (Array.isArray(m)) m = { join_ref:m[0], ref:m[1], topic:m[2], event:m[3], payload:m[4] }; if (m.event === "phx_join" || m.event==="access_token") log.push(m.event + " " + JSON.stringify({ topic: m.topic, config: m.payload?.config, tok: !!m.payload?.access_token, ref: m.ref })); } catch {} } return super.send(d); } };
const { createClient } = await import("@supabase/supabase-js");
const { newUser, localJwt, sql, sleep, API } = await import("../common.mjs");
const anon = await localJwt("anon");
const code = "JPL" + Math.floor(Math.random()*900+100);
const us = []; for (let i=0;i<2;i++) us.push(await newUser(i));
for (const [i,u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code,u.id,i]);
for (let i=0;i<2;i++){ const c = createClient(API, anon, { accessToken: async()=>us[i].token });
  await new Promise((res)=>{ const ch = c.channel(`room:${code}:seat:${i}`, { config:{ private:true } }); ch.on("broadcast",{event:"deal"},()=>{}); ch.subscribe((s)=>{ if(["SUBSCRIBED","CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(s)) res(); }); }); await sleep(200); }
console.log(log.join("\n")); process.exit(0);
