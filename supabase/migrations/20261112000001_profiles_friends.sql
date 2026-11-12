-- ============================================================================
-- Qayd v2 — accounts, friends, blocks, notifications.
-- Identity is Supabase Auth (auth.users). Everything here keys on its uuid.
-- Clients READ through RLS / column grants and WRITE only through the RPCs below.
-- ============================================================================

-- ---------- profiles ----------
create table public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  username               text not null,
  display_name           text not null,
  avatar                 text not null default 'default',
  xp                     integer not null default 0 check (xp >= 0),
  show_online            boolean not null default true,
  accept_friend_requests boolean not null default true,
  accept_invites         boolean not null default true,
  last_seen_at           timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_len check (char_length(btrim(display_name)) between 1 and 14),
  constraint profiles_avatar_len check (char_length(avatar) <= 40)
);
create unique index profiles_username_key on public.profiles (username);
alter table public.profiles enable row level security;

-- Any signed-in player may see the public fields of any profile (needed for friend search and seats).
-- Private settings and last_seen are never granted; they are served by get_my_profile() / list_friends().
revoke all on public.profiles from anon, authenticated;
grant select (id, username, display_name, avatar, xp, created_at) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (true);

-- ---------- sign-up hook: create the profile ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text := lower(btrim(coalesce(meta ->> 'username', '')));
  dname text := btrim(coalesce(meta ->> 'display_name', ''));
begin
  if uname !~ '^[a-z0-9_]{3,20}$' or exists (select 1 from public.profiles p where p.username = uname) then
    uname := 'p' || substr(replace(new.id::text, '-', ''), 1, 9);
  end if;
  if dname = '' then dname := uname; end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, uname, left(dname, 14));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- friendships (one canonical row per pair) ----------
create table public.friendships (
  user_a       uuid not null references public.profiles (id) on delete cascade,
  user_b       uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  status       text not null check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (requested_by in (user_a, user_b))
);
create index friendships_b_idx on public.friendships (user_b);
alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;
create policy friendships_own on public.friendships for select to authenticated
  using (auth.uid() in (user_a, user_b));

create table public.blocks (
  blocker    uuid not null references public.profiles (id) on delete cascade,
  blocked    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
grant select on public.blocks to authenticated;
create policy blocks_own on public.blocks for select to authenticated using (blocker = auth.uid());

-- ---------- notifications ----------
create table public.notifications (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('friend_request', 'friend_accepted', 'room_invite')),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());

-- Push a doorbell to the recipient's private channel. Clients then fetch; the payload carries no secrets.
create or replace function public.notify_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('kind', new.kind, 'id', new.id), 'notify', 'user:' || new.user_id::text, true);
  return new;
end $$;
create trigger notifications_ring after insert on public.notifications
for each row execute function public.notify_user();

-- ============================================================================
-- RPCs. All security definer, fixed search_path, executable by signed-in players only.
-- Messages are written for the player (Arabic).
-- ============================================================================
create or replace function public.fail(msg text) returns void
language plpgsql immutable set search_path = '' as $$
begin raise exception '%', msg using errcode = 'P0001'; end $$;

create or replace function public.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then perform public.fail('سجّل دخولك أول'); end if;
  return uid;
end $$;

-- username availability: callable before sign-up (anonymous) so the form can answer instantly.
create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select lower(btrim(p_username)) ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles p where p.username = lower(btrim(p_username)));
$$;

create or replace function public.get_my_profile() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user(); r record;
begin
  select * into r from public.profiles where id = uid;
  return jsonb_build_object('id', r.id, 'username', r.username, 'display_name', r.display_name, 'avatar', r.avatar,
    'xp', r.xp, 'show_online', r.show_online, 'accept_friend_requests', r.accept_friend_requests,
    'accept_invites', r.accept_invites, 'created_at', r.created_at);
end $$;

create or replace function public.update_my_profile(
  p_display_name text default null, p_avatar text default null,
  p_show_online boolean default null, p_accept_friend_requests boolean default null, p_accept_invites boolean default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); dn text := btrim(p_display_name);
begin
  if dn is not null and char_length(dn) not between 1 and 14 then perform public.fail('الاسم من ١ إلى ١٤ حرف'); end if;
  if p_avatar is not null and char_length(p_avatar) > 40 then perform public.fail('الصورة غير صالحة'); end if;
  update public.profiles set
    display_name = coalesce(dn, display_name),
    avatar = coalesce(p_avatar, avatar),
    show_online = coalesce(p_show_online, show_online),
    accept_friend_requests = coalesce(p_accept_friend_requests, accept_friend_requests),
    accept_invites = coalesce(p_accept_invites, accept_invites)
  where id = uid;
  return public.get_my_profile();
end $$;

-- Heartbeat: keeps "online" and room presence fresh. Called every ~25 s by the app.
create or replace function public.heartbeat() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  update public.profiles set last_seen_at = now() where id = uid;
end $$;

-- ---------- friends ----------
create or replace function public.search_players(p_query text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user(); q text := lower(btrim(p_query));
begin
  if char_length(q) < 2 then perform public.fail('اكتب حرفين على الأقل'); end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
             'avatar', p.avatar, 'xp', p.xp,
             'relation', case
               when f.status = 'accepted' then 'friend'
               when f.status = 'pending' and f.requested_by = uid then 'outgoing'
               when f.status = 'pending' then 'incoming'
               else 'none' end))
    from (select * from public.profiles
           where id <> uid
             and (username like replace(replace(q, '_', '\_'), '%', '\%') || '%' or lower(display_name) like '%' || replace(replace(q, '_', '\_'), '%', '\%') || '%')
             and not exists (select 1 from public.blocks b where (b.blocker = id and b.blocked = uid) or (b.blocker = uid and b.blocked = id))
           order by (username = q) desc, username limit 20) p
    left join public.friendships f on (f.user_a, f.user_b) = (least(uid, p.id), greatest(uid, p.id))
  ), '[]'::jsonb);
end $$;

create or replace function public.send_friend_request(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); a uuid := least(uid, p_user); b uuid := greatest(uid, p_user); f record; target record;
begin
  if p_user = uid then perform public.fail('ما تقدر تضيف نفسك'); end if;
  select * into target from public.profiles where id = p_user;
  if not found then perform public.fail('ما لقينا هذا اللاعب'); end if;
  if exists (select 1 from public.blocks where (blocker = p_user and blocked = uid) or (blocker = uid and blocked = p_user)) then
    perform public.fail('ما تقدر ترسل لهذا اللاعب');
  end if;
  select * into f from public.friendships where user_a = a and user_b = b;
  if found then
    if f.status = 'accepted' then return 'friend'; end if;
    if f.requested_by = uid then return 'outgoing'; end if;
    -- they already asked us: sending a request back accepts it
    update public.friendships set status = 'accepted', responded_at = now() where user_a = a and user_b = b;
    insert into public.notifications (user_id, kind, payload) values (p_user, 'friend_accepted', jsonb_build_object('from', uid));
    return 'friend';
  end if;
  if not target.accept_friend_requests then perform public.fail('هذا اللاعب ما يستقبل طلبات'); end if;
  if (select count(*) from public.friendships where requested_by = uid and status = 'pending') >= 30 then
    perform public.fail('عندك طلبات كثيرة معلّقة. انتظر ردّهم');
  end if;
  if (select count(*) from public.friendships where (user_a = uid or user_b = uid) and status = 'accepted') >= 200 then
    perform public.fail('وصلت الحد الأقصى للأصدقاء');
  end if;
  insert into public.friendships (user_a, user_b, requested_by, status) values (a, b, uid, 'pending');
  insert into public.notifications (user_id, kind, payload) values (p_user, 'friend_request', jsonb_build_object('from', uid));
  return 'outgoing';
end $$;

create or replace function public.respond_friend_request(p_user uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); a uuid := least(uid, p_user); b uuid := greatest(uid, p_user); n int;
begin
  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now()
     where user_a = a and user_b = b and status = 'pending' and requested_by = p_user;
    get diagnostics n = row_count;
    if n = 0 then perform public.fail('ما فيه طلب معلّق'); end if;
    insert into public.notifications (user_id, kind, payload) values (p_user, 'friend_accepted', jsonb_build_object('from', uid));
  else
    delete from public.friendships where user_a = a and user_b = b and status = 'pending' and requested_by = p_user;
  end if;
end $$;

-- Cancel my own pending request, or remove an accepted friend.
create or replace function public.remove_friend(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  delete from public.friendships where user_a = least(uid, p_user) and user_b = greatest(uid, p_user)
     and (status = 'accepted' or requested_by = uid);
end $$;

create or replace function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  if p_user = uid then perform public.fail('ما تقدر تحظر نفسك'); end if;
  if not exists (select 1 from public.profiles where id = p_user) then perform public.fail('ما لقينا هذا اللاعب'); end if;
  insert into public.blocks (blocker, blocked) values (uid, p_user) on conflict do nothing;
  delete from public.friendships where user_a = least(uid, p_user) and user_b = greatest(uid, p_user);
end $$;

create or replace function public.unblock_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  delete from public.blocks where blocker = uid and blocked = p_user;
end $$;

-- Friends book in one call. Online = seen in the last 70 s and not hidden.
create or replace function public.list_friends() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  return jsonb_build_object(
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar', p.avatar, 'xp', p.xp,
               'online', (p.show_online and p.last_seen_at > now() - interval '70 seconds'),
               'room_code', case when p.show_online and r.status = 'lobby' and r.visibility <> 'private' then r.code end)
             order by (p.show_online and p.last_seen_at > now() - interval '70 seconds') desc, p.display_name)
      from public.friendships f
      join public.profiles p on p.id = case when f.user_a = uid then f.user_b else f.user_a end
      left join public.room_members m on m.user_id = p.id
      left join public.rooms r on r.code = m.room_code
      where f.status = 'accepted' and uid in (f.user_a, f.user_b)), '[]'::jsonb),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar', p.avatar, 'xp', p.xp, 'at', f.created_at) order by f.created_at desc)
      from public.friendships f join public.profiles p on p.id = f.requested_by
      where f.status = 'pending' and f.requested_by <> uid and uid in (f.user_a, f.user_b)), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar', p.avatar, 'xp', p.xp, 'at', f.created_at) order by f.created_at desc)
      from public.friendships f join public.profiles p on p.id = case when f.user_a = uid then f.user_b else f.user_a end
      where f.status = 'pending' and f.requested_by = uid), '[]'::jsonb),
    'blocked', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar', p.avatar) order by b.created_at desc)
      from public.blocks b join public.profiles p on p.id = b.blocked where b.blocker = uid), '[]'::jsonb)
  );
end $$;

create or replace function public.list_notifications() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  return jsonb_build_object(
    'unread', (select count(*) from public.notifications where user_id = uid and read_at is null),
    'items', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select n.id, n.kind, n.payload, n.created_at, n.read_at, p.display_name as from_name, p.username as from_username
        from public.notifications n left join public.profiles p on p.id = (n.payload ->> 'from')::uuid
        where n.user_id = uid and n.created_at > now() - interval '14 days'
        order by n.created_at desc limit 40) x), '[]'::jsonb));
end $$;

create or replace function public.mark_notifications_read() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  update public.notifications set read_at = now() where user_id = uid and read_at is null;
end $$;

-- ---------- execute rights ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function
  public.get_my_profile(), public.update_my_profile(text, text, boolean, boolean, boolean), public.heartbeat(),
  public.search_players(text), public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid), public.block_user(uuid), public.unblock_user(uuid), public.list_friends(),
  public.list_notifications(), public.mark_notifications_read()
to authenticated;
