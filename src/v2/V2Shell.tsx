import { useCallback, useEffect, useRef, useState } from "react";
import { api, type FriendBook, type Notice, type Room } from "./api";
import { AccountSheet } from "./AccountSheet";
import { FriendsSheet, NoticesSheet } from "./FriendsSheet";
import { OnlineSheet } from "./OnlineSheet";
import { useHeartbeat, useLive } from "./live";
import { SessionProvider, useSession } from "./session";
import { readTheme, themeStyle } from "./ui";

type Panel = null | "account" | "friends" | "online" | "notices";

function frameSrc() {
  const q = new URLSearchParams();
  if (location.search.includes("testfast")) q.set("testfast", "1");
  q.set("boot", "guest");
  return `/qayd.html?${q.toString()}`;
}

function Inner() {
  const s = useSession();
  const uid = s.session?.user.id ?? null;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [theme, setTheme] = useState("trad");
  const [panel, setPanel] = useState<Panel>(null);
  const [room, setRoomState] = useState<Room | null>(null);
  const [book, setBook] = useState<FriendBook | null>(null);
  const [notices, setNotices] = useState<{ unread: number; items: Notice[] }>({ unread: 0, items: [] });
  const [toast, setToast] = useState("");
  const [src, setSrc] = useState<string | null>(null); // the game URL reads location, so it is set after hydration
  useEffect(() => { setSrc(frameSrc()); }, []);
  const lastUnread = useRef<number | null>(null);
  const roomRef = useRef<Room | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = useCallback((t: string) => { setToast(t); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 3500); }, []);
  const setRoom = useCallback((r: Room | null) => { roomRef.current = r; setRoomState(r); }, []);

  // --- data refreshers (doorbell or poll triggers them) ---
  const refreshRoom = useCallback(async () => {
    if (!uid) return;
    try { const r = await api.myRoom(); setRoom(r); } catch { /* offline: keep what we have */ }
  }, [uid, setRoom]);
  const refreshSocial = useCallback(async () => {
    if (!uid) return;
    try {
      const [b, n] = await Promise.all([api.friends(), api.notices()]);
      setBook(b);
      // A toast only for news that arrives after the first load, never for what was already waiting.
      if (lastUnread.current !== null && n.unread > lastUnread.current) {
        const f = n.items.find((x) => !x.read_at);
        if (f?.kind === "room_invite") say(`${f.from_name ?? "لاعب"} يدعوك لصكة`);
        else if (f?.kind === "friend_request") say(`${f.from_name ?? "لاعب"} يبي يصير صديقك`);
        else if (f?.kind === "friend_accepted") say(`${f.from_name ?? "لاعب"} قبل طلبك`);
      }
      lastUnread.current = n.unread;
      setNotices(n);
    } catch { /* offline */ }
  }, [uid, say]);

  const live = useLive(uid, room?.code ?? null, { onRoom: () => void refreshRoom(), onNotify: () => void refreshSocial() });
  useHeartbeat(!!uid);

  // Polling safety net: only when the realtime canary failed. A healthy socket needs none.
  useEffect(() => {
    if (!uid || live !== "degraded") return;
    const t = setInterval(() => { void refreshRoom(); void refreshSocial(); }, 5000);
    return () => clearInterval(t);
  }, [uid, live, refreshRoom, refreshSocial]);
  useEffect(() => { lastUnread.current = null; if (!uid) { setRoom(null); setBook(null); setNotices({ unread: 0, items: [] }); } else { void refreshRoom(); void refreshSocial(); } }, [uid, refreshRoom, refreshSocial, setRoom]);

  // --- the game iframe ---
  const tell = useCallback((m: object) => frameRef.current?.contentWindow?.postMessage({ source: "qayd-shell", ...m }, location.origin), []);
  useEffect(() => { tell({ cmd: "notices", show: !!uid, unread: notices.unread }); }, [uid, notices.unread, tell]);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frameRef.current?.contentWindow) return;
      const d = e.data as { source?: string; open?: string; theme?: string; type?: string } | null;
      if (!d) return;
      if (d.source === "qayd-theme" && d.theme) setTheme(d.theme in themeStyle ? d.theme : readTheme());
      if (d.source === "qayd-ui") {
        if (d.open === "online") setPanel("online"); if (d.open === "friends") setPanel("friends");
        if (d.open === "settings") setPanel("account"); if (d.open === "notices") setPanel("notices");
      }
      if (d.source === "qayd-net" && d.type === "ready") tell({ cmd: "notices", show: !!uid, unread: notices.unread });
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [uid, notices.unread, tell]);
  useEffect(() => { setTheme(readTheme()); }, [panel]);
  useEffect(() => { if (s.profile?.display_name) tell({ cmd: "name", name: s.profile.display_name }); }, [s.profile?.display_name, tell]);

  // --- join links: /v2?join=123456 ---
  const joinCode = useRef<string | null>(typeof location !== "undefined" ? new URLSearchParams(location.search).get("join") : null);
  useEffect(() => {
    const code = joinCode.current;
    if (!code || !s.ready) return;
    if (!uid) { setPanel("account"); say("سجّل دخولك عشان تدخل الغرفة"); return; }
    joinCode.current = null;
    void api.joinRoom(code).then((r) => { setRoom(r); setPanel("online"); history.replaceState(null, "", "/v2"); }).catch((e: Error) => say(e.message));
  }, [s.ready, uid, say, setRoom]);
  useEffect(() => { if (s.recovering) setPanel("account"); }, [s.recovering]);

  const joinByCode = useCallback((code: string) => { void api.joinRoom(code).then((r) => { setRoom(r); setPanel("online"); }).catch((e: Error) => say(e.message)); }, [say, setRoom]);
  const markSeen = useCallback(() => { void api.markRead().then(refreshSocial).catch(() => undefined); }, [refreshSocial]);

  return (
    <div className="fixed inset-0 bg-[#101820]" style={themeStyle(theme)} dir="rtl">
      {src && <iframe ref={frameRef} title="قيد" src={src} className="h-full w-full border-0" allow="autoplay; fullscreen" />}
      {room && panel === null && (
        <button type="button" onClick={() => setPanel("online")} className="fixed start-1/2 top-[max(0.5rem,env(safe-area-inset-top))] z-40 -translate-x-1/2 rounded-full border border-[var(--q-line)] bg-[var(--q-surface)] px-4 py-2 text-sm font-bold text-[var(--q-ink)] shadow-lg" style={{ transform: "translateX(50%)" }}>
          🎴 غرفتك <span dir="ltr">{room.code}</span> · {room.members.length}/٤
        </button>
      )}
      {toast && <div role="status" className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[70] mx-auto max-w-sm rounded-2xl bg-black/85 px-4 py-3 text-center text-sm font-bold text-white shadow-2xl">{toast}</div>}

      <AccountSheet open={panel === "account"} onClose={() => setPanel(null)} theme={theme} />
      <FriendsSheet open={panel === "friends"} onClose={() => setPanel(null)} theme={theme} roomCode={room?.code ?? null} roomMemberIds={room?.members.map((m) => m.id) ?? []} book={book} reload={refreshSocial} onJoin={joinByCode} />
      <NoticesSheet open={panel === "notices"} onClose={() => setPanel(null)} theme={theme} items={notices.items} onJoin={joinByCode} onSeen={markSeen} onOpenFriends={() => setPanel("friends")} />
      <OnlineSheet open={panel === "online"} onClose={() => setPanel(null)} theme={theme} room={room} setRoom={setRoom} friends={book} status={live} openAccount={() => setPanel("account")}
        onStart={() => say("تشغيل الصكة الأونلاين على الخادم هو المرحلة الجاية. الغرف والمقاعد والإعدادات شغّالة الحين.")} />
    </div>
  );
}

export function V2Shell() {
  return <SessionProvider><Inner /></SessionProvider>;
}
