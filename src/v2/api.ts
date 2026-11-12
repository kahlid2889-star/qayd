import { supabase } from "./supabase";

export type Mode = "friendly" | "free";
export type Visibility = "public" | "friends" | "private";
export type RoomSettings = { mode: Mode; len: number; stake: number; turn_seconds: number };

export type Profile = {
  id: string; username: string; display_name: string; avatar: string; xp: number;
  show_online: boolean; accept_friend_requests: boolean; accept_invites: boolean; created_at: string;
};
export type Person = { id: string; username: string; display_name: string; avatar: string; xp?: number };
export type Friend = Person & { online: boolean; room_code: string | null };
export type Pending = Person & { at: string };
export type FriendBook = { friends: Friend[]; incoming: Pending[]; outgoing: Pending[]; blocked: Person[] };
export type SearchHit = Person & { relation: "none" | "friend" | "outgoing" | "incoming" };
export type Member = Person & { seat: number | null; is_host: boolean; online: boolean };
export type Room = { code: string; status: "lobby" | "live" | "closed"; visibility: Visibility; settings: RoomSettings; host_id: string; match_id: string | null; members: Member[] };
export type PublicRoom = { code: string; settings: RoomSettings; created_at: string; host_name: string; host_avatar: string; seated: number };
export type Notice = { id: number; kind: "friend_request" | "friend_accepted" | "room_invite"; payload: { from?: string; code?: string }; created_at: string; read_at: string | null; from_name: string | null; from_username: string | null };
export type Wallet = { coins: number; history: { delta: number; reason: string; ref: string; created_at: string }[] };

/** Every RPC returns data or throws an Error whose message is already written for the player. */
async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(name, args);
  if (error) throw new Error(friendly(error.message));
  return data as T;
}
function friendly(m: string): string {
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "ما فيه اتصال. جرّب بعد شوي";
  if (/JWT|expired/i.test(m)) return "انتهت جلستك. سجّل دخولك من جديد";
  return m;
}

export const api = {
  usernameAvailable: (u: string) => call<boolean>("username_available", { p_username: u }),
  myProfile: () => call<Profile>("get_my_profile"),
  updateProfile: (p: { display_name?: string; avatar?: string; show_online?: boolean; accept_friend_requests?: boolean; accept_invites?: boolean }) =>
    call<Profile>("update_my_profile", { p_display_name: p.display_name ?? null, p_avatar: p.avatar ?? null, p_show_online: p.show_online ?? null,
      p_accept_friend_requests: p.accept_friend_requests ?? null, p_accept_invites: p.accept_invites ?? null }),
  heartbeat: () => call<void>("heartbeat"),
  wallet: () => call<Wallet>("get_my_wallet"),
  pingMe: () => call<void>("ping_me"),

  friends: () => call<FriendBook>("list_friends"),
  search: (q: string) => call<SearchHit[]>("search_players", { p_query: q }),
  sendRequest: (id: string) => call<string>("send_friend_request", { p_user: id }),
  respond: (id: string, accept: boolean) => call<void>("respond_friend_request", { p_user: id, p_accept: accept }),
  removeFriend: (id: string) => call<void>("remove_friend", { p_user: id }),
  block: (id: string) => call<void>("block_user", { p_user: id }),
  unblock: (id: string) => call<void>("unblock_user", { p_user: id }),
  notices: () => call<{ unread: number; items: Notice[] }>("list_notifications"),
  markRead: () => call<void>("mark_notifications_read"),

  myRoom: () => call<Room | null>("my_room"),
  getRoom: (code: string) => call<Room>("get_room", { p_code: code }),
  createRoom: (settings: Partial<RoomSettings>, visibility: Visibility) => call<Room>("create_room", { p_settings: settings, p_visibility: visibility }),
  joinRoom: (code: string) => call<Room>("join_room", { p_code: code }),
  leaveRoom: (code: string | null) => call<void>("leave_room", { p_code: code }),
  sit: (code: string, seat: number) => call<Room>("sit", { p_code: code, p_seat: seat }),
  assignSeat: (code: string, user: string, seat: number) => call<Room>("assign_seat", { p_code: code, p_user: user, p_seat: seat }),
  setSettings: (code: string, s: Partial<RoomSettings>, visibility?: Visibility) => call<Room>("set_room_settings", { p_code: code, p_settings: s, p_visibility: visibility ?? null }),
  kick: (code: string, user: string) => call<void>("kick_member", { p_code: code, p_user: user }),
  publicRooms: () => call<PublicRoom[]>("list_public_rooms"),
  invite: (code: string, user: string) => call<void>("invite_to_room", { p_code: code, p_user: user }),
};
