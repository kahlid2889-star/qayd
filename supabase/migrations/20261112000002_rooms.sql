-- ============================================================================
-- Qayd v2 — rooms (the lobby): create, join, sit, host settings, invites.
-- A player is in at most one room. Seats: 0 and 2 are partners, 1 and 3 are partners.
-- Empty seats are played by the computer when the match starts.
-- ============================================================================
create table public.rooms (
  code        text primary key check (code ~ '^[0-9]{6}$'),
  host_id     uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'lobby' check (status in ('lobby', 'live', 'closed')),
  visibility  text not null default 'friends' check (visibility in ('public', 'friends', 'private')),
  settings    jsonb not null default '{"mode":"friendly","len":152,"stake":0,"turn_seconds":25}'::jsonb,
  match_id    uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index rooms_public_idx on public.rooms (status, visibility, created_at desc);

create table public.room_members (
  room_code    text not null references public.rooms (code) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  seat         smallint check (seat between 0 and 3),
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_code, user_id)
);
create unique index room_members_seat_key on public.room_members (room_code, seat) where seat is not null;
create unique index room_members_one_room on public.room_members (user_id);
create index room_members_user_idx on public.room_members (user_id);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
revoke all on public.rooms, public.room_members from anon, authenticated;
grant select on public.rooms, public.room_members to authenticated;
-- Policies call this helper instead of querying room_members directly: a policy on room_members that reads
-- room_members would recurse. The helper is security definer, so it bypasses RLS.
create or replace function public.is_room_member(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.room_members m where m.room_code = p_code and m.user_id = auth.uid());
$$;
create policy rooms_member on public.rooms for select to authenticated using (public.is_room_member(code));
create policy room_members_same_room on public.room_members for select to authenticated using (public.is_room_member(room_code));

-- ---------- Realtime: doorbells on private channels ----------
-- room:<code>  -> members of that room.   user:<uuid> -> that player only.
create or replace function public.ring_rooms_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c text := case when tg_op = 'DELETE' then old.code else new.code end;
begin
  perform realtime.send(jsonb_build_object('kind', 'room', 'code', c, 'at', now()), 'room', 'room:' || c, true);
  return null;
end $$;
create or replace function public.ring_members_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c text := case when tg_op = 'DELETE' then old.room_code else new.room_code end;
begin
  perform realtime.send(jsonb_build_object('kind', 'room', 'code', c, 'at', now()), 'room', 'room:' || c, true);
  return null;
end $$;
create trigger rooms_ring after insert or update or delete on public.rooms
  for each row execute function public.ring_rooms_row();
create trigger room_members_ring after insert or update or delete on public.room_members
  for each row execute function public.ring_members_row();

create policy realtime_read_own_topics on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'broadcast' and (
    realtime.topic() = 'user:' || auth.uid()::text
    or (realtime.topic() like 'room:%' and public.is_room_member(substr(realtime.topic(), 6)))
  )
);

-- ---------- helpers ----------
create or replace function public.clean_settings(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare mode text := coalesce(p ->> 'mode', 'friendly'); len int := coalesce((p ->> 'len')::int, 152);
        stake int := coalesce((p ->> 'stake')::int, 0); ts int := coalesce((p ->> 'turn_seconds')::int, 25);
begin
  if mode not in ('friendly', 'free') then perform public.fail('نوع اللعب غير صالح'); end if;
  if len not in (61, 101, 152) then perform public.fail('مدة الصكة غير صالحة'); end if;
  if stake not in (0, 100, 500, 1000, 2500) then perform public.fail('مبلغ اللعب غير صالح'); end if;
  if ts not in (15, 25, 40) then perform public.fail('وقت الدور غير صالح'); end if;
  return jsonb_build_object('mode', mode, 'len', len, 'stake', stake, 'turn_seconds', ts);
end $$;

-- Drop players who stopped sending heartbeats (closed the app). Lobby only; a live match handles absence itself.
create or replace function public.sweep_room(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select * into r from public.rooms where code = p_code for update;
  if not found or r.status <> 'lobby' then return; end if;
  delete from public.room_members where room_code = p_code and last_seen_at < now() - interval '75 seconds';
  if not exists (select 1 from public.room_members where room_code = p_code) then
    delete from public.rooms where code = p_code;
  elsif not exists (select 1 from public.room_members where room_code = p_code and user_id = r.host_id) then
    update public.rooms set host_id = (select user_id from public.room_members where room_code = p_code order by joined_at limit 1),
           updated_at = now() where code = p_code;
  end if;
end $$;

create or replace function public.free_seat(p_code text) returns smallint
language sql stable set search_path = '' as $$
  select s::smallint from unnest(array[0, 2, 1, 3]) s
   where not exists (select 1 from public.room_members m where m.room_code = p_code and m.seat = s) limit 1;
$$;

-- Full room snapshot for the lobby screen.
create or replace function public.get_room(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); r record;
begin
  perform public.sweep_room(p_code);
  select * into r from public.rooms where code = p_code;
  if not found then perform public.fail('الغرفة غير موجودة'); end if;
  if not exists (select 1 from public.room_members where room_code = p_code and user_id = uid) then
    perform public.fail('أنت مو في هذي الغرفة');
  end if;
  return jsonb_build_object(
    'code', r.code, 'status', r.status, 'visibility', r.visibility, 'settings', r.settings, 'host_id', r.host_id, 'match_id', r.match_id,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar', p.avatar, 'xp', p.xp,
               'seat', m.seat, 'is_host', (m.user_id = r.host_id),
               'online', (m.last_seen_at > now() - interval '40 seconds')) order by m.seat nulls last, m.joined_at)
      from public.room_members m join public.profiles p on p.id = m.user_id where m.room_code = p_code), '[]'::jsonb));
end $$;

create or replace function public.my_room() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); c text;
begin
  select room_code into c from public.room_members where user_id = uid;
  if c is null then return null; end if;
  begin return public.get_room(c); exception when others then return null; end;
end $$;

create or replace function public.new_room_code() returns text
language plpgsql volatile set search_path = '' as $$
declare c text; n int := 0;
begin
  loop
    c := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    exit when not exists (select 1 from public.rooms where code = c);
    n := n + 1; if n > 50 then perform public.fail('جرّب مرة ثانية'); end if;
  end loop;
  return c;
end $$;

-- ---------- player actions ----------
create or replace function public.leave_room(p_code text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); c text; r record;
begin
  select room_code into c from public.room_members where user_id = uid and (p_code is null or room_code = p_code);
  if c is null then return; end if;
  select * into r from public.rooms where code = c for update;
  if r.status = 'live' then perform public.fail('الصكة قائمة. اطلع من داخل الطاولة'); end if;
  delete from public.room_members where room_code = c and user_id = uid;
  if not exists (select 1 from public.room_members where room_code = c) then
    delete from public.rooms where code = c;
  elsif r.host_id = uid then
    update public.rooms set host_id = (select user_id from public.room_members where room_code = c order by joined_at limit 1),
           updated_at = now() where code = c;
  end if;
end $$;

create or replace function public.create_room(p_settings jsonb default '{}'::jsonb, p_visibility text default 'friends') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); c text; s jsonb := public.clean_settings(p_settings);
begin
  if p_visibility not in ('public', 'friends', 'private') then perform public.fail('نوع الغرفة غير صالح'); end if;
  if exists (select 1 from public.room_members m join public.rooms r on r.code = m.room_code where m.user_id = uid and r.status = 'live') then
    perform public.fail('عندك صكة قائمة الحين');
  end if;
  perform public.leave_room(null);
  c := public.new_room_code();
  insert into public.rooms (code, host_id, visibility, settings) values (c, uid, p_visibility, s);
  insert into public.room_members (room_code, user_id, seat) values (c, uid, 0);
  return public.get_room(c);
end $$;

create or replace function public.join_room(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); r record; seat smallint;
begin
  perform public.sweep_room(p_code);
  select * into r from public.rooms where code = p_code for update;
  if not found then perform public.fail('ما لقينا هذي الغرفة'); end if;
  if exists (select 1 from public.blocks where (blocker = r.host_id and blocked = uid) or (blocker = uid and blocked = r.host_id)) then
    perform public.fail('ما تقدر تدخل هذي الغرفة');
  end if;
  if exists (select 1 from public.room_members where room_code = p_code and user_id = uid) then return public.get_room(p_code); end if;
  if r.status <> 'lobby' then perform public.fail('الصكة قائمة الحين. انتظر الجاية'); end if;
  if exists (select 1 from public.room_members m join public.rooms x on x.code = m.room_code where m.user_id = uid and x.status = 'live') then
    perform public.fail('عندك صكة قائمة في غرفة ثانية');
  end if;
  perform public.leave_room(null);
  seat := public.free_seat(p_code);
  if seat is null then perform public.fail('الغرفة ممتلئة'); end if;
  insert into public.room_members (room_code, user_id, seat) values (p_code, uid, seat);
  return public.get_room(p_code);
end $$;

-- Move myself to a free seat ("اجلس هنا").
create or replace function public.sit(p_code text, p_seat int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); r record;
begin
  if p_seat not between 0 and 3 then perform public.fail('مقعد غير صالح'); end if;
  select * into r from public.rooms where code = p_code for update;
  if not found or r.status <> 'lobby' then perform public.fail('ما تقدر تغيّر المقعد الحين'); end if;
  if not exists (select 1 from public.room_members where room_code = p_code and user_id = uid) then perform public.fail('أنت مو في هذي الغرفة'); end if;
  if exists (select 1 from public.room_members where room_code = p_code and seat = p_seat and user_id <> uid) then
    perform public.fail('المقعد انأخذ');
  end if;
  update public.room_members set seat = p_seat, last_seen_at = now() where room_code = p_code and user_id = uid;
  return public.get_room(p_code);
end $$;

-- Host: seat someone (or swap two players) — the "خلّه ضدي / خلّه معي" buttons.
create or replace function public.assign_seat(p_code text, p_user uuid, p_seat int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); r record; other uuid; mine smallint;
begin
  if p_seat not between 0 and 3 then perform public.fail('مقعد غير صالح'); end if;
  select * into r from public.rooms where code = p_code for update;
  if not found or r.status <> 'lobby' then perform public.fail('ما تقدر تغيّر المقاعد الحين'); end if;
  if r.host_id <> uid then perform public.fail('بس صاحب الطاولة'); end if;
  select seat into mine from public.room_members where room_code = p_code and user_id = p_user;
  if not found then perform public.fail('اللاعب مو في الغرفة'); end if;
  select user_id into other from public.room_members where room_code = p_code and seat = p_seat and user_id <> p_user;
  if other is not null then
    update public.room_members set seat = null where room_code = p_code and user_id = other;
  end if;
  update public.room_members set seat = p_seat where room_code = p_code and user_id = p_user;
  if other is not null then
    update public.room_members set seat = mine where room_code = p_code and user_id = other;
  end if;
  return public.get_room(p_code);
end $$;

create or replace function public.set_room_settings(p_code text, p_settings jsonb, p_visibility text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); r record;
begin
  select * into r from public.rooms where code = p_code for update;
  if not found then perform public.fail('الغرفة غير موجودة'); end if;
  if r.host_id <> uid then perform public.fail('بس صاحب الطاولة يغيّر الإعدادات'); end if;
  if r.status <> 'lobby' then perform public.fail('الإعدادات تتغير قبل البدء بس'); end if;
  if p_visibility is not null and p_visibility not in ('public', 'friends', 'private') then perform public.fail('نوع الغرفة غير صالح'); end if;
  update public.rooms set settings = public.clean_settings(r.settings || p_settings),
         visibility = coalesce(p_visibility, visibility), updated_at = now() where code = p_code;
  return public.get_room(p_code);
end $$;

create or replace function public.kick_member(p_code text, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); r record;
begin
  select * into r from public.rooms where code = p_code for update;
  if not found or r.status <> 'lobby' then perform public.fail('ما تقدر تطرد الحين'); end if;
  if r.host_id <> uid then perform public.fail('بس صاحب الطاولة'); end if;
  if p_user = uid then perform public.fail('ما تقدر تطرد نفسك'); end if;
  delete from public.room_members where room_code = p_code and user_id = p_user;
end $$;

-- Rooms anyone can browse and join.
create or replace function public.list_public_rooms() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  return coalesce((
    select jsonb_agg(x order by x.created_at desc) from (
      select r.code, r.settings, r.created_at, h.display_name as host_name, h.avatar as host_avatar,
             (select count(*) from public.room_members m where m.room_code = r.code and m.seat is not null) as seated
      from public.rooms r join public.profiles h on h.id = r.host_id
      where r.status = 'lobby' and r.visibility = 'public'
        and exists (select 1 from public.room_members m where m.room_code = r.code and m.last_seen_at > now() - interval '75 seconds')
        and not exists (select 1 from public.blocks b where (b.blocker = r.host_id and b.blocked = uid) or (b.blocker = uid and b.blocked = r.host_id))
      order by r.created_at desc limit 30) x), '[]'::jsonb);
end $$;

-- Invite a friend: a notification with the room code; the friend's app rings through user:<uuid>.
create or replace function public.invite_to_room(p_code text, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); r record; target record;
begin
  select * into r from public.rooms where code = p_code;
  if not found or r.status <> 'lobby' then perform public.fail('الغرفة مو متاحة'); end if;
  if not exists (select 1 from public.room_members where room_code = p_code and user_id = uid) then perform public.fail('أنت مو في هذي الغرفة'); end if;
  if not exists (select 1 from public.friendships where user_a = least(uid, p_user) and user_b = greatest(uid, p_user) and status = 'accepted') then
    perform public.fail('الدعوة للأصدقاء بس');
  end if;
  select * into target from public.profiles where id = p_user;
  if not target.accept_invites then perform public.fail('هذا اللاعب ما يستقبل دعوات'); end if;
  if exists (select 1 from public.notifications where user_id = p_user and kind = 'room_invite' and payload ->> 'code' = p_code
             and payload ->> 'from' = uid::text and created_at > now() - interval '2 minutes') then return; end if;
  insert into public.notifications (user_id, kind, payload) values (p_user, 'room_invite', jsonb_build_object('from', uid, 'code', p_code));
end $$;

-- Room heartbeat: one call keeps both presence clocks fresh.
create or replace function public.heartbeat() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  update public.profiles set last_seen_at = now() where id = uid;
  update public.room_members set last_seen_at = now() where user_id = uid;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function
  public.get_my_profile(), public.update_my_profile(text, text, boolean, boolean, boolean), public.heartbeat(),
  public.search_players(text), public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid), public.block_user(uuid), public.unblock_user(uuid), public.list_friends(),
  public.list_notifications(), public.mark_notifications_read(),
  public.get_room(text), public.my_room(), public.create_room(jsonb, text), public.join_room(text), public.leave_room(text),
  public.sit(text, int), public.assign_seat(text, uuid, int), public.set_room_settings(text, jsonb, text),
  public.kick_member(text, uuid), public.list_public_rooms(), public.invite_to_room(text, uuid),
  public.is_room_member(text)
to authenticated;
