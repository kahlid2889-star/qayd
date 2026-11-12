import { newUser, localJwt, realtimeClient, join, sql, sleep } from "../common.mjs";
const anon = await localJwt("anon");
for (const order of [[3,2,1,0],[1,3,0,2],[0,1,2,3]]) {
  const code = "ORD" + Math.floor(Math.random()*900+100);
  const us = []; for (let i=0;i<4;i++) us.push(await newUser(i));
  for (const [i,u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code,u.id,i]);
  const got = [0,0,0,0]; const cls = us.map((u)=>realtimeClient(anon,u.token));
  for (const i of order) { await join(cls[i], `room:${code}:seat:${i}`, { deal: ()=>got[i]++ }); await sleep(300); }
  await sql("select p0_deal($1)", [code]); await sleep(1500);
  console.log("join order", order.join(""), "-> received per seat", got.join(","));
  cls.forEach(c=>c.realtime.disconnect());
}
process.exit(0);
