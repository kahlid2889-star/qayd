import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { levelFromXp, roomCuts, roomEvalXp, settleMatch, stageLabel, threshold, clampCutReport, type SettleInput } from "@/lib/qayd/xp";
import { serverDeck } from "@/lib/qayd/deck";
import { activityOf, countField, isAdminId, knownAchievements, likePattern, rankCard } from "@/lib/qayd/social";

const NAMED_CODE = "qafit";
const NAMED_TITLE = "قيد ما يقيد إلا القافط";
const SEATS = [0, 2, 1, 3];
const STALE_MS = 20_000;
/** In a live match, a seat silent this long is played by the computer until it returns. */
const HERE_MS = 8_000;
/** A live table whose host has been silent this long is handed back to the lobby. */
const HOST_LOST_MS = 45_000;
/** A real match cannot finish faster than this; quicker "results" are refused. */
const MIN_MATCH_MS = 120_000;
/** At most one counted result per player inside this window. */
const SETTLE_GAP_MS = 120_000;
/** Ceiling on the hidden-cut bonus one match can claim. */
const MAX_CUTS = 12;
/** XP a brand-new account may bring over from guest play on the device. */
const START_XP_CAP = 2_000;
const INVITE_MS = 120_000;
const ROOM_LENGTHS = [61, 101, 152];
const ROOM_STAKES = [0, 100, 500, 1000, 2500];

export type RoomSettings = { mode: "friendly" | "free"; len: number; stake: number };

/** Whatever is stored, the table only ever sees one of the allowed combinations. */
function cleanSettings(value: unknown): RoomSettings {
  const raw = asObject(value);
  const len = Number(raw.len);
  const stake = Number(raw.stake);
  return {
    mode: raw.mode === "free" ? "free" : "friendly",
    len: ROOM_LENGTHS.includes(len) ? len : 152,
    stake: ROOM_STAKES.includes(stake) ? stake : 0,
  };
}

type MailIn = { toUser?: string | null; kind: string; body?: unknown };

function cleanName(value: unknown) {
  const name = String(value ?? "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 14);
  return name || "لاعب";
}

function cleanCode(value: unknown) {
  const code = String(value ?? "").trim().toLowerCase();
  if (code === NAMED_CODE || /^\d{6}$/.test(code)) return code;
  throw new Error("رمز الغرفة غير صالح");
}

type Json = null | string | number | boolean | Json[] | { [key: string]: Json };

function asJson(value: unknown): Json {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(asJson);
  if (value && typeof value === "object") {
    const out: { [key: string]: Json } = {};
    for (const [key, item] of Object.entries(value)) out[key] = asJson(item);
    return out;
  }
  return null;
}

function asObject(value: unknown): { [key: string]: Json } {
  const json = asJson(value);
  if (json && typeof json === "object" && !Array.isArray(json)) return json;
  return {};
}

type SqlClient = Awaited<ReturnType<typeof getSql>>;

const schemaRef = globalThis as typeof globalThis & {
  __qaydSchemaReady__?: Promise<void>;
  __qaydSchemaVersion__?: number;
};

const SCHEMA_VERSION = 11;

/**
 * Idempotent schema top-up. Runs ONCE per server process: the old code issued
 * `alter table` on every poll, which takes an exclusive table lock each time.
 * migrations/0002..0006 create the same objects; this only covers a database
 * that was provisioned before those files existed.
 */
function ensureSchema(sql: SqlClient): Promise<void> {
  if (schemaRef.__qaydSchemaVersion__ !== SCHEMA_VERSION || !schemaRef.__qaydSchemaReady__) {
    schemaRef.__qaydSchemaVersion__ = SCHEMA_VERSION;
    schemaRef.__qaydSchemaReady__ = (async () => {
    await sql`alter table qayd_rooms add column if not exists match_id text`;
    await sql`alter table qayd_rooms add column if not exists settings jsonb not null default '{}'::jsonb`;
    await sql`alter table qayd_profiles add column if not exists xp_total integer`;
    await sql`alter table qayd_profiles add column if not exists last_seen bigint`;
    await sql`
      create table if not exists qayd_xp_log (
        user_id text not null,
        match_id text not null,
        kind text not null,
        base_xp integer not null,
        eval_xp integer not null,
        cheat_xp integer not null,
        net_xp integer not null,
        total_before integer not null,
        total_after integer not null,
        level_after integer not null,
        at bigint not null,
        primary key (user_id, match_id)
      )`;
    await sql`
      update qayd_profiles
      set xp_total = case
        when coalesce(data->'rank'->>'total', '') ~ '^[0-9]+$' then least((data->'rank'->>'total')::int, ${START_XP_CAP})
        else 0
      end
      where xp_total is null`;
    await sql`
      create table if not exists qayd_friends (
        from_id text not null,
        to_id text not null,
        status text not null,
        created_at bigint not null,
        primary key (from_id, to_id)
      )`;
    await sql`
      create table if not exists qayd_matches (
        match_id text primary key,
        kind text not null,
        owner_id text not null,
        code text,
        started_at bigint not null,
        ended_at bigint,
        winner integer
      )`;
    await sql`create index if not exists qayd_matches_owner_idx on qayd_matches (owner_id, started_at)`;
    await sql`alter table qayd_matches add column if not exists eval jsonb`;
    await sql`alter table qayd_matches add column if not exists cuts jsonb`;
    await sql`
      create table if not exists qayd_match_seats (
        match_id text not null,
        user_id text not null,
        seat integer not null,
        primary key (match_id, user_id)
      )`;
    await sql`
      create table if not exists qayd_invites (
        from_id text not null,
        to_id text not null,
        code text not null,
        at bigint not null,
        primary key (from_id, to_id)
      )`;
    await sql`create index if not exists qayd_invites_to_idx on qayd_invites (to_id, at)`;
    await sql`create index if not exists qayd_xp_log_user_at_idx on qayd_xp_log (user_id, at)`;
    await sql`create index if not exists qayd_members_user_idx on qayd_members (user_id)`;
    await sql`
      create table if not exists qayd_notifications (
        id bigserial primary key,
        user_id text not null,
        kind text not null,
        title text not null,
        body text not null default '',
        href text not null default '',
        dedupe text not null,
        read_at bigint,
        created_at bigint not null
      )`;
    // Online matches: every phone runs the same table and only the moves travel.
    await sql`alter table qayd_matches add column if not exists info jsonb`;
    await sql`
      create table if not exists qayd_moves (
        match_id text not null,
        k integer not null,
        seat integer not null,
        user_id text not null,
        body jsonb not null,
        at bigint not null,
        primary key (match_id, k)
      )`;
    await sql`alter table qayd_moves enable row level security`;
    await sql`
      create unique index if not exists qayd_notifications_dedupe_idx
      on qayd_notifications (user_id, dedupe)`;
    await sql`
      create index if not exists qayd_notifications_user_idx
      on qayd_notifications (user_id, created_at desc)`;
  })().catch((err) => {
    schemaRef.__qaydSchemaReady__ = undefined;
    schemaRef.__qaydSchemaVersion__ = undefined;
    throw err;
  });
  }
  return schemaRef.__qaydSchemaReady__;
}

const ensureMatchColumn = ensureSchema;
const ensureXp = ensureSchema;
const ensureFriends = ensureSchema;

/** Guest progress carried into a new account is capped; after that only settleXp moves XP. */
function startingXp(data: { [key: string]: Json }) {
  const claimed = Math.max(0, Math.floor(Number(asObject(data.rank).total) || 0));
  return Math.min(START_XP_CAP, claimed);
}

const joinLog = new Map<string, number[]>();

/** Slows down room-code guessing: 15 joins a minute per account. */
function joinAllowed(userId: string, now: number) {
  const list = (joinLog.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 15) {
    joinLog.set(userId, list);
    return false;
  }
  list.push(now);
  if (joinLog.size > 5000) joinLog.clear();
  joinLog.set(userId, list);
  return true;
}

function withAuthoritativeXp(data: { [key: string]: Json }, xpTotal: number | null): { [key: string]: Json } {
  if (xpTotal == null || !Number.isFinite(xpTotal)) return data;
  const total = Math.max(0, Math.floor(xpTotal));
  const stage = levelFromXp(total);
  const prev = asObject(data.rank);
  return {
    ...data,
    rank: { ...prev, total, stage, xp: total - threshold(stage), maxStage: Math.max(Number(prev.maxStage) || 0, stage) },
  };
}

async function roster(sql: SqlClient, code: string) {
  const now = Date.now();
  const roomRows = await sql<{ code: string; title: string; host_id: string | null; phase: string; match_id: string | null; settings: unknown }>`
    select code, title, host_id, phase, match_id, settings from qayd_rooms where code = ${code}`;
  const room = roomRows[0];
  if (!room) return null;
  if (room.phase !== "live") {
    await sql`delete from qayd_members where code = ${code} and last_seen < ${now - STALE_MS}`;
  }
  const members = await sql<{ user_id: string; seat: number | null; name: string; last_seen: number }>`
    select user_id, seat, name, last_seen from qayd_members where code = ${code} order by seat nulls last, last_seen`;
  let hostId = room.host_id;
  if (room.phase !== "live") {
    let seat0 = members.find((m) => m.seat === 0);
    if (!seat0 && members.length) {
      // The host walked out of the lobby. The table engine needs someone on
      // seat 0, so move the next player there instead of leaving the room stuck.
      const next = [2, 1, 3].map((s) => members.find((m) => m.seat === s)).find(Boolean) ?? members[0];
      try {
        await sql`update qayd_members set seat = 0 where code = ${code} and user_id = ${next.user_id}`;
        next.seat = 0;
        seat0 = next;
        members.sort((a, b) => (a.seat ?? 9) - (b.seat ?? 9));
      } catch {
        /* another request promoted someone first; the next poll shows it */
      }
    }
    const want = seat0 ? seat0.user_id : null;
    if (want !== hostId) {
      hostId = want;
      await sql`update qayd_rooms set host_id = ${hostId}, updated_at = ${now} where code = ${code}`;
    }
  }
  const hostRow = hostId ? members.find((m) => m.user_id === hostId) : undefined;
  const hostAwayMs = hostRow ? Math.max(0, now - Number(hostRow.last_seen)) : 9_000_000;
  return {
    code: room.code,
    title: room.title,
    phase: room.phase,
    matchId: room.match_id,
    settings: cleanSettings(room.settings),
    hostId,
    hostOnline: hostAwayMs < STALE_MS,
    hostAwayMs,
    members: members.map((m) => ({
      userId: m.user_id,
      seat: m.seat,
      name: m.name,
      online: now - Number(m.last_seen) < STALE_MS,
      /* During a match a phone checks in every ~1.5 s; 8 s of silence means it left or slept. */
      here: now - Number(m.last_seen) < HERE_MS,
    })),
  };
}

export const loadProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureXp(sql);
    const rows = await sql<{ display_name: string; data: unknown; updated_at: number; xp_total: number | null }>`
      select display_name, data, updated_at, xp_total from qayd_profiles where user_id = ${context.userId}`;
    const row = rows[0];
    if (!row) return { profile: null as null | { name: string; data: string; updatedAt: number; xpTotal: number | null } };
    const forced = withAuthoritativeXp(asObject(row.data), row.xp_total == null ? null : Number(row.xp_total));
    return {
      profile: {
        name: row.display_name,
        data: JSON.stringify(forced),
        updatedAt: Number(row.updated_at),
        xpTotal: row.xp_total == null ? null : Number(row.xp_total),
      },
    };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = typeof input === "string" ? input : JSON.stringify(input ?? {});
    if (raw.length > 120_000) throw new Error("البيانات أكبر من الحد");
    const data = asObject(JSON.parse(raw) as unknown);
    return { raw, name: cleanName(data.name), parsed: data };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const now = Date.now();
    await ensureXp(sql);
    const existing = await sql<{ xp_total: number | null }>`
      select xp_total from qayd_profiles where user_id = ${context.userId}`;
    const stored = existing[0]?.xp_total;
    const xp = stored == null ? startingXp(data.parsed) : Number(stored);
    const merged = withAuthoritativeXp(data.parsed, xp);
    const raw = JSON.stringify(merged);
    await sql`
      insert into qayd_profiles (user_id, display_name, data, updated_at, xp_total)
      values (${context.userId}, ${data.name}, ${raw}::jsonb, ${now}, ${xp})
      on conflict (user_id) do update
        set display_name = excluded.display_name,
            data = excluded.data,
            updated_at = excluded.updated_at,
            xp_total = qayd_profiles.xp_total`;
    return { ok: true as const, updatedAt: now, xpTotal: xp };
  });

export const joinRoom = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = asObject(input);
    return { code: cleanCode(body.code), name: cleanName(body.name), create: body.create === true };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const now = Date.now();
    await ensureMatchColumn(sql);
    if (!joinAllowed(context.userId, now)) {
      return { ok: false as const, error: "محاولات كثيرة. انتظر دقيقة وجرّب." };
    }
    if (data.create) {
      // "Make a room" must never drop the player into somebody else's table.
      const busy = await sql<{ user_id: string }>`
        select user_id from qayd_members
        where code = ${data.code} and user_id <> ${context.userId} and last_seen > ${now - STALE_MS} limit 1`;
      if (busy.length) return { ok: false as const, taken: true as const, error: "الرمز مستخدم. جرّب مرة ثانية." };
    }
    const title = data.code === NAMED_CODE ? NAMED_TITLE : `غرفة ${data.code}`;
    await sql`
      insert into qayd_rooms (code, title, host_id, phase, updated_at)
      values (${data.code}, ${title}, ${context.userId}, 'lobby', ${now})
      on conflict (code) do nothing`;
    const rooms = await sql<{ phase: string; host_id: string | null; match_id: string | null }>`
      select phase, host_id, match_id from qayd_rooms where code = ${data.code}`;
    let phase = rooms[0]?.phase ?? "lobby";
    if (phase === "live") {
      // Every phone runs the match, so it lives as long as anyone is still at the table.
      const alive = await sql<{ user_id: string }>`
        select user_id from qayd_members where code = ${data.code} and last_seen > ${now - HOST_LOST_MS} limit 1`;
      if (!alive.length) {
        const flipped = await sql<{ code: string }>`
          update qayd_rooms set phase = 'lobby', match_id = null, updated_at = ${now}
          where code = ${data.code} and phase = 'live'
          returning code`;
        if (flipped.length) {
          const matchId = rooms[0]?.match_id;
          if (matchId) {
            await sql`update qayd_matches set ended_at = ${now} where match_id = ${matchId} and ended_at is null`;
          }
          await sql`delete from qayd_members where code = ${data.code}`;
          phase = "lobby";
        }
      }
    }
    let resume: { [key: string]: Json } | null = null;
    if (phase === "live" && rooms[0]?.match_id) {
      // A player who left (or reloaded) mid-match takes the same seat back and replays the moves.
      const back = await sql<{ seat: number; info: unknown }>`
        select s.seat, m.info from qayd_match_seats s join qayd_matches m on m.match_id = s.match_id
        where s.match_id = ${rooms[0].match_id} and s.user_id = ${context.userId} and m.winner is null and m.info is not null`;
      if (back[0]) {
        resume = { ...asObject(back[0].info), matchId: String(rooms[0].match_id), you: Number(back[0].seat) };
        await sql`delete from qayd_members where code = ${data.code} and seat = ${Number(back[0].seat)} and user_id <> ${context.userId}`;
        await sql`
          insert into qayd_members (code, user_id, seat, name, last_seen)
          values (${data.code}, ${context.userId}, ${Number(back[0].seat)}, ${data.name}, ${now})
          on conflict (code, user_id) do update set seat = excluded.seat, last_seen = excluded.last_seen`;
      }
    }
    const mine = await sql<{ seat: number | null }>`
      select seat from qayd_members where code = ${data.code} and user_id = ${context.userId}`;
    if (!mine.length) {
      if (phase === "live") return { ok: false as const, error: "الصكة قائمة الآن. انتظر الجاية أو ادخل غرفة ثانية." };
      await sql`delete from qayd_members where code = ${data.code} and last_seen < ${now - STALE_MS}`;
      const takenRows = await sql<{ seat: number }>`
        select seat from qayd_members where code = ${data.code} and seat is not null`;
      const taken = new Set(takenRows.map((r) => Number(r.seat)));
      const seat = SEATS.find((s) => !taken.has(s));
      if (seat == null) return { ok: false as const, error: "الديوانية ممتلئة. سوِّ غرفة برمز." };
      try {
        await sql`
          insert into qayd_members (code, user_id, seat, name, last_seen)
          values (${data.code}, ${context.userId}, ${seat}, ${data.name}, ${now})`;
      } catch {
        return { ok: false as const, error: "المقعد انأخذ. جرّب مرة ثانية." };
      }
    } else {
      await sql`
        update qayd_members set name = ${data.name}, last_seen = ${now}
        where code = ${data.code} and user_id = ${context.userId}`;
    }
    const room = await roster(sql, data.code);
    const cursor = await sql<{ id: number }>`
      select coalesce(max(id), 0) as id from qayd_mail where code = ${data.code}`;
    return { ok: true as const, room, since: Number(cursor[0]?.id ?? 0), resume };
  });

export const syncRoom = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = asObject(input);
    const code = cleanCode(body.code);
    const since = Math.max(0, Number(body.since) || 0);
    const cmd =
      body.cmd === "start" || body.cmd === "leave" || body.cmd === "reset" || body.cmd === "config" || body.cmd === "seat"
        ? body.cmd
        : "poll";
    const send = Array.isArray(body.send) ? (body.send as MailIn[]).slice(0, 8) : [];
    const config = cmd === "config" ? cleanSettings(body.config) : null;
    const seatRaw = asObject(body.seat);
    const seatNo = Number(seatRaw.seat);
    const seat =
      cmd === "seat" && [1, 2, 3].includes(seatNo)
        ? { userId: String(seatRaw.userId ?? "").slice(0, 80), seat: seatNo }
        : null;
    return { code, since, cmd, send, config, seat };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const now = Date.now();
    const uid = context.userId;
    await ensureMatchColumn(sql);
    const me = await sql<{ seat: number | null }>`
      select seat from qayd_members where code = ${data.code} and user_id = ${uid}`;
    if (!me.length) return { ok: false as const, error: "لست في الغرفة", room: null, mail: [] as never[] };
    const mySeat = me[0].seat == null ? null : Number(me[0].seat);
    await sql`update qayd_members set last_seen = ${now} where code = ${data.code} and user_id = ${uid}`;
    const before = await roster(sql, data.code);
    if (!before) return { ok: false as const, error: "الغرفة غير موجودة", room: null, mail: [] as never[] };
    let changed = false;

    if (before.phase === "live" && before.hostId && before.hostId !== uid && before.hostAwayMs >= HOST_LOST_MS) {
      // The owner went away, but the match runs on every phone. Hand the room to the next player.
      const next = before.members
        .filter((m) => m.online && m.seat != null && m.userId !== before.hostId)
        .sort((x, y) => Number(x.seat) - Number(y.seat))[0];
      await sql`update qayd_rooms set host_id = ${next ? next.userId : uid}, updated_at = ${now} where code = ${data.code} and host_id = ${before.hostId}`;
      changed = true;
    } else if (data.cmd === "leave") {
      changed = true;
      const mineSeat = before.members.find((m) => m.userId === uid)?.seat ?? null;
      await sql`delete from qayd_members where code = ${data.code} and user_id = ${uid}`;
      if (before.hostId === uid) {
        const next = before.members
          .filter((m) => m.online && m.seat != null && m.userId !== uid)
          .sort((x, y) => Number(x.seat) - Number(y.seat))[0];
        await sql`update qayd_rooms set host_id = ${next ? next.userId : null}, updated_at = ${now} where code = ${data.code}`;
      }
      if (before.phase === "live" && !before.members.some((m) => m.userId !== uid && m.online)) {
        // Last one out: nobody is left to finish the match.
        await sql`update qayd_rooms set phase = 'lobby', match_id = null, updated_at = ${now} where code = ${data.code}`;
        if (before.matchId) {
          await sql`update qayd_matches set ended_at = ${now} where match_id = ${before.matchId} and ended_at is null`;
        }
      }
    } else if (data.cmd === "reset") {
      if (before.hostId !== uid) return { ok: false as const, error: "صاحب الطاولة يرجّع الديوانية", room: before, mail: [] };
      changed = true;
      await sql`update qayd_rooms set phase = 'lobby', match_id = null, updated_at = ${now} where code = ${data.code}`;
      if (before.matchId) {
        await sql`update qayd_matches set ended_at = ${now} where match_id = ${before.matchId} and ended_at is null`;
      }
      await sql`
        insert into qayd_mail (code, to_user, from_user, kind, body, at)
        values (${data.code}, null, ${uid}, 'reset', ${JSON.stringify({})}::jsonb, ${now})`;
    } else if (data.cmd === "config") {
      // Play mode, match length and stake belong to the table owner, and only before the deal.
      if (before.hostId !== uid) return { ok: false as const, error: "صاحب الطاولة يحدد إعدادات الجلسة", room: before, mail: [] };
      if (before.phase === "live") return { ok: false as const, error: "الصكة بدأت، والإعدادات مقفلة", room: before, mail: [] };
      if (data.config) {
        changed = true;
        await sql`update qayd_rooms set settings = ${JSON.stringify(data.config)}::jsonb, updated_at = ${now} where code = ${data.code}`;
      }
    } else if (data.cmd === "seat") {
      // Who sits with whom. Seat 0 is the owner's chair (the table engine runs there);
      // seat 2 faces it (partner), seats 1 and 3 are the opponents.
      if (before.phase === "live") return { ok: false as const, error: "الصكة بدأت، والمقاعد مقفلة", room: before, mail: [] };
      if (data.seat) {
        const target = data.seat.userId || uid;
        const isHost = before.hostId === uid;
        if (target !== uid && !isHost) return { ok: false as const, error: "صاحب الطاولة يرتّب المقاعد", room: before, mail: [] };
        const mover = before.members.find((m) => m.userId === target);
        if (!mover) return { ok: false as const, error: "اللاعب مو في الجلسة", room: before, mail: [] };
        if (mover.seat === 0) return { ok: false as const, error: "مقعد صاحب الطاولة ثابت", room: before, mail: [] };
        const holder = before.members.find((m) => m.seat === data.seat?.seat);
        if (holder && holder.userId !== target) {
          if (!isHost) return { ok: false as const, error: "المقعد مأخوذ. صاحب الطاولة يقدر يبدّل.", room: before, mail: [] };
          // Swap through an empty chair so the unique (room, seat) index never sees a duplicate.
          await sql`update qayd_members set seat = null where code = ${data.code} and user_id = ${holder.userId}`;
          await sql`update qayd_members set seat = ${data.seat.seat} where code = ${data.code} and user_id = ${target}`;
          await sql`update qayd_members set seat = ${mover.seat} where code = ${data.code} and user_id = ${holder.userId}`;
        } else if (!holder) {
          await sql`update qayd_members set seat = ${data.seat.seat} where code = ${data.code} and user_id = ${target}`;
        }
        changed = true;
      }
    } else if (data.cmd === "start") {
      if (before.hostId !== uid || before.phase === "live") {
        return { ok: false as const, error: before.phase === "live" ? "الصكة بدأت" : "صاحب الطاولة يبدأ", room: before, mail: [] };
      }
      const humans = before.members.filter((m) => m.seat != null && m.online);
      if (!humans.length) return { ok: false as const, error: "ما فيه لاعبين", room: before, mail: [] };
      if (before.settings.stake > 0) {
        // Everyone at the table must be able to cover the stake before a card is dealt.
        for (const m of humans) {
          const rows = await sql<{ coins: string | null }>`
            select data->>'coins' as coins from qayd_profiles where user_id = ${m.userId}`;
          const coins = rows[0]?.coins == null ? null : Number(rows[0].coins);
          if (coins != null && Number.isFinite(coins) && coins < before.settings.stake) {
            return {
              ok: false as const,
              error: `${m.name} رصيده ما يكفي للعب على ${before.settings.stake}. غيّروا المبلغ أو العبوا بدون عملات.`,
              room: before,
              mail: [],
            };
          }
        }
      }
      changed = true;
      const matchId = `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await sql`update qayd_rooms set phase = 'live', match_id = ${matchId}, updated_at = ${now} where code = ${data.code}`;
      // The server remembers who sat where, so XP can be checked against it later.
      await sql`
        insert into qayd_matches (match_id, kind, owner_id, code, started_at)
        values (${matchId}, 'room', ${uid}, ${data.code}, ${now})
        on conflict (match_id) do nothing`;
      for (const m of humans) {
        await sql`
          insert into qayd_match_seats (match_id, user_id, seat)
          values (${matchId}, ${m.userId}, ${Number(m.seat)})
          on conflict (match_id, user_id) do nothing`;
      }
      // Each player's real level travels with the start, so every phone shows it on his name plate.
      const stages = new Map<string, number>();
      for (const m of humans) {
        const rows = await sql<{ xp_total: number | null; data: unknown }>`
          select xp_total, data from qayd_profiles where user_id = ${m.userId}`;
        const xp = rows[0] ? (rows[0].xp_total == null ? startingXp(asObject(rows[0].data)) : Number(rows[0].xp_total)) : 0;
        stages.set(m.userId, levelFromXp(xp));
      }
      const body = {
        seed: now,
        matchId,
        seats: humans.map((m) => ({ userId: m.userId, seat: m.seat, name: m.name, stage: stages.get(m.userId) ?? 0 })),
        settings: before.settings,
        topic: await movesTopic(matchId),
      };
      await sql`update qayd_matches set info = ${JSON.stringify(body)}::jsonb where match_id = ${matchId}`;
      await sql`
        insert into qayd_mail (code, to_user, from_user, kind, body, at)
        values (${data.code}, null, ${uid}, 'start', ${JSON.stringify(body)}::jsonb, ${now})`;
    }

    let current = changed ? await roster(sql, data.code) : before;
    if (current && data.cmd !== "leave" && current.phase === "live") {
      const isHost = current.hostId === uid;
      const memberIds = new Set(current.members.map((m) => m.userId));
      let ended = false;
      for (const item of data.send) {
        if (ended) break;
        const kind = String(item.kind || "").slice(0, 24);
        if (!["view", "need", "act", "over", "adopt", "sync", "qayd-watch"].includes(kind)) continue;
        let toUser = item.toUser ? String(item.toUser).slice(0, 80) : null;
        let body = asObject(item.body);
        if (kind === "qayd-watch") {
          // A player picking cards in the qayd window: the whole table watches. The server stamps his seat.
          if (mySeat == null) continue;
          toUser = null;
          body = { ...body, seat: mySeat };
        } else if (kind === "act" || kind === "sync") {
          // A move, and a request for the current table, only travel guest -> host.
          // The server stamps the sender's seat so nobody can play another hand
          // or pull a snapshot for a seat they do not occupy.
          if (isHost || mySeat == null || !current.hostId) continue;
          toUser = current.hostId;
          body = { ...body, seat: mySeat };
        } else {
          // Every phone plays the same match, so any seated player may report the result; the first one counts.
          if (kind === "over" ? mySeat == null : !isHost) continue;
          if (kind === "over") {
            toUser = null;
            const winner = Number(body.winner) === 0 ? 0 : 1;
            const evals = [0, 1, 2, 3].map((i) => {
              const n = Number(Array.isArray(body.eval) ? body.eval[i] : 0);
              return [0, 10, 20, 30, 50].includes(n) ? n : 0;
            });
            const cuts = clampCutReport(body.cuts);
            body = { winner, scores: body.scores ?? [0, 0], seed: body.seed ?? null, matchId: current.matchId, eval: evals, cuts };
            if (current.matchId) {
              const evalJson = JSON.stringify(evals);
              const cutsJson = JSON.stringify(cuts);
              await sql`
                update qayd_matches set winner = ${winner}, ended_at = ${now}
                where match_id = ${current.matchId} and winner is null`;
              await sql`
                update qayd_matches set eval = ${evalJson}::jsonb
                where match_id = ${current.matchId} and eval is null`;
              await sql`
                update qayd_matches set cuts = ${cutsJson}::jsonb
                where match_id = ${current.matchId} and cuts is null`;
            }
            // Back to the lobby so the same friends can start another match.
            await sql`update qayd_rooms set phase = 'lobby', match_id = null, updated_at = ${now} where code = ${data.code}`;
            ended = true;
          } else if (!toUser || !memberIds.has(toUser)) {
            continue;
          }
        }
        const payload = JSON.stringify(body);
        if (payload.length > 24_000) continue;
        await sql`
          insert into qayd_mail (code, to_user, from_user, kind, body, at)
          values (${data.code}, ${toUser}, ${uid}, ${kind}, ${payload}::jsonb, ${now})`;
      }
      if (ended) current = await roster(sql, data.code);
    }

    if (Math.random() < 0.05) {
      await sql`delete from qayd_mail where code = ${data.code} and at < ${now - 15 * 60_000}`;
    }
    const mail = await sql<{ id: number; to_user: string | null; from_user: string; kind: string; body: unknown }>`
      select id, to_user, from_user, kind, body from qayd_mail
      where code = ${data.code} and id > ${data.since} and (to_user is null or to_user = ${uid})
      order by id asc limit 40`;
    return {
      ok: true as const,
      room: current,
      mail: mail.map((m) => ({
        id: Number(m.id),
        from: m.from_user,
        kind: m.kind,
        body: JSON.stringify(asObject(m.body)),
      })),
    };
  });

type Vetted =
  | { ok: true; input: SettleInput }
  | { ok: false; gone: boolean; error: string };

/**
 * Decide whether a claimed result may count. The browser still plays the cards,
 * so the server cannot re-score a hand; what it CAN do is refuse matches it
 * never saw start, results that arrive impossibly fast or too often, and, for
 * online tables, take the winner from the host's report instead of each player.
 */
async function vetSettle(
  sql: SqlClient,
  userId: string,
  data: { matchId: string; kind: "result" | "abandon"; won: boolean; evalXp: number; hidden: number; caught: number },
): Promise<Vetted> {
  const rows = await sql<{ seat: number; kind: string; owner_id: string; started_at: number; winner: number | null; eval: unknown; cuts: unknown }>`
    select s.seat, m.kind, m.owner_id, m.started_at, m.winner, m.eval, m.cuts
    from qayd_match_seats s join qayd_matches m on m.match_id = s.match_id
    where s.match_id = ${data.matchId} and s.user_id = ${userId}`;
  const row = rows[0];
  if (!row) return { ok: false, gone: true, error: "هذه الصكة غير مسجّلة في السيرفر، فما تنحسب خبرتها." };
  if (data.kind === "abandon") {
    if (row.winner != null) return { ok: false, gone: true, error: "الصكة انتهت قبل الخروج." };
    return { ok: true, input: { kind: "abandon" } };
  }
  const now = Date.now();
  if (now - Number(row.started_at) < MIN_MATCH_MS) {
    return { ok: false, gone: true, error: "الصكة أقصر من أن تنحسب." };
  }
  const recent = await sql<{ at: number }>`
    select at from qayd_xp_log
    where user_id = ${userId} and kind = 'result' and at > ${now - SETTLE_GAP_MS} limit 1`;
  if (recent.length) return { ok: false, gone: false, error: "انحسبت لك صكة قبل لحظات. بنعيد المحاولة بعدين." };
  let won = data.won;
  if (row.kind === "room") {
    let winner = row.winner == null ? null : Number(row.winner);
    if (winner == null) {
      // Every phone plays the same match: the first seated player to report sets the winner.
      winner = data.won ? Number(row.seat) % 2 : 1 - (Number(row.seat) % 2);
      await sql`update qayd_matches set winner = ${winner}, ended_at = ${now} where match_id = ${data.matchId} and winner is null`;
    }
    won = Number(row.seat) % 2 === winner;
    const evalXp = roomEvalXp(row.eval, Number(row.seat), data.evalXp, row.owner_id === userId);
    const cuts = roomCuts(row.cuts, Number(row.seat), data.hidden, data.caught, row.owner_id === userId);
    return { ok: true, input: { kind: "result", won, evalXp, hidden: cuts.hidden, caught: cuts.caught } };
  }
  const hidden = Math.min(MAX_CUTS, Math.max(0, Math.floor(Number(data.hidden) || 0)));
  const caught = Math.max(0, Math.floor(Number(data.caught) || 0));
  return { ok: true, input: { kind: "result", won, evalXp: data.evalXp, hidden, caught } };
}

function cleanMatchId(value: unknown) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9-]{6,80}$/.test(id)) throw new Error("معرّف الصكة غير صالح");
  return id;
}

export const settleXp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = asObject(input);
    const kind = body.kind === "abandon" ? "abandon" : "result";
    const matchId = cleanMatchId(body.matchId);
    const won = body.won === true;
    const evalXp = Number(body.evalXp);
    const hidden = Number(body.hidden);
    const caught = Number(body.caught);
    return { matchId, kind, won, evalXp, hidden, caught } satisfies { matchId: string } & SettleInput;
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureXp(sql);
    let input: SettleInput | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const prior = await sql<{
        kind: string;
        base_xp: number;
        eval_xp: number;
        cheat_xp: number;
        net_xp: number;
        total_before: number;
        total_after: number;
        level_after: number;
      }>`
        select kind, base_xp, eval_xp, cheat_xp, net_xp, total_before, total_after, level_after
        from qayd_xp_log where user_id = ${context.userId} and match_id = ${data.matchId}`;
      if (prior[0]) {
        return {
          ok: true as const,
          duplicate: true,
          kind: prior[0].kind,
          baseXp: Number(prior[0].base_xp),
          evalXp: Number(prior[0].eval_xp),
          cheatXp: Number(prior[0].cheat_xp),
          netXp: Number(prior[0].net_xp),
          before: Number(prior[0].total_before),
          after: Number(prior[0].total_after),
          toLevel: Number(prior[0].level_after),
        };
      }
      if (!input) {
        const verdict = await vetSettle(sql, context.userId, data);
        if (!verdict.ok) return { ok: false as const, gone: verdict.gone, error: verdict.error };
        input = verdict.input;
      }
      const rows = await sql<{ xp_total: number | null; data: unknown; display_name: string }>`
        select xp_total, data, display_name from qayd_profiles where user_id = ${context.userId}`;
      const row = rows[0];
      const parsed = asObject(row?.data);
      const before = row?.xp_total == null ? startingXp(parsed) : Number(row.xp_total);
      const settlement = settleMatch(before, input);
      const now = Date.now();
      const inserted = await sql<{ match_id: string }>`
        insert into qayd_xp_log (
          user_id, match_id, kind, base_xp, eval_xp, cheat_xp, net_xp, total_before, total_after, level_after, at
        ) values (
          ${context.userId}, ${data.matchId}, ${settlement.kind}, ${settlement.baseXp}, ${settlement.evalXp},
          ${settlement.cheatXp}, ${settlement.netXp}, ${settlement.before}, ${settlement.after}, ${settlement.toLevel}, ${now}
        )
        on conflict (user_id, match_id) do nothing
        returning match_id`;
      if (!inserted.length) continue;
      const merged = withAuthoritativeXp(parsed, settlement.after);
      const name = cleanName(merged.name || row?.display_name || "");
      const raw = JSON.stringify(merged);
      if (!row) {
        await sql`
          insert into qayd_profiles (user_id, display_name, data, updated_at, xp_total)
          values (${context.userId}, ${name}, ${raw}::jsonb, ${now}, ${settlement.after})`;
      } else {
        const updated = await sql<{ user_id: string }>`
          update qayd_profiles
          set display_name = ${name}, data = ${raw}::jsonb, updated_at = ${now}, xp_total = ${settlement.after}
          where user_id = ${context.userId} and xp_total is not distinct from ${row.xp_total}
          returning user_id`;
        if (!updated.length) {
          await sql`delete from qayd_xp_log where user_id = ${context.userId} and match_id = ${data.matchId}`;
          continue;
        }
      }
      if (settlement.toLevel > settlement.fromLevel) {
        try {
          await pushNotice(sql, context.userId, {
            kind: "level",
            title: "رتبة جديدة",
            body: stageLabel(settlement.toLevel),
            href: "",
            dedupe: `level:${settlement.toLevel}`,
          });
        } catch {
          /* The rank already moved. A missed notice must not undo the result. */
        }
      }
      return {
        ok: true as const,
        duplicate: false,
        kind: settlement.kind,
        baseXp: settlement.baseXp,
        evalXp: settlement.evalXp,
        cheatXp: settlement.cheatXp,
        netXp: settlement.netXp,
        hidden: settlement.hidden,
        caught: settlement.caught,
        before: settlement.before,
        after: settlement.after,
        fromLevel: settlement.fromLevel,
        toLevel: settlement.toLevel,
      };
    }
    return { ok: false as const, gone: false, error: "تعذّر حفظ الخبرة. أعد المحاولة." };
  });

/** Register a table against the computer before it is played, so its result can count. */
export const beginMatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ matchId: cleanMatchId(asObject(input).matchId) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureXp(sql);
    const now = Date.now();
    const recent = await sql<{ n: number }>`
      select count(*) as n from qayd_matches
      where owner_id = ${context.userId} and kind = 'solo' and started_at > ${now - 10 * 60_000}`;
    if (Number(recent[0]?.n ?? 0) >= 6) return { ok: false as const };
    const made = await sql<{ match_id: string }>`
      insert into qayd_matches (match_id, kind, owner_id, code, started_at)
      values (${data.matchId}, 'solo', ${context.userId}, null, ${now})
      on conflict (match_id) do nothing
      returning match_id`;
    if (made.length) {
      await sql`
        insert into qayd_match_seats (match_id, user_id, seat)
        values (${data.matchId}, ${context.userId}, 0)
        on conflict (match_id, user_id) do nothing`;
    }
    if (Math.random() < 0.02) {
      const old = now - 14 * 86_400_000;
      await sql`delete from qayd_match_seats where match_id in (select match_id from qayd_matches where started_at < ${old})`;
      await sql`delete from qayd_matches where started_at < ${old}`;
    }
    return { ok: true as const };
  });

/** Drop this player from every room so a new bot table cannot inherit old seats. */
export const releasePlayer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const now = Date.now();
    await ensureMatchColumn(sql);
    const seats = await sql<{ code: string; seat: number | null }>`
      select code, seat from qayd_members where user_id = ${context.userId}`;
    for (const seat of seats) {
      const rooms = await sql<{ host_id: string | null; phase: string }>`
        select host_id, phase from qayd_rooms where code = ${seat.code}`;
      const room = rooms[0];
      if (!room) {
        await sql`delete from qayd_members where code = ${seat.code} and user_id = ${context.userId}`;
        continue;
      }
      if (room.host_id === context.userId && room.phase === "live") {
        await sql`
          update qayd_matches set ended_at = ${now}
          where code = ${seat.code} and owner_id = ${context.userId} and ended_at is null`;
        await sql`delete from qayd_members where code = ${seat.code}`;
        await sql`delete from qayd_mail where code = ${seat.code}`;
        await sql`
          update qayd_rooms set phase = 'lobby', host_id = null, match_id = null, updated_at = ${now}
          where code = ${seat.code}`;
        await sql`
          insert into qayd_mail (code, to_user, from_user, kind, body, at)
          values (${seat.code}, null, ${context.userId}, 'reset', ${JSON.stringify({ reason: "local" })}::jsonb, ${now})`;
      } else {
        await sql`delete from qayd_members where code = ${seat.code} and user_id = ${context.userId}`;
        if (room.phase === "live" && seat.seat != null && room.host_id && room.host_id !== context.userId) {
          await sql`
            insert into qayd_mail (code, to_user, from_user, kind, body, at)
            values (${seat.code}, ${room.host_id}, ${context.userId}, 'drop', ${JSON.stringify({ seat: seat.seat })}::jsonb, ${now})`;
        }
        if (room.host_id === context.userId) {
          await sql`update qayd_rooms set host_id = null, phase = 'lobby', match_id = null, updated_at = ${now} where code = ${seat.code}`;
        }
      }
    }
    return { ok: true as const, released: seats.length };
  });

function cleanId(value: unknown) {
  const id = String(value ?? "").replace(/[\u0000-\u001f]/g, "").trim();
  if (!id || id.length > 80) throw new Error("المعرّف غير صالح");
  return id;
}

const ONLINE_MS = 45_000;

async function personName(sql: Awaited<ReturnType<typeof getSql>>, id: string) {
  const rows = await sql<{ display_name: string | null }>`
    select display_name from qayd_profiles where user_id = ${id}`;
  const name = cleanName(rows[0]?.display_name || "لاعب");
  return name;
}

async function pushNotice(
  sql: SqlClient,
  userId: string,
  notice: { kind: string; title: string; body?: string; href?: string; dedupe: string },
) {
  const now = Date.now();
  await sql`
    insert into qayd_notifications (user_id, kind, title, body, href, dedupe, created_at)
    values (
      ${userId}, ${notice.kind}, ${notice.title}, ${notice.body || ""}, ${notice.href || ""}, ${notice.dedupe}, ${now}
    )
    on conflict (user_id, dedupe) do update
      set title = excluded.title,
          body = excluded.body,
          href = excluded.href,
          created_at = excluded.created_at,
          read_at = null`;
}

export const listFriends = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureFriends(sql);
    const now = Date.now();
    const me = context.userId;
    await sql`update qayd_profiles set last_seen = ${now} where user_id = ${me}`;
    const rows = await sql<{
      from_id: string; to_id: string; status: string; created_at: number;
      display_name: string | null; last_seen: number | null; xp_total: number | null;
      wins: string | null; games: string | null; mark: string | null;
    }>`
      select f.from_id, f.to_id, f.status, f.created_at, p.display_name, p.last_seen, p.xp_total,
        p.data->>'wins' as wins, p.data->>'games' as games, p.data->>'mark' as mark
      from qayd_friends f
      left join qayd_profiles p on p.user_id = case when f.from_id = ${me} then f.to_id else f.from_id end
      where f.from_id = ${me} or f.to_id = ${me}`;
    type Card = {
      id: string; name: string; at: number; online: boolean; activity: "offline" | "online" | "room" | "live";
      xp: number; stage: number; line: string; face: string; suit: string; title: string; pct: number; red: boolean;
      wins: number | null; games: number | null; mark: string;
    };
    const incoming: Card[] = [];
    const outgoing: Card[] = [];
    const friends: Card[] = [];
    const blocked: { id: string; name: string; at: number }[] = [];
    const seenFriends = new Set<string>();
    const cardOf = (row: (typeof rows)[number], id: string): Card => {
      const rank = rankCard(row.xp_total == null ? 0 : Number(row.xp_total));
      const mark = row.mark === "h" || row.mark === "d" || row.mark === "c" || row.mark === "s" ? row.mark : "";
      const online = now - Number(row.last_seen || 0) < ONLINE_MS;
      return {
        id, name: cleanName(row.display_name || "لاعب"), at: Number(row.created_at) || 0,
        online, activity: activityOf(online, null),
        xp: rank.xp, stage: rank.stage, line: rank.line, face: rank.face, suit: rank.suit,
        title: rank.title, pct: rank.pct, red: rank.red,
        wins: countField(row.wins), games: countField(row.games), mark,
      };
    };
    for (const row of rows) {
      const other = row.from_id === me ? row.to_id : row.from_id;
      if (row.status === "blocked" && row.from_id === me) blocked.push({ id: other, name: cleanName(row.display_name || "لاعب"), at: Number(row.created_at) || 0 });
      else if (row.status === "pending" && row.to_id === me) incoming.push(cardOf(row, other));
      else if (row.status === "pending" && row.from_id === me) outgoing.push(cardOf(row, other));
      else if (row.status === "accepted" && !seenFriends.has(other)) {
        seenFriends.add(other);
        friends.push(cardOf(row, other));
      }
    }
    const friendIds = new Set(friends.map((f) => f.id));
    if (friendIds.size) {
      const seats = await sql<{ user_id: string; phase: string }>`
        select m.user_id, r.phase
        from qayd_members m
        join qayd_rooms r on r.code = m.code
        where m.last_seen > ${now - STALE_MS}`;
      const phase = new Map<string, string>();
      for (const seat of seats) {
        if (!friendIds.has(seat.user_id)) continue;
        const prev = phase.get(seat.user_id);
        if (prev !== "live") phase.set(seat.user_id, seat.phase);
      }
      for (const friend of friends) {
        const where = phase.get(friend.id) || null;
        friend.activity = activityOf(friend.online, where);
        if (friend.activity === "live" || friend.activity === "room") friend.online = true;
      }
    }
    const inviteRows = await sql<{ from_id: string; code: string; at: number; display_name: string | null }>`
      select i.from_id, i.code, i.at, p.display_name
      from qayd_invites i left join qayd_profiles p on p.user_id = i.from_id
      where i.to_id = ${me} and i.at > ${now - INVITE_MS}`;
    const invites = inviteRows
      .filter((row) => friendIds.has(row.from_id))
      .map((row) => ({ id: row.from_id, name: cleanName(row.display_name || "لاعب"), code: row.code, at: Number(row.at) || 0 }));
    return { incoming, outgoing, friends, blocked, invites };
  });

export const searchPlayer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = asObject(input);
    const q = String(body.q ?? body.id ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40);
    if (q.length < 2) throw new Error("اكتب حرفين على الأقل");
    return { q };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureFriends(sql);
    const me = context.userId;
    if (data.q === me) return { found: false as const, reason: "هذا معرّفك", results: [] as { id: string; name: string; online: boolean }[] };
    const like = likePattern(data.q);
    const now = Date.now();
    const rows = await sql<{ id: string; name: string | null; last_seen: number | null }>`
      select u.id, coalesce(nullif(p.display_name, ''), u.name) as name, p.last_seen
      from "user" u
      left join qayd_profiles p on p.user_id = u.id
      where u.id <> ${me}
        and (
          u.id = ${data.q}
          or p.display_name ilike ${like} escape '\\'
          or u.name ilike ${like} escape '\\'
        )
        and not exists (
          select 1 from qayd_friends b
          where b.status = 'blocked'
            and ((b.from_id = ${me} and b.to_id = u.id) or (b.from_id = u.id and b.to_id = ${me}))
        )
      order by case when u.id = ${data.q} then 0 else 1 end, p.last_seen desc nulls last
      limit 8`;
    const results = rows.map((row) => ({
      id: row.id,
      name: cleanName(row.name || "لاعب"),
      online: now - Number(row.last_seen || 0) < ONLINE_MS,
    }));
    const first = results[0];
    return {
      found: results.length > 0,
      reason: results.length ? undefined : "ما لقينا أحد بهذا الاسم أو المعرّف",
      id: first?.id,
      name: first?.name,
      online: first?.online,
      results,
    };
  });

export const requestFriend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: cleanId(asObject(input).id) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureFriends(sql);
    const me = context.userId;
    if (data.id === me) throw new Error("ما تقدر تضيف نفسك");
    const users = await sql<{ id: string }>`select id from "user" where id = ${data.id}`;
    if (!users.length) throw new Error("ما لقينا هذا المعرّف");
    const blocks = await sql<{ from_id: string }>`
      select from_id from qayd_friends
      where status = 'blocked' and ((from_id = ${me} and to_id = ${data.id}) or (from_id = ${data.id} and to_id = ${me}))`;
    if (blocks.length) throw new Error("في حظر بين الحسابين");
    const target = await sql<{ data: unknown }>`select data from qayd_profiles where user_id = ${data.id}`;
    const prefs = asObject(asObject(target[0]?.data).prefs);
    if (prefs.friendRequests === 0) throw new Error("هذا اللاعب ما يستقبل طلبات");
    const now = Date.now();
    const reverse = await sql<{ status: string }>`
      select status from qayd_friends where from_id = ${data.id} and to_id = ${me}`;
    if (reverse[0]?.status === "pending") {
      await sql`update qayd_friends set status = 'accepted' where from_id = ${data.id} and to_id = ${me}`;
      await sql`
        insert into qayd_friends (from_id, to_id, status, created_at)
        values (${me}, ${data.id}, 'accepted', ${now})
        on conflict (from_id, to_id) do update set status = 'accepted'`;
      const mineName = await personName(sql, me);
      await pushNotice(sql, data.id, {
        kind: "friend_accept",
        title: "انقبلت الصداقة",
        body: `${mineName} قبل طلبك`,
        href: "friends",
        dedupe: `friend_accept:${me}:${now}`,
      });
      return { ok: true as const, state: "accepted" as const };
    }
    const mine = await sql<{ status: string }>`
      select status from qayd_friends where from_id = ${me} and to_id = ${data.id}`;
    if (mine[0]?.status === "accepted" || reverse[0]?.status === "accepted") return { ok: true as const, state: "accepted" as const };
    if (mine[0]?.status === "pending") return { ok: true as const, state: "pending" as const };
    await sql`
      insert into qayd_friends (from_id, to_id, status, created_at)
      values (${me}, ${data.id}, 'pending', ${now})
      on conflict (from_id, to_id) do update set status = 'pending', created_at = ${now}`;
    const mineName = await personName(sql, me);
    await pushNotice(sql, data.id, {
      kind: "friend_request",
      title: "طلب صداقة",
      body: `${mineName} يبي يضيفك`,
      href: "friends",
      dedupe: `friend_request:${me}`,
    });
    return { ok: true as const, state: "pending" as const };
  });

export const respondFriend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = asObject(input);
    const action = body.action;
    if (action !== "accept" && action !== "refuse" && action !== "cancel" && action !== "block" && action !== "remove" && action !== "unblock") throw new Error("طلب غير صالح");
    return { id: cleanId(body.id), action };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureFriends(sql);
    const me = context.userId;
    const now = Date.now();
    if (data.action === "accept") {
      const pending = await sql<{ from_id: string }>`
        select from_id from qayd_friends where from_id = ${data.id} and to_id = ${me} and status = 'pending'`;
      if (!pending.length) throw new Error("ما فيه طلب معلّق");
      await sql`update qayd_friends set status = 'accepted' where from_id = ${data.id} and to_id = ${me}`;
      await sql`
        insert into qayd_friends (from_id, to_id, status, created_at)
        values (${me}, ${data.id}, 'accepted', ${now})
        on conflict (from_id, to_id) do update set status = 'accepted'`;
      const mineName = await personName(sql, me);
      await pushNotice(sql, data.id, {
        kind: "friend_accept",
        title: "انقبلت الصداقة",
        body: `${mineName} قبل طلبك`,
        href: "friends",
        dedupe: `friend_accept:${me}:${now}`,
      });
    } else if (data.action === "refuse") {
      const pending = await sql<{ from_id: string }>`
        select from_id from qayd_friends where from_id = ${data.id} and to_id = ${me} and status = 'pending'`;
      await sql`delete from qayd_friends where from_id = ${data.id} and to_id = ${me} and status = 'pending'`;
      if (pending.length) {
        const mineName = await personName(sql, me);
        await pushNotice(sql, data.id, {
          kind: "friend_refuse",
          title: "ما انقبل الطلب",
          body: `${mineName} رفض طلب الصداقة`,
          href: "friends",
          dedupe: `friend_refuse:${me}:${now}`,
        });
      }
    } else if (data.action === "cancel") {
      await sql`delete from qayd_friends where from_id = ${me} and to_id = ${data.id} and status = 'pending'`;
    } else if (data.action === "unblock") {
      await sql`delete from qayd_friends where from_id = ${me} and to_id = ${data.id} and status = 'blocked'`;
    } else if (data.action === "remove") {
      await sql`delete from qayd_friends where status = 'accepted' and ((from_id = ${me} and to_id = ${data.id}) or (from_id = ${data.id} and to_id = ${me}))`;
    } else {
      await sql`delete from qayd_friends where (from_id = ${me} and to_id = ${data.id}) or (from_id = ${data.id} and to_id = ${me})`;
      await sql`
        insert into qayd_friends (from_id, to_id, status, created_at)
        values (${me}, ${data.id}, 'blocked', ${now})
        on conflict (from_id, to_id) do update set status = 'blocked', created_at = ${now}`;
    }
    return { ok: true as const };
  });


/** Send a friend a real invitation to a room. They see it on their next friends poll. */
export const inviteFriend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = asObject(input);
    return { id: cleanId(body.id), code: cleanCode(body.code) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureFriends(sql);
    const me = context.userId;
    const now = Date.now();
    const link = await sql<{ status: string }>`
      select status from qayd_friends
      where status = 'accepted' and ((from_id = ${me} and to_id = ${data.id}) or (from_id = ${data.id} and to_id = ${me}))
      limit 1`;
    if (!link.length) throw new Error("الدعوة للأصدقاء فقط");
    await sql`
      insert into qayd_invites (from_id, to_id, code, at)
      values (${me}, ${data.id}, ${data.code}, ${now})
      on conflict (from_id, to_id) do update set code = excluded.code, at = excluded.at`;
    const mineName = await personName(sql, me);
    await pushNotice(sql, data.id, {
      kind: "play_invite",
      title: "دعوة لصكة",
      body: `${mineName} يدعوك للطاولة`,
      href: `room:${data.code}`,
      dedupe: `play_invite:${me}:${data.code}`,
    });
    if (Math.random() < 0.05) await sql`delete from qayd_invites where at < ${now - 10 * INVITE_MS}`;
    return { ok: true as const };
  });

export const openFriend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: cleanId(asObject(input).id) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureFriends(sql);
    const me = context.userId;
    if (data.id === me) throw new Error("هذا حسابك");
    const users = await sql<{ id: string; name: string | null }>`
      select u.id, coalesce(nullif(p.display_name, ''), u.name) as name
      from "user" u
      left join qayd_profiles p on p.user_id = u.id
      where u.id = ${data.id}`;
    if (!users.length) throw new Error("ما لقينا هذا الحساب");
    const links = await sql<{ from_id: string; to_id: string; status: string }>`
      select from_id, to_id, status from qayd_friends
      where (from_id = ${me} and to_id = ${data.id}) or (from_id = ${data.id} and to_id = ${me})`;
    const blocked = links.some((row) => row.status === "blocked");
    let relation: "friend" | "incoming" | "outgoing" | "none" | "blocked" = "none";
    if (blocked) relation = "blocked";
    else if (links.some((row) => row.status === "accepted")) relation = "friend";
    else if (links.some((row) => row.status === "pending" && row.to_id === me)) relation = "incoming";
    else if (links.some((row) => row.status === "pending" && row.from_id === me)) relation = "outgoing";
    const name = cleanName(users[0].name || "لاعب");
    if (relation === "blocked") return { id: data.id, name, relation, blocked: true as const };
    const profiles = await sql<{ data: unknown; last_seen: number | null; xp_total: number | null }>`
      select data, last_seen, xp_total from qayd_profiles where user_id = ${data.id}`;
    const profile = asObject(profiles[0]?.data);
    const rank = asObject(profile.rank);
    const photoRaw = typeof profile.photo === "string" ? profile.photo : "";
    const photo = photoRaw.startsWith("data:image/") && photoRaw.length < 150_000 ? photoRaw : "";
    const mark = profile.mark === "h" || profile.mark === "d" || profile.mark === "c" || profile.mark === "s" ? profile.mark : "";
    const card = rankCard(profiles[0]?.xp_total == null ? 0 : Number(profiles[0].xp_total));
    const now = Date.now();
    const online = now - Number(profiles[0]?.last_seen || 0) < ONLINE_MS;
    let phase: string | null = null;
    if (relation === "friend") {
      const seats = await sql<{ phase: string }>`
        select r.phase from qayd_members m
        join qayd_rooms r on r.code = m.code
        where m.user_id = ${data.id} and m.last_seen > ${now - STALE_MS}`;
      phase = seats.some((seat) => seat.phase === "live") ? "live" : (seats[0]?.phase ?? null);
    }
    const wins = countField(profile.wins);
    const games = countField(profile.games);
    return {
      id: data.id,
      name,
      relation,
      blocked: false as const,
      online,
      activity: relation === "friend" ? activityOf(online, phase) : activityOf(online, null),
      photo,
      mark,
      ...card,
      wins,
      games,
      losses: wins != null && games != null ? Math.max(0, games - wins) : null,
      hands: countField(rank.hands),
      kaboots: countField(rank.kaboots),
      best: countField(rank.best),
      earned: knownAchievements(rank.ach),
    };
  });

export const listNotices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureFriends(sql);
    const me = context.userId;
    const rows = await sql<{ id: number; kind: string; title: string; body: string; href: string; read_at: number | null; created_at: number }>`
      select id, kind, title, body, href, read_at, created_at
      from qayd_notifications
      where user_id = ${me}
      order by created_at desc
      limit 50`;
    const unreadRows = await sql<{ n: number }>`
      select count(*)::int as n from qayd_notifications where user_id = ${me} and read_at is null`;
    return {
      unread: Number(unreadRows[0]?.n || 0),
      items: rows.map((row) => ({
        id: String(row.id),
        kind: row.kind,
        title: row.title,
        body: row.body,
        href: row.href,
        read: row.read_at != null,
        at: Number(row.created_at) || 0,
      })),
    };
  });

export const markNotices = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = asObject(input);
    if (body.all === true) return { all: true as const, ids: [] as string[] };
    const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id)).filter((id) => /^\d+$/.test(id)).slice(0, 50) : [];
    if (!ids.length) throw new Error("حدد إشعاراً");
    return { all: false as const, ids };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureFriends(sql);
    const now = Date.now();
    const me = context.userId;
    if (data.all) {
      await sql`update qayd_notifications set read_at = ${now} where user_id = ${me} and read_at is null`;
    } else {
      for (const id of data.ids) {
        await sql`update qayd_notifications set read_at = ${now} where user_id = ${me} and id = ${Number(id)} and read_at is null`;
      }
    }
    return { ok: true as const };
  });

export const clearNotices = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = asObject(input);
    if (body.all === true) return { mode: "all" as const, id: "" };
    if (body.read === true) return { mode: "read" as const, id: "" };
    const id = String(body.id ?? "");
    if (!/^\d+$/.test(id)) throw new Error("حدد إشعاراً");
    return { mode: "one" as const, id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureFriends(sql);
    const me = context.userId;
    if (data.mode === "all") await sql`delete from qayd_notifications where user_id = ${me}`;
    else if (data.mode === "read") await sql`delete from qayd_notifications where user_id = ${me} and read_at is not null`;
    else await sql`delete from qayd_notifications where user_id = ${me} and id = ${Number(data.id)}`;
    return { ok: true as const };
  });

function cleanLine(value: unknown, max: number) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}

/** Staff-only. Ordinary accounts are rejected. There is no in-game admin button. */
export const publishNotice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = asObject(input);
    const title = cleanLine(body.title, 80);
    const text = cleanLine(body.body, 240);
    if (!title) throw new Error("اكتب عنوان الإعلان");
    const everyone = body.everyone === true;
    const userIds = Array.isArray(body.userIds)
      ? body.userIds.map((id) => cleanId(id)).slice(0, 200)
      : [];
    if (everyone && body.confirm !== "broadcast") throw new Error("تأكيد الإعلان ناقص");
    if (!everyone && !userIds.length) throw new Error("حدد الحسابات");
    return { title, text, everyone, userIds };
  })
  .handler(async ({ context, data }) => {
    if (!isAdminId(context.userId, process.env.QAYD_ADMIN_IDS)) throw new Error("غير مصرّح");
    const sql = await getSql();
    await ensureFriends(sql);
    const targets = data.everyone
      ? (await sql<{ id: string }>`select id from "user" limit 5000`).map((row) => row.id)
      : data.userIds;
    const stamp = Date.now();
    for (const userId of targets) {
      await pushNotice(sql, userId, {
        kind: "system",
        title: data.title,
        body: data.text,
        href: "",
        dedupe: `system:${stamp}`,
      });
    }
    return { ok: true as const, sent: targets.length };
  });


/* ───────────── Online moves ─────────────
 * Every phone runs the same match. The only thing that travels is the list of
 * decisions (the deal, each bid, each card, a bot catching a cut), numbered
 * 0, 1, 2… The first write for a number wins, so all phones apply the same
 * list in the same order. Supabase Realtime pushes each new move at once;
 * pulling is the fallback and the way a returning player catches up. */

function supabaseRealtime() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const publicKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim();
  if (!url || !secret || !publicKey) return null;
  return { url, secret, publicKey };
}

/** An unguessable channel name per match: only the players get it, inside the start message. */
async function movesTopic(matchId: string) {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "qayd-local-moves";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`moves:${matchId}`)));
  return "qm-" + Array.from(mac.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function broadcastMoves(topic: string, moves: { k: number; seat: number; body: unknown }[]) {
  const rt = supabaseRealtime();
  if (!rt || !moves.length) return;
  const headers: Record<string, string> = { "content-type": "application/json", apikey: rt.secret };
  if (rt.secret.startsWith("eyJ")) headers.authorization = `Bearer ${rt.secret}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    await fetch(`${rt.url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: [{ topic, event: "m", payload: { moves }, private: false }] }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
  } catch {
    /* Pulling still delivers the move. */
  }
}

async function seatedIn(sql: SqlClient, matchId: string, userId: string) {
  const rows = await sql<{ seat: number }>`
    select seat from qayd_match_seats where match_id = ${matchId} and user_id = ${userId}`;
  return rows[0] ? Number(rows[0].seat) : null;
}

function cleanMove(value: unknown) {
  const raw = JSON.stringify(value ?? null);
  if (raw.length > 2000) throw new Error("الحركة كبيرة");
  return JSON.parse(raw) as Json;
}

/**
 * The deal is the server's: whatever deck a phone sends is thrown away and the
 * server shuffles instead, so no phone can stack the cards. Only the first
 * write for a move number is kept, so every phone still gets the same deck.
 */
function serverDealt(body: Json): Json {
  const obj = asObject(body);
  if (!Array.isArray(obj.d)) return body;
  return { d: serverDeck() };
}

/** Where the instant channel lives (public values only), or null to pull. */
export const movesConfig = createServerFn({ method: "GET" }).handler(async () => {
  const rt = supabaseRealtime();
  return rt ? { url: rt.url, key: rt.publicKey } : null;
});

export const pushMove = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = asObject(input);
    const k = Number(body.k);
    const seat = Number(body.seat);
    if (!Number.isInteger(k) || k < 0 || k > 6000) throw new Error("رقم الحركة غير صالح");
    if (!Number.isInteger(seat) || seat < -1 || seat > 3) throw new Error("المقعد غير صالح");
    return { matchId: cleanMatchId(body.matchId), k, seat, body: cleanMove(body.body) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureSchema(sql);
    if ((await seatedIn(sql, data.matchId, context.userId)) == null) {
      return { ok: false as const, error: "لست في هذه الصكة" };
    }
    const now = Date.now();
    const body = serverDealt(data.body);
    const inserted = await sql<{ k: number }>`
      insert into qayd_moves (match_id, k, seat, user_id, body, at)
      values (${data.matchId}, ${data.k}, ${data.seat}, ${context.userId}, ${JSON.stringify(body)}::jsonb, ${now})
      on conflict (match_id, k) do nothing
      returning k`;
    const rows = await sql<{ k: number; seat: number; body: unknown }>`
      select k, seat, body from qayd_moves where match_id = ${data.matchId} and k = ${data.k}`;
    const move = rows[0] ? { k: Number(rows[0].k), seat: Number(rows[0].seat), body: asObject(rows[0].body) } : null;
    if (inserted.length && move) await broadcastMoves(await movesTopic(data.matchId), [move]);
    return { ok: true as const, move };
  });

export const pullMoves = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const body = asObject(input);
    return { matchId: cleanMatchId(body.matchId), since: Math.max(-1, Math.floor(Number(body.since) || -1)) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureSchema(sql);
    if ((await seatedIn(sql, data.matchId, context.userId)) == null) {
      return { ok: false as const, error: "لست في هذه الصكة", moves: [] as never[] };
    }
    const rows = await sql<{ k: number; seat: number; body: unknown }>`
      select k, seat, body from qayd_moves
      where match_id = ${data.matchId} and k > ${data.since}
      order by k asc limit 400`;
    return { ok: true as const, moves: rows.map((r) => ({ k: Number(r.k), seat: Number(r.seat), body: asObject(r.body) })) };
  });
