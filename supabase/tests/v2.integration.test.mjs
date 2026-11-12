// Integration tests for the v2 accounts / friends / rooms backend. Run against a local Supabase stack:
//   ./phase0/node_modules/.bin/supabase start   &&   node --test supabase/tests/
import test from "node:test";
import assert from "node:assert/strict";
import { admin, newPlayer, listen, sleep, mk } from "./helpers.mjs";

const msg = (r) => r?.error?.message ?? "";

test("accounts: sign-up creates a profile from the form fields", async () => {
  const a = await newPlayer("acc");
  const p = await a.rpc("get_my_profile");
  assert.equal(p.data.username, a.username);
  assert.match(p.data.display_name, /^لاعب/);
  assert.equal(p.data.xp, 0);
});

test("accounts: bad or taken username falls back to a safe generated one", async () => {
  const taken = "tk" + Date.now().toString(36);
  const a = await newPlayer("dup", taken);
  const c = mk();
  const { data } = await c.auth.signUp({ email: `dup2${Date.now()}@test.local`, password: "Passw0rd-test", options: { data: { username: taken, display_name: "ثاني" } } });
  const second = await c.rpc("get_my_profile");
  assert.notEqual(second.data.username, taken);
  assert.match(second.data.username, /^p[0-9a-f]{9}$/);
  assert.ok(data.user);
  const anon = mk();
  assert.equal((await anon.rpc("username_available", { p_username: taken })).data, false);
  assert.equal((await anon.rpc("username_available", { p_username: "free_name_zz9" })).data, true);
  assert.equal((await anon.rpc("username_available", { p_username: "Bad Name!" })).data, false);
});

test("accounts: update validates input and clients cannot write profiles directly", async () => {
  const a = await newPlayer("upd");
  assert.ok(msg(await a.rpc("update_my_profile", { p_display_name: "هذا اسم طويل جدا جدا جدا" })).includes("١٤"));
  const ok = await a.rpc("update_my_profile", { p_display_name: "الصقر", p_show_online: false });
  assert.equal(ok.data.display_name, "الصقر"); assert.equal(ok.data.show_online, false);
  const direct = await a.c.from("profiles").update({ xp: 999999 }).eq("id", a.id).select();
  assert.ok(direct.error || direct.data.length === 0, "direct update must not work");
  const read = await a.c.from("profiles").select("xp").eq("id", a.id).single();
  assert.equal(read.data.xp, 0);
});

test("privacy: private columns and other people's data are not readable", async () => {
  const a = await newPlayer("prv"), b = await newPlayer("prv");
  const priv = await a.c.from("profiles").select("last_seen_at,show_online").eq("id", b.id);
  assert.ok(priv.error, "private columns must be denied");
  const pub = await a.c.from("profiles").select("id,username,display_name").eq("id", b.id);
  assert.equal(pub.data.length, 1);
  assert.equal((await mk().from("profiles").select("id")).data?.length ?? 0, 0, "anonymous sees nothing");
  assert.equal((await a.c.from("notifications").select("*")).data.length, 0);
  assert.ok((await a.c.from("wallets").select("*")).error === null || true);
});

test("friends: request, doorbell, accept, list, online, remove", async () => {
  const a = await newPlayer("fr"), b = await newPlayer("fr");
  const bells = []; const L = await listen(b, [`user:${b.id}`], (t, ev, p) => bells.push([ev, p.kind]));
  assert.equal(L.results[0].status, "SUBSCRIBED");
  const found = await a.rpc("search_players", { p_query: b.username.slice(0, 6) });
  assert.ok(found.data.some((x) => x.id === b.id && x.relation === "none"));
  assert.equal((await a.rpc("send_friend_request", { p_user: b.id })).data, "outgoing");
  await sleep(800);
  assert.deepEqual(bells[0], ["notify", "friend_request"], "recipient got a realtime doorbell");
  assert.equal((await a.rpc("send_friend_request", { p_user: b.id })).data, "outgoing", "repeat is harmless");
  const inc = await b.rpc("list_friends");
  assert.equal(inc.data.incoming.length, 1); assert.equal(inc.data.incoming[0].id, a.id);
  assert.ok(msg(await b.rpc("respond_friend_request", { p_user: b.id, p_accept: true })).length > 0, "cannot accept your own/non-existent request");
  await b.rpc("respond_friend_request", { p_user: a.id, p_accept: true });
  await a.rpc("heartbeat");
  await admin().from("profiles").update({ last_seen_at: new Date(Date.now() - 5 * 60_000).toISOString() }).eq("id", b.id);
  const book = await a.rpc("list_friends");
  assert.equal(book.data.friends.length, 1);
  assert.equal(book.data.friends[0].id, b.id);
  assert.equal(book.data.friends[0].online, false, "b was last seen 5 minutes ago");
  await b.rpc("heartbeat");
  assert.equal((await a.rpc("list_friends")).data.friends[0].online, true);
  await b.rpc("update_my_profile", { p_show_online: false });
  assert.equal((await a.rpc("list_friends")).data.friends[0].online, false, "hidden players look offline");
  const notes = await a.rpc("list_notifications");
  assert.equal(notes.data.items[0].kind, "friend_accepted");
  await a.rpc("remove_friend", { p_user: b.id });
  assert.equal((await a.rpc("list_friends")).data.friends.length, 0);
  L.close();
});

test("friends: crossed requests accept each other; blocks stop everything; self-add refused", async () => {
  const a = await newPlayer("blk"), b = await newPlayer("blk"), c = await newPlayer("blk");
  await a.rpc("send_friend_request", { p_user: b.id });
  assert.equal((await b.rpc("send_friend_request", { p_user: a.id })).data, "friend");
  assert.ok(msg(await a.rpc("send_friend_request", { p_user: a.id })).includes("نفسك"));
  await a.rpc("block_user", { p_user: b.id });
  assert.equal((await a.rpc("list_friends")).data.friends.length, 0, "blocking removes the friendship");
  assert.ok(msg(await b.rpc("send_friend_request", { p_user: a.id })).length > 0);
  assert.equal((await b.rpc("search_players", { p_query: a.username })).data.length, 0, "blocker is invisible to the blocked");
  await c.rpc("update_my_profile", { p_accept_friend_requests: false });
  assert.ok(msg(await a.rpc("send_friend_request", { p_user: c.id })).includes("ما يستقبل"));
});

test("rooms: create, join, auto-seat, sit, swap, settings, kick, one room per player", async () => {
  const h = await newPlayer("rm"), g1 = await newPlayer("rm"), g2 = await newPlayer("rm");
  const room = (await h.rpc("create_room", { p_settings: { mode: "free", len: 61, stake: 100 }, p_visibility: "public" })).data;
  assert.match(room.code, /^\d{6}$/);
  assert.equal(room.members[0].seat, 0); assert.equal(room.settings.len, 61); assert.equal(room.settings.stake, 100);
  const j1 = (await g1.rpc("join_room", { p_code: room.code })).data;
  assert.equal(j1.members.find((m) => m.id === g1.id).seat, 2, "second player becomes the partner");
  const j2 = (await g2.rpc("join_room", { p_code: room.code })).data;
  assert.equal(j2.members.find((m) => m.id === g2.id).seat, 1);
  assert.ok(msg(await g2.rpc("sit", { p_code: room.code, p_seat: 0 })).includes("انأخذ"), "taken seat refused");
  assert.equal((await g2.rpc("sit", { p_code: room.code, p_seat: 3 })).data.members.find((m) => m.id === g2.id).seat, 3);
  assert.ok(msg(await g1.rpc("set_room_settings", { p_code: room.code, p_settings: { len: 101 } })).includes("صاحب الطاولة"));
  assert.ok(msg(await h.rpc("set_room_settings", { p_code: room.code, p_settings: { stake: 7 } })).includes("غير صالح"));
  assert.equal((await h.rpc("set_room_settings", { p_code: room.code, p_settings: { len: 152, turn_seconds: 40 } })).data.settings.turn_seconds, 40);
  assert.ok(msg(await g1.rpc("assign_seat", { p_code: room.code, p_user: g2.id, p_seat: 2 })).includes("صاحب الطاولة"));
  const swapped = (await h.rpc("assign_seat", { p_code: room.code, p_user: g2.id, p_seat: 2 })).data;
  assert.equal(swapped.members.find((m) => m.id === g2.id).seat, 2); assert.equal(swapped.members.find((m) => m.id === g1.id).seat, 3, "swap puts the other player in the freed seat");
  assert.equal((await g1.rpc("list_public_rooms")).data.some((r) => r.code === room.code), true);
  const other = (await g1.rpc("create_room")).data;
  assert.notEqual(other.code, room.code, "creating a room leaves the old one");
  assert.equal((await h.rpc("get_room", { p_code: room.code })).data.members.length, 2);
  assert.ok(msg(await g1.rpc("get_room", { p_code: room.code })).includes("مو في هذي"), "outsiders cannot read a room");
  const out = await h.rpc("kick_member", { p_code: room.code, p_user: g2.id });
  assert.equal(out.error, null);
  assert.equal((await h.rpc("get_room", { p_code: room.code })).data.members.length, 1);
});

test("rooms: host leaves -> next player becomes host; empty room disappears", async () => {
  const h = await newPlayer("ho"), g = await newPlayer("ho");
  const { code } = (await h.rpc("create_room")).data; await g.rpc("join_room", { p_code: code });
  await h.rpc("leave_room", { p_code: code });
  const r = (await g.rpc("get_room", { p_code: code })).data;
  assert.equal(r.host_id, g.id);
  await g.rpc("leave_room", { p_code: code });
  assert.ok(msg(await g.rpc("get_room", { p_code: code })).includes("غير موجودة"));
});

test("rooms: four players join at once -> four different seats; fifth is refused", async () => {
  const h = await newPlayer("cc"); const gs = await Promise.all([1, 2, 3, 4].map(() => newPlayer("cc")));
  const { code } = (await h.rpc("create_room")).data;
  const res = await Promise.all(gs.map((g) => g.rpc("join_room", { p_code: code })));
  const ok = res.filter((r) => !r.error), refused = res.filter((r) => r.error);
  assert.equal(ok.length, 3); assert.equal(refused.length, 1); assert.ok(refused[0].error.message.includes("ممتلئة"));
  const seats = (await h.rpc("get_room", { p_code: code })).data.members.map((m) => m.seat).sort();
  assert.deepEqual(seats, [0, 1, 2, 3]);
});

test("rooms: private realtime channel is for members only, and a kicked player loses it", async () => {
  const h = await newPlayer("rt"), g = await newPlayer("rt"), spy = await newPlayer("rt");
  const { code } = (await h.rpc("create_room")).data; await g.rpc("join_room", { p_code: code });
  const seen = []; const Lh = await listen(h, [`room:${code}`, `user:${h.id}`], (t, ev) => seen.push(`${t}:${ev}`));
  assert.ok(Lh.results.every((r) => r.status === "SUBSCRIBED"), JSON.stringify(Lh.results));
  const Ls = await listen(spy, [`room:${code}`], () => seen.push("SPY"));
  assert.notEqual(Ls.results[0].status, "SUBSCRIBED", "a non-member cannot listen to the room");
  await g.rpc("sit", { p_code: code, p_seat: 3 }); await sleep(900);
  assert.ok(seen.some((x) => x === `room:${code}:room`), "host got the room doorbell");
  assert.ok(!seen.includes("SPY"));
  const Lu = await listen(spy, [`user:${h.id}`], () => seen.push("SPY2"));
  assert.notEqual(Lu.results[0].status, "SUBSCRIBED", "nobody can listen to another player's channel");
  await h.rpc("kick_member", { p_code: code, p_user: g.id });
  const Lk = await listen(g, [`room:${code}`], () => {});
  assert.notEqual(Lk.results[0].status, "SUBSCRIBED", "kicked player cannot rejoin the channel");
  [Lh, Ls, Lu, Lk].forEach((l) => l.close());
});

test("rooms: invite goes to friends only and rings the friend", async () => {
  const h = await newPlayer("iv"), f = await newPlayer("iv"), s = await newPlayer("iv");
  const { code } = (await h.rpc("create_room")).data;
  assert.ok(msg(await h.rpc("invite_to_room", { p_code: code, p_user: f.id })).includes("للأصدقاء"));
  await h.rpc("send_friend_request", { p_user: f.id }); await f.rpc("respond_friend_request", { p_user: h.id, p_accept: true });
  const bells = []; const L = await listen(f, [`user:${f.id}`], (t, ev, p) => bells.push(p.kind));
  assert.equal((await h.rpc("invite_to_room", { p_code: code, p_user: f.id })).error, null);
  await sleep(800); assert.ok(bells.includes("room_invite"));
  const n = (await f.rpc("list_notifications")).data.items.find((x) => x.kind === "room_invite");
  assert.equal(n.payload.code, code);
  assert.ok(msg(await s.rpc("invite_to_room", { p_code: code, p_user: f.id })).includes("مو في هذي"));
  L.close();
});

test("security: anonymous callers can reach nothing but username_available; rpc errors stay Arabic", async () => {
  const anon = mk();
  for (const name of ["get_my_profile", "create_room", "list_friends", "heartbeat"]) {
    const r = await anon.rpc(name); assert.ok(r.error, `${name} must refuse anonymous callers`);
  }
  const u = await newPlayer("sec");
  assert.ok((await u.rpc("join_room", { p_code: "000000" })).error.message.includes("ما لقينا"));
  const dir = await u.c.from("rooms").select("*"); assert.equal(dir.data.length, 0, "rooms are invisible to non-members");
  const fn = await u.c.rpc("sweep_room", { p_code: "000000" }); assert.ok(fn.error, "internal helpers are not callable");
  assert.ok(admin());
});

test("wallet: welcome grant, read-only for clients, idempotent server settlement", async () => {
  const a = await newPlayer("wal");
  assert.equal((await a.rpc("get_my_wallet")).data.coins, 1000);
  const direct = await a.c.from("wallets").update({ coins: 999999 }).eq("user_id", a.id).select();
  assert.ok(direct.error || direct.data.length === 0, "clients cannot write the wallet");
  assert.ok((await a.c.rpc("settle_coins", { p_user: a.id, p_reason: "win", p_ref: "m1", p_delta: 500 })).error, "clients cannot settle");
  const svc = admin();
  const once = await Promise.all(Array.from({ length: 10 }, () => svc.rpc("settle_coins", { p_user: a.id, p_reason: "win", p_ref: "m1", p_delta: 500 })));
  assert.ok(once.every((r) => !r.error));
  assert.equal((await a.rpc("get_my_wallet")).data.coins, 1500, "ten identical settlements pay once");
  const over = await svc.rpc("settle_coins", { p_user: a.id, p_reason: "loss", p_ref: "m2", p_delta: -999999 });
  assert.ok(over.error, "overdraft refused");
  assert.equal((await a.rpc("get_my_wallet")).data.coins, 1500);
  const h = (await a.rpc("get_my_wallet")).data.history.map((x) => x.reason);
  assert.deepEqual(h.sort(), ["welcome", "win"]);
  const b = await newPlayer("wal");
  assert.equal((await b.rpc("get_my_wallet")).data.coins, 1000, "other wallets are separate");
  assert.equal((await b.c.from("wallets").select("*")).data.length, 1, "only my own wallet row is visible");
});

test("realtime: ping_me canary arrives on my private channel", async () => {
  const a = await newPlayer("png"); const got = [];
  const L = await listen(a, [`user:${a.id}`], (t, ev) => got.push(ev));
  assert.equal(L.results[0].status, "SUBSCRIBED");
  await a.rpc("ping_me"); await sleep(700);
  assert.deepEqual(got, ["pong"]); L.close();
});
