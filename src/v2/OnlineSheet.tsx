import { useCallback, useEffect, useState } from "react";
import { api, type FriendBook, type Member, type PublicRoom, type Room, type RoomSettings, type Visibility } from "./api";
import type { LiveStatus } from "./live";
import { useSession } from "./session";
import { Avatar, Btn, Chip, Coin, MODE_LABEL, Note, Sheet, inputCls } from "./ui";

const LENS = [61, 101, 152]; const STAKES = [0, 100, 500, 1000, 2500]; const TURNS = [15, 25, 40];
const VIS: { id: Visibility; label: string; hint: string }[] = [
  { id: "friends", label: "أصدقاء", hint: "بالرمز أو من أصدقائك" }, { id: "public", label: "مفتوحة", hint: "تظهر في قائمة الغرف" }, { id: "private", label: "خاصة", hint: "بالرمز بس" },
];
const DEFAULTS: RoomSettings = { mode: "friendly", len: 152, stake: 0, turn_seconds: 25 };

function SettingsEditor({ value, visibility, coins, editable, onChange, onVisibility }: {
  value: RoomSettings; visibility: Visibility; coins: number; editable: boolean; onChange: (s: Partial<RoomSettings>) => void; onVisibility: (v: Visibility) => void;
}) {
  const group = (title: string, children: React.ReactNode, hint?: string) => (
    <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-extrabold">{title}</legend><div className="flex flex-wrap gap-2">{children}</div>{hint && <p className="text-xs text-[var(--q-muted)]">{hint}</p>}</fieldset>
  );
  return (
    <div className="grid gap-4">
      {group("نوع اللعب", (["friendly", "free"] as const).map((m) => <Chip key={m} on={value.mode === m} disabled={!editable} onClick={() => onChange({ mode: m })}>{MODE_LABEL[m]}</Chip>), value.mode === "friendly" ? "الأوراق المسموحة مضاءة والغلط ما يمشي" : "تقدر تقطع، والقيد شغّال")}
      {group("مدة الصكة", LENS.map((l) => <Chip key={l} on={value.len === l} disabled={!editable} onClick={() => onChange({ len: l })}>{l}</Chip>))}
      {group("اللعب على", STAKES.map((s) => <Chip key={s} on={value.stake === s} disabled={!editable || (s > coins)} onClick={() => onChange({ stake: s })}>{s === 0 ? "بدون" : <><Coin size={14} /> {s.toLocaleString("en")}</>}</Chip>), value.stake ? `الفائز ياخذ ${(value.stake * 2).toLocaleString("en")}. رصيدك ${coins.toLocaleString("en")}` : "بدون عملات: لا ربح ولا خسارة")}
      {group("وقت الدور", TURNS.map((t) => <Chip key={t} on={value.turn_seconds === t} disabled={!editable} onClick={() => onChange({ turn_seconds: t })}>{t} ثانية</Chip>))}
      {group("نوع الغرفة", VIS.map((v) => <Chip key={v.id} on={visibility === v.id} disabled={!editable} onClick={() => onVisibility(v.id)}>{v.label}</Chip>), VIS.find((v) => v.id === visibility)?.hint)}
    </div>
  );
}

function Lobby({ coins, onRoom }: { coins: number; onRoom: (r: Room) => void }) {
  const [settings, setSettings] = useState<RoomSettings>(DEFAULTS); const [vis, setVis] = useState<Visibility>("friends");
  const [open, setOpen] = useState(false); const [code, setCode] = useState("");
  const [rooms, setRooms] = useState<PublicRoom[] | null>(null); const [busy, setBusy] = useState(""); const [err, setErr] = useState("");

  const load = useCallback(() => api.publicRooms().then(setRooms).catch(() => setRooms([])), []);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 6000); return () => clearInterval(t); }, [load]);
  const go = async (id: string, fn: () => Promise<Room>) => { setBusy(id); setErr(""); try { onRoom(await fn()); } catch (e) { setErr((e as Error).message); } finally { setBusy(""); } };

  return (
    <div className="grid gap-5">
      {err && <Note kind="error">{err}</Note>}
      <section className="grid gap-3 rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] p-3">
        <h3 className="text-base font-extrabold">سوِّ غرفة</h3>
        <button type="button" className="flex min-h-11 items-center justify-between rounded-xl border border-[var(--q-line)] bg-[var(--q-surface)] px-3 text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span>{MODE_LABEL[settings.mode]} · {settings.len} · {settings.stake ? <><Coin size={13} /> {settings.stake}</> : "بدون عملات"} · {VIS.find((v) => v.id === vis)?.label}</span><span>{open ? "▲" : "▼ الإعدادات"}</span>
        </button>
        {open && <SettingsEditor value={settings} visibility={vis} coins={coins} editable onChange={(s) => setSettings({ ...settings, ...s })} onVisibility={setVis} />}
        <Btn tone="primary" wide busy={busy === "create"} onClick={() => void go("create", () => api.createRoom(settings, vis))}>سوِّ الغرفة</Btn>
      </section>

      <section className="grid gap-2">
        <h3 className="text-base font-extrabold">عندك رمز؟</h3>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.length === 6) void go("join", () => api.joinRoom(code)); }}>
          <input className={`${inputCls} text-center tracking-[0.35em]`} dir="ltr" inputMode="numeric" maxLength={6} placeholder="······" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="رمز الغرفة" />
          <Btn type="submit" tone="primary" disabled={code.length !== 6} busy={busy === "join"}>ادخل</Btn>
        </form>
      </section>

      <section className="grid gap-2">
        <div className="flex items-center justify-between"><h3 className="text-base font-extrabold">غرف مفتوحة</h3><button type="button" className="min-h-11 px-2 text-sm text-[var(--q-muted)] underline" onClick={() => void load()}>تحديث</button></div>
        {rooms === null ? <p className="text-sm text-[var(--q-muted)]">لحظة…</p> : rooms.length === 0 ? <Note>ما فيه غرف مفتوحة الحين. سوِّ وحدة وادعُ خوياك.</Note> : (
          <ul className="grid gap-2">
            {rooms.map((r) => (
              <li key={r.code} className="flex items-center gap-3 rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] p-3">
                <Avatar name={r.host_name} avatar={r.host_avatar} />
                <div className="min-w-0 flex-1"><b className="block truncate">{r.host_name}</b><span className="text-xs text-[var(--q-muted)]">{MODE_LABEL[r.settings.mode]} · {r.settings.len} · {r.settings.stake ? `${r.settings.stake} عملة` : "بدون عملات"} · {r.seated}/٤</span></div>
                <Btn tone="primary" className="!px-3" disabled={r.seated >= 4} busy={busy === r.code} onClick={() => void go(r.code, () => api.joinRoom(r.code))}>{r.seated >= 4 ? "ممتلئة" : "ادخل"}</Btn>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SeatCard({ m, me, host, seat, canSit, onSit, onMenu }: { m?: Member; me: boolean; host: boolean; seat: number; canSit: boolean; onSit: () => void; onMenu?: () => void }) {
  if (!m) {
    return (
      <div className="grid min-h-[6.5rem] place-items-center gap-1 rounded-2xl border-2 border-dashed border-[var(--q-line)] p-2 text-center">
        <span className="text-xs text-[var(--q-muted)]">🤖 الكمبيوتر يكمّل</span>
        {canSit ? <Btn tone="primary" className="!min-h-10 !px-3" onClick={onSit} aria-label={`اجلس في المقعد ${seat + 1}`}>اجلس هنا</Btn> : <span className="text-xs text-[var(--q-muted)]">مقعد فاضي</span>}
      </div>
    );
  }
  return (
    <div className={`relative grid min-h-[6.5rem] place-items-center gap-1 rounded-2xl border p-2 text-center ${me ? "border-[var(--q-primary)] bg-[var(--q-surface)]" : "border-[var(--q-line)] bg-[var(--q-surface)]"}`}>
      <Avatar name={m.display_name} avatar={m.avatar} size={44} online={m.online} />
      <b className="max-w-full truncate text-sm">{m.display_name}{me ? " (أنت)" : ""}</b>
      <span className="text-[11px] text-[var(--q-muted)]">{m.is_host ? "👑 صاحب الطاولة · " : ""}XP {m.xp ?? 0}</span>
      {host && !me && onMenu && <button type="button" onClick={onMenu} aria-label={`خيارات ${m.display_name}`} className="absolute end-1 top-1 grid h-9 w-9 place-items-center rounded-full border border-[var(--q-line)] text-base">⋯</button>}
    </div>
  );
}

function RoomBoard({ room, meId, coins, friends, status, onRoom, onLeft, onStart }: {
  room: Room; meId: string; coins: number; friends: FriendBook | null; status: LiveStatus; onRoom: (r: Room) => void; onLeft: () => void; onStart: () => void;
}) {
  const me = room.members.find((m) => m.id === meId); const isHost = room.host_id === meId;
  const [menu, setMenu] = useState<Member | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false); const [invited, setInvited] = useState<Record<string, boolean>>({});
  const mySeat = me?.seat ?? 0;
  const at = (seat: number) => room.members.find((m) => m.seat === seat);
  const place = [{ pos: (mySeat + 2) % 4, label: "خويّك" }, { pos: (mySeat + 3) % 4, label: "الخصم" }, { pos: (mySeat + 1) % 4, label: "الخصم" }];

  const act = async (fn: () => Promise<Room | void>) => { setBusy(true); setErr(""); try { const r = await fn(); if (r) onRoom(r); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const moveWith = (m: Member, sameTeam: boolean) => {
    const hp = (me?.seat ?? 0) % 2; const parity = sameTeam ? hp : 1 - hp;
    const seats = [0, 1, 2, 3].filter((x) => x % 2 === parity && x !== me?.seat);
    const free = seats.find((x) => !at(x)) ?? seats[0];
    if (m.seat === free || (m.seat !== null && m.seat % 2 === parity)) return;
    void act(() => api.assignSeat(room.code, m.id, free)); setMenu(null);
  };
  const share = async () => {
    const url = `${location.origin}/v2?join=${room.code}`;
    try { if (navigator.share) await navigator.share({ title: "قيد", text: `تعال العب بلوت معي. رمز الغرفة ${room.code}`, url }); else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } } catch { /* cancelled */ }
  };
  const seated = room.members.filter((m) => m.seat !== null).length;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] p-3">
        <div><small className="text-xs text-[var(--q-muted)]">رمز الغرفة</small><b dir="ltr" className="block text-2xl tracking-[0.3em]">{room.code}</b></div>
        <div className="flex gap-2"><Btn tone="ghost" onClick={() => void share()}>{copied ? "انسخ ✓" : "شارك"}</Btn></div>
      </div>
      {status === "degraded" && <Note>الاتصال المباشر ضعيف. نحدّث الغرفة كل كم ثانية.</Note>}
      {err && <Note kind="error">{err}</Note>}

      <div className="grid gap-2 rounded-3xl border border-[var(--q-line)] bg-[var(--q-card)] p-3" aria-label="طاولة الغرفة">
        <div className="mx-auto w-1/2 min-w-[9rem]"><SeatCard m={at(place[0].pos)} me={at(place[0].pos)?.id === meId} host={isHost} seat={place[0].pos} canSit={!!me && me.seat !== place[0].pos} onSit={() => void act(() => api.sit(room.code, place[0].pos))} onMenu={() => setMenu(at(place[0].pos) ?? null)} /><p className="mt-1 text-center text-[11px] font-bold text-[var(--q-ok)]">{place[0].label}</p></div>
        <div className="grid grid-cols-2 gap-2">
          {[place[1], place[2]].map((p) => (<div key={p.pos}><SeatCard m={at(p.pos)} me={false} host={isHost} seat={p.pos} canSit={!!me} onSit={() => void act(() => api.sit(room.code, p.pos))} onMenu={() => setMenu(at(p.pos) ?? null)} /><p className="mt-1 text-center text-[11px] font-bold text-[var(--q-error)]">{p.label}</p></div>))}
        </div>
        <div className="mx-auto w-1/2 min-w-[9rem]"><SeatCard m={me} me host={false} seat={mySeat} canSit={false} onSit={() => undefined} /><p className="mt-1 text-center text-[11px] font-bold text-[var(--q-ok)]">فريقك</p></div>
      </div>

      <button type="button" className="flex min-h-11 items-center justify-between rounded-xl border border-[var(--q-line)] bg-[var(--q-card)] px-3 text-sm" onClick={() => setShowSettings(!showSettings)} aria-expanded={showSettings}>
        <span>{MODE_LABEL[room.settings.mode]} · {room.settings.len} · {room.settings.stake ? <><Coin size={13} /> {room.settings.stake}</> : "بدون عملات"} · {room.settings.turn_seconds}ث</span><span>{showSettings ? "▲" : isHost ? "▼ عدّل" : "▼ الإعدادات"}</span>
      </button>
      {showSettings && <SettingsEditor value={room.settings} visibility={room.visibility} coins={coins} editable={isHost && room.status === "lobby"} onChange={(s) => void act(() => api.setSettings(room.code, s))} onVisibility={(v) => void act(() => api.setSettings(room.code, {}, v))} />}
      {!isHost && <p className="text-xs text-[var(--q-muted)]">الإعدادات يغيّرها صاحب الطاولة.</p>}

      {(friends?.friends ?? []).some((f) => f.online && !room.members.some((m) => m.id === f.id)) && (
        <section className="grid gap-2"><h3 className="text-sm font-extrabold">ادعُ أصدقاءك</h3>
          <div className="flex flex-wrap gap-2">
            {friends!.friends.filter((f) => f.online && !room.members.some((m) => m.id === f.id)).map((f) => (
              <button key={f.id} type="button" disabled={invited[f.id]} onClick={() => void act(async () => { await api.invite(room.code, f.id); setInvited({ ...invited, [f.id]: true }); })} className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--q-line)] bg-[var(--q-surface)] px-3 text-sm disabled:opacity-60"><Avatar avatar={f.avatar} size={26} /> {invited[f.id] ? "اندعى ✓" : f.display_name}</button>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-2">
        {isHost && <Btn tone="primary" wide disabled={busy || seated < 1} onClick={onStart}>ابدأ الصكة</Btn>}
        {!isHost && <Note>ننتظر صاحب الطاولة يبدأ الصكة. المقاعد الفاضية يكمّلها الكمبيوتر.</Note>}
        <Btn tone="ghost" wide busy={busy} onClick={() => void act(async () => { await api.leaveRoom(room.code); onLeft(); })}>اطلع من الغرفة</Btn>
      </div>

      {menu && (
        <div className="fixed inset-0 z-[60] grid items-end bg-black/45 sm:place-items-center" onClick={() => setMenu(null)}>
          <div className="grid w-full gap-2 rounded-t-3xl border border-[var(--q-line)] bg-[var(--q-surface)] p-4 sm:max-w-sm sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-3"><Avatar avatar={menu.avatar} /><b>{menu.display_name}</b></div>
            <Btn onClick={() => moveWith(menu, true)}>خلّه معي</Btn><Btn onClick={() => moveWith(menu, false)}>خلّه ضدي</Btn>
            <Btn tone="danger" onClick={() => { const m = menu; setMenu(null); void act(async () => { await api.kick(room.code, m.id); return api.getRoom(room.code); }); }}>اطرده</Btn>
            <Btn tone="ghost" onClick={() => setMenu(null)}>إلغاء</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

export function OnlineSheet({ open, onClose, theme, room, setRoom, friends, status, openAccount, onStart }: {
  open: boolean; onClose: () => void; theme: string; room: Room | null; setRoom: (r: Room | null) => void; friends: FriendBook | null; status: LiveStatus; openAccount: () => void; onStart: () => void;
}) {
  const s = useSession();
  return (
    <Sheet open={open} onClose={onClose} theme={theme} title={room ? "غرفتك" : "الديوانية أونلاين"}>
      {!s.configured ? <Note kind="error">الأونلاين مو مفعّل في هذا الموقع بعد.</Note>
        : !s.session ? (<div className="grid gap-3"><Note>الأونلاين والأصدقاء يحتاجون حساب. اللعب ضد الكمبيوتر يبقى بدون حساب.</Note><Btn tone="primary" wide onClick={() => { onClose(); openAccount(); }}>سجّل دخولك</Btn></div>)
        : room ? <RoomBoard room={room} meId={s.session.user.id} coins={s.wallet?.coins ?? 0} friends={friends} status={status} onRoom={setRoom} onLeft={() => setRoom(null)} onStart={onStart} />
        : <Lobby coins={s.wallet?.coins ?? 0} onRoom={setRoom} />}
    </Sheet>
  );
}
