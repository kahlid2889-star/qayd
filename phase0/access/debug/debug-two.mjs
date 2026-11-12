import { newUser, localJwt, realtimeClient, sql, sleep } from "../common.mjs";
const anon = await localJwt("anon"); const code = "TWO" + Math.floor(Math.random()*900+100);
const A = await newUser(1); await sql("insert into p0_members(code,user_id,seat) values($1,$2,0)", [code, A.id]);
const c = await realtimeClient(anon, A.token);
function j(topic) { return new Promise((res)=>{ const ch = c.channel(topic, { config:{ private:true } }); ch.on("broadcast",{event:"x"},()=>{}); const t=setTimeout(()=>res(["TIMEOUT"]),5000); ch.subscribe((s,e)=>{ if(["SUBSCRIBED","CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(s)){clearTimeout(t);res([s, e && (e.message||JSON.stringify(e))]);} }); }); }
console.log("seat :", await j(`room:${code}:seat:0`));
console.log("table:", await j(`room:${code}:table`));
console.log("table (second attempt, new channel name):", await j(`room:${code}:table`));
process.exit(0);
