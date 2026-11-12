import { newUser, localJwt, realtimeClient, join, sql, sleep } from "../common.mjs";
const anon = await localJwt("anon");
const N = 60, TR = 6; let totalSent = 0, totalGot = 0; const lostByJoinIdx = [0,0,0,0];
for (let t = 0; t < TR; t++) {
  const code = "LRT" + Math.floor(Math.random()*900+100);
  const us = []; for (let i=0;i<4;i++) us.push(await newUser(i));
  for (const [i,u] of us.entries()) await sql("insert into p0_members(code,user_id,seat) values($1,$2,$3)", [code,u.id,i]);
  const got=[new Set(),new Set(),new Set(),new Set()]; const cls = us.map((u)=>realtimeClient(anon,u.token));
  for (let i=0;i<4;i++) { await join(cls[i], `room:${code}:seat:${i}`, { deal: (p)=>got[i].add(p.n) }); await sleep(150); }
  for (let n=0;n<N;n++) { await sql("select realtime.send(jsonb_build_object('n',$2::int),'deal','room:'||$1||':seat:'||g,true) from generate_series(0,3) g", [code, n]); await sleep(40); }
  await sleep(2000);
  const per = got.map(g=>g.size); console.log(`trial ${t+1}: delivered per seat (of ${N}):`, per.join(","));
  per.forEach((v,i)=>{ lostByJoinIdx[i]+=N-v; totalGot+=v; totalSent+=N; });
  cls.forEach(c=>c.realtime.disconnect());
}
console.log(`overall delivery ${(100*totalGot/totalSent).toFixed(1)}%  lost by join position [1st..4th]:`, lostByJoinIdx.join(","));
process.exit(0);
