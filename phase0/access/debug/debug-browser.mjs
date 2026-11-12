import { chromium } from "playwright";
import { newUser, localJwt, sql, sleep, API } from "../common.mjs";
const anon = await localJwt("anon"), service = await localJwt("service_role");
const code = "BRW" + Math.floor(Math.random()*900+100);
const us = []; for (let i=0;i<3;i++) us.push(await newUser(i));
for (const [i,u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code,u.id,i]);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const page = await b.newPage();
await page.goto("about:blank");
await page.addScriptTag({ path: "/home/user/qayd/node_modules/@supabase/supabase-js/dist/umd/supabase.js" });
const got = await page.evaluate(async ({ API, anon, tokens, code }) => {
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms)); const counts=window.__counts=[0,0,0];
  const clients = tokens.map((t)=>{ const c = supabase.createClient(API, anon, { auth:{persistSession:false,autoRefreshToken:false} }); c.realtime.setAuth(t); return c; });
  for (let i=0;i<3;i++) { await new Promise((res)=>{ const ch = clients[i].channel(`room:${code}:seat:${i}`, { config:{ private:true, broadcast:{ self:false } } }); ch.on("broadcast",{event:"deal"},()=>counts[i]++); ch.subscribe((s)=>{ if(["SUBSCRIBED","CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(s)) res(); }); }); await sleep(200); }
  return counts;
}, { API, anon, tokens: us.map(u=>u.token), code });
console.log("joined in browser; now sending 5 broadcasts…");
for (let n=0;n<5;n++){ await fetch(`${API}/realtime/v1/api/broadcast`, { method:"POST", headers:{ "content-type":"application/json", authorization:`Bearer ${service}`, apikey: service }, body: JSON.stringify({ messages: [0,1,2].map(s=>({ topic:`room:${code}:seat:${s}`, event:"deal", payload:{n}, private:true })) }) }); await sleep(80); }
await sleep(1500);
console.log("browser supabase-js received per seat (of 5):", JSON.stringify(await page.evaluate(()=>window.__counts)));
await b.close(); process.exit(0);
