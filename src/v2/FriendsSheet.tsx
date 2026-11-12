import { useCallback, useEffect, useState } from "react";
import { api, type FriendBook, type SearchHit, type Notice } from "./api";
import { useSession } from "./session";
import { Avatar, Btn, Note, Sheet, Tabs, inputCls } from "./ui";

type Tab = "friends" | "requests" | "search";

function Row({ name, user, avatar, online, sub, children }: { name: string; user: string; avatar: string; online?: boolean; sub?: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] p-3">
      <Avatar name={name} avatar={avatar} online={online} />
      <div className="min-w-0 flex-1"><b className="block truncate">{name}</b><span dir="ltr" className="block truncate text-xs text-[var(--q-muted)]">@{user}</span>{sub && <span className="text-xs text-[var(--q-ok)]">{sub}</span>}</div>
      <div className="flex shrink-0 gap-1.5">{children}</div>
    </li>
  );
}

export function FriendsSheet({ open, onClose, theme, roomCode, roomMemberIds, book, reload, onJoin }: {
  open: boolean; onClose: () => void; theme: string; roomCode: string | null; roomMemberIds: string[]; book: FriendBook | null; reload: () => Promise<void>; onJoin: (code: string) => void;
}) {
  const s = useSession();
  const [tab, setTab] = useState<Tab>("friends");
  const [q, setQ] = useState(""); const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busyId, setBusyId] = useState("");

  const run = useCallback(async (id: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusyId(id); setErr(""); setMsg("");
    try { await fn(); if (ok) setMsg(ok); await reload(); } catch (e) { setErr((e as Error).message); } finally { setBusyId(""); }
  }, [reload]);

  useEffect(() => {
    if (tab !== "search") return;
    const term = q.trim();
    if (term.length < 2) { setHits(null); return; }
    const t = setTimeout(() => { void api.search(term).then(setHits).catch((e: Error) => setErr(e.message)); }, 350);
    return () => clearTimeout(t);
  }, [q, tab]);

  const incoming = book?.incoming.length ?? 0;
  return (
    <Sheet open={open} onClose={onClose} theme={theme} title="الأصدقاء">
      {!s.session ? <Note>سجّل دخولك عشان تضيف أصدقاء وتلعب معهم.</Note> : (<>
        <Tabs value={tab} onChange={setTab} items={[{ id: "friends", label: "أصدقائي" }, { id: "requests", label: "الطلبات", badge: incoming }, { id: "search", label: "ابحث" }]} />
        {err && <div className="mb-3"><Note kind="error">{err}</Note></div>}{msg && <div className="mb-3"><Note kind="ok">{msg}</Note></div>}

        {tab === "friends" && (
          <ul className="grid gap-2">
            {(book?.friends ?? []).length === 0 && <li><Note>ما عندك أصدقاء لسا. ابحث عن اسم المستخدم وأضفهم.</Note></li>}
            {(book?.friends ?? []).map((f) => (
              <Row key={f.id} name={f.display_name} user={f.username} avatar={f.avatar} online={f.online} sub={roomMemberIds.includes(f.id) ? "معك في الغرفة" : f.room_code ? "في غرفة مفتوحة" : f.online ? "متصل" : undefined}>
                {f.room_code && !roomCode && <Btn tone="primary" className="!px-3" onClick={() => { onJoin(f.room_code!); onClose(); }}>ادخل</Btn>}
                {roomCode && f.online && !roomMemberIds.includes(f.id) && <Btn busy={busyId === f.id} className="!px-3" onClick={() => void run(f.id, () => api.invite(roomCode, f.id), `دعوت ${f.display_name}`)}>ادعُه</Btn>}
                <Btn tone="ghost" className="!px-3" aria-label="إزالة" busy={busyId === "r" + f.id} onClick={() => { if (confirm(`تشيل ${f.display_name} من أصدقائك؟`)) void run("r" + f.id, () => api.removeFriend(f.id)); }}>✕</Btn>
              </Row>
            ))}
          </ul>
        )}

        {tab === "requests" && (
          <div className="grid gap-4">
            <section className="grid gap-2"><h3 className="text-sm font-extrabold">وصلتك</h3>
              <ul className="grid gap-2">{incoming === 0 && <li><Note>ما فيه طلبات.</Note></li>}
                {(book?.incoming ?? []).map((r) => (
                  <Row key={r.id} name={r.display_name} user={r.username} avatar={r.avatar}>
                    <Btn tone="primary" className="!px-3" busy={busyId === r.id} onClick={() => void run(r.id, () => api.respond(r.id, true), `صرتوا أصدقاء مع ${r.display_name}`)}>اقبل</Btn>
                    <Btn tone="ghost" className="!px-3" onClick={() => void run(r.id, () => api.respond(r.id, false))}>ارفض</Btn>
                  </Row>
                ))}
              </ul>
            </section>
            {(book?.outgoing.length ?? 0) > 0 && <section className="grid gap-2"><h3 className="text-sm font-extrabold">أرسلتها</h3><ul className="grid gap-2">
              {book!.outgoing.map((r) => <Row key={r.id} name={r.display_name} user={r.username} avatar={r.avatar}><Btn tone="ghost" className="!px-3" onClick={() => void run(r.id, () => api.removeFriend(r.id))}>الغِ</Btn></Row>)}</ul></section>}
            {(book?.blocked.length ?? 0) > 0 && <section className="grid gap-2"><h3 className="text-sm font-extrabold">المحظورين</h3><ul className="grid gap-2">
              {book!.blocked.map((r) => <Row key={r.id} name={r.display_name} user={r.username} avatar={r.avatar}><Btn tone="ghost" className="!px-3" onClick={() => void run(r.id, () => api.unblock(r.id))}>فكّ</Btn></Row>)}</ul></section>}
          </div>
        )}

        {tab === "search" && (
          <div className="grid gap-3">
            <input className={inputCls} dir="ltr" placeholder="اسم المستخدم أو الاسم" value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="none" aria-label="ابحث عن لاعب" />
            {hits && hits.length === 0 && <Note>ما لقينا أحد.</Note>}
            <ul className="grid gap-2">
              {(hits ?? []).map((h) => (
                <Row key={h.id} name={h.display_name} user={h.username} avatar={h.avatar}>
                  {h.relation === "none" && <Btn tone="primary" className="!px-3" busy={busyId === h.id} onClick={() => void run(h.id, async () => { await api.sendRequest(h.id); setHits((x) => x?.map((y) => (y.id === h.id ? { ...y, relation: "outgoing" } : y)) ?? x); }, `أرسلنا الطلب إلى ${h.display_name}`)}>أضف</Btn>}
                  {h.relation === "outgoing" && <span className="text-xs text-[var(--q-muted)]">بانتظار الرد</span>}
                  {h.relation === "friend" && <span className="text-xs text-[var(--q-ok)]">صديقك</span>}
                  {h.relation === "incoming" && <Btn tone="primary" className="!px-3" onClick={() => void run(h.id, () => api.respond(h.id, true))}>اقبل</Btn>}
                  <Btn tone="ghost" className="!px-3" aria-label="حظر" onClick={() => { if (confirm(`تحظر ${h.display_name}؟`)) void run(h.id, () => api.block(h.id), "انحظر"); }}>⛔</Btn>
                </Row>
              ))}
            </ul>
          </div>
        )}
      </>)}
    </Sheet>
  );
}

const LABEL: Record<Notice["kind"], (n: Notice) => string> = {
  friend_request: (n) => `${n.from_name ?? "لاعب"} يبي يصير صديقك`,
  friend_accepted: (n) => `${n.from_name ?? "لاعب"} قبل طلبك`,
  room_invite: (n) => `${n.from_name ?? "لاعب"} يدعوك لصكة`,
};

export function NoticesSheet({ open, onClose, theme, items, onJoin, onSeen, onOpenFriends }: {
  open: boolean; onClose: () => void; theme: string; items: Notice[]; onJoin: (code: string) => void; onSeen: () => void; onOpenFriends: () => void;
}) {
  useEffect(() => { if (open) onSeen(); }, [open, onSeen]);
  return (
    <Sheet open={open} onClose={onClose} theme={theme} title="الإشعارات">
      <ul className="grid gap-2">
        {items.length === 0 && <li><Note>ما فيه إشعارات.</Note></li>}
        {items.map((n) => (
          <li key={n.id} className={`flex items-center justify-between gap-2 rounded-2xl border p-3 ${n.read_at ? "border-[var(--q-line)]" : "border-[var(--q-primary)]"} bg-[var(--q-card)]`}>
            <span className="text-sm">{LABEL[n.kind](n)}<small className="block text-xs text-[var(--q-muted)]">{new Date(n.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}</small></span>
            {n.kind === "room_invite" && n.payload.code && <Btn tone="primary" className="!px-3" onClick={() => { onJoin(n.payload.code!); onClose(); }}>ادخل</Btn>}
            {n.kind === "friend_request" && <Btn tone="primary" className="!px-3" onClick={() => { onClose(); onOpenFriends(); }}>افتح</Btn>}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
