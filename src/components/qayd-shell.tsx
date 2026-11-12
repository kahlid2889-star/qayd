import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SignInGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { authClient, signOut } from "@/lib/auth/client";
import { AuthPanel } from "@/components/auth-panel";
import { beginMatch, inviteFriend, joinRoom, listFriends, listNotices, loadProfile, movesConfig, pullMoves, pushMove, releasePlayer, saveProfile, settleXp, syncRoom } from "@/lib/qayd/server";
import { FriendsBook } from "@/components/qayd-friends";
import { NoticeBell, type NoticeItem } from "@/components/qayd-notices";
import { pushMail, restoreBatch, takeBatch } from "@/lib/qayd/mail";

const NAMED = "qafit";
const TITLE = "قيد ما يقيد إلا القافط";
const GUEST: Record<string, unknown> = { name: "ضيف قيد", theme: "trad", snd: 1, coins: 1000, wins: 0, games: 0 };

type Member = { userId: string; seat: number | null; name: string; online: boolean };
type RoomSettings = { mode: "friendly" | "free"; len: number; stake: number };
type Room = { code: string; title: string; phase: string; hostId: string | null; hostOnline?: boolean; matchId?: string | null; settings?: RoomSettings; members: Member[] };

const DEFAULT_SETTINGS: RoomSettings = { mode: "friendly", len: 152, stake: 0 };
const LENGTHS = [61, 101, 152];
const STAKES = [0, 100, 500, 1000, 2500];

/** The three looks of the table. The panels follow whichever one the player picked in the game's settings. */
const PALETTES: Record<string, Record<string, string>> = {
  trad: {
    "--q-bg": "#F3E8D4", "--q-surface": "#FFF8EB", "--q-card": "#F3E8D4", "--q-input": "#FFFFFF", "--q-ink": "#39271F",
    "--q-muted": "#927D6C", "--q-line": "#D6C1A1", "--q-primary": "#681F32", "--q-primary-ink": "#FFF8EB",
    "--q-accent": "#681F32", "--q-gold": "#B89558", "--q-error": "#9D3048", "--q-ok": "#2F6B45",
  },
  dark: {
    "--q-bg": "#101820", "--q-surface": "#18232D", "--q-card": "#222F3B", "--q-input": "#101820", "--q-ink": "#F4F6F8",
    "--q-muted": "#A4B0BA", "--q-line": "#34414C", "--q-primary": "#20A783", "--q-primary-ink": "#101820",
    "--q-accent": "#E0B85C", "--q-gold": "#E0B85C", "--q-error": "#FFB4B4", "--q-ok": "#8ED9B0",
  },
  light: {
    "--q-bg": "#F7F9FC", "--q-surface": "#FFFFFF", "--q-card": "#EEF2F5", "--q-input": "#FFFFFF", "--q-ink": "#202D3A",
    "--q-muted": "#89939E", "--q-line": "#E1E7EC", "--q-primary": "#16866A", "--q-primary-ink": "#FFFFFF",
    "--q-accent": "#16866A", "--q-gold": "#D6AD59", "--q-error": "#A0243B", "--q-ok": "#16866A",
  },
};

// The traditional sheet is dark maroon, so its cards and text need dark-sheet colours.
const TRAD_SHEET: Record<string, string> = {
  "--q-card": "rgba(246, 234, 215, 0.07)", "--q-ink": "#F6EAD7", "--q-muted": "#C9B59A",
  "--q-line": "rgba(224, 196, 138, 0.32)", "--q-input": "#14080C", "--q-accent": "#F0D48A", "--q-error": "#FF9DB0",
};

function readTheme(): string {
  try {
    const raw = JSON.parse(localStorage.getItem("sb") || "{}") as { theme?: unknown };
    return typeof raw.theme === "string" && PALETTES[raw.theme] ? raw.theme : "trad";
  } catch {
    return "trad";
  }
}

function Coin({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="inline-block shrink-0 align-[-0.2em]">
      <circle cx="16" cy="16" r="15.2" fill="#e6b842" stroke="#7d5408" strokeWidth="0.9" />
      <circle cx="16" cy="16" r="11.8" fill="#f9d76e" stroke="#fff4c8" strokeWidth="0.9" />
      <path
        transform="translate(8.2 7.6) scale(.65)"
        fill="#5d1020"
        d="M12 1.3C9.6 5.4 2.4 9.4 2.4 14.7c0 2.9 2.2 5 4.9 5 1.6 0 3-.7 3.8-1.9-.2 2.1-.9 3.6-2.2 4.9h6.2c-1.3-1.3-2-2.8-2.2-4.9.8 1.2 2.2 1.9 3.8 1.9 2.7 0 4.9-2.1 4.9-5C21.6 9.4 14.4 5.4 12 1.3Z"
      />
    </svg>
  );
}

function Choice({ on, disabled, onClick, children }: { on: boolean; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled && !on}
      onClick={() => {
        if (!disabled) onClick();
      }}
      className={
        "grid min-h-12 place-items-center rounded-xl border px-1 py-2 text-sm leading-tight transition-colors " +
        (on
          ? "border-[var(--q-gold)] bg-[var(--q-card)] font-bold text-[var(--q-ink)] shadow-[inset_0_0_0_1px_var(--q-gold)]"
          : "border-[var(--q-line)] bg-transparent text-[var(--q-ink)] disabled:opacity-40")
      }
    >
      {children}
    </button>
  );
}

/**
 * The session as the players see it before the deal: who is with whom, the play
 * mode, the match length and the stake. The owner edits; everyone else watches
 * the same board update.
 */
function RoomBoard({
  room,
  meId,
  host,
  live,
  coins,
  showPresence,
  label,
  onConfig,
  onSeat,
  onStart,
  onReset,
  onLeave,
}: {
  room: Room | null;
  meId: string;
  host: boolean;
  live: boolean;
  coins: number;
  showPresence: boolean;
  label: (member: Member) => string;
  onConfig: (next: RoomSettings) => void;
  onSeat: (userId: string, seat: number) => void;
  onStart: () => void;
  onReset: () => void;
  onLeave: () => void;
}) {
  const members = room?.members ?? [];
  const settings = room?.settings ?? DEFAULT_SETTINGS;
  const mine = members.find((m) => m.userId === meId);
  const mySeat = mine?.seat ?? 0;
  const locked = live || !host;
  const at = (seat: number) => members.find((m) => m.seat === seat);
  const teams = [
    { title: "فريقي", seats: [mySeat, (mySeat + 2) % 4] },
    { title: "الخصوم", seats: [(mySeat + 1) % 4, (mySeat + 3) % 4] },
  ];
  const short = settings.stake > coins;

  function moveFor(member: Member): { seat: number; text: string } | null {
    if (!host || live || member.seat == null || member.seat === 0) return null;
    if (member.seat === 2) {
      const free = [1, 3].find((seat) => !at(seat));
      return { seat: free ?? 1, text: "خلّه ضدي" };
    }
    return { seat: 2, text: "خلّه معي" };
  }

  return (
    <div className="mt-4 grid gap-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] px-4 py-3">
        <div>
          <p className="text-xs text-[var(--q-muted)]">رمز الجلسة</p>
          <p className="qayd-display text-3xl tracking-[0.18em] text-[var(--q-accent)]" dir="ltr">
            {room?.code === NAMED ? "قيد" : room?.code}
          </p>
        </div>
        <p className="text-sm text-[var(--q-muted)]">{live ? "الصكة قائمة" : `${members.length} من ٤ · الباقي كمبيوتر`}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {teams.map((team) => (
          <section key={team.title} className="rounded-2xl border border-[var(--q-line)] p-2">
            <h3 className="px-1 pb-1 text-xs font-bold text-[var(--q-muted)]">{team.title}</h3>
            <div className="grid gap-2">
              {team.seats.map((seat) => {
                const member = at(seat);
                const move = member ? moveFor(member) : null;
                return (
                  <div key={seat} className="grid min-h-[4.5rem] content-center gap-1 rounded-xl bg-[var(--q-card)] px-3 py-2">
                    {member ? (
                      <>
                        <b className="truncate text-[var(--q-ink)]">
                          {label(member)}
                          {member.userId === meId ? " · أنت" : ""}
                        </b>
                        <span className="text-xs text-[var(--q-muted)]">
                          {member.seat === 0 ? "صاحب الطاولة" : "لاعب"}
                          {showPresence && member.online ? " · متصل" : ""}
                        </span>
                        {move ? (
                          <button
                            type="button"
                            className="min-h-9 justify-self-start rounded-lg border border-[var(--q-line)] px-3 text-xs text-[var(--q-accent)]"
                            onClick={() => onSeat(member.userId, move.seat)}
                          >
                            {move.text}
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <b className="text-[var(--q-muted)]">كمبيوتر</b>
                        {!host && !live && seat !== 0 ? (
                          <button
                            type="button"
                            className="min-h-9 justify-self-start rounded-lg border border-[var(--q-line)] px-3 text-xs text-[var(--q-accent)]"
                            onClick={() => onSeat(meId, seat)}
                          >
                            اجلس هنا
                          </button>
                        ) : (
                          <span className="text-xs text-[var(--q-muted)]">مقعد فاضي</span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <section className="grid gap-2 rounded-2xl border border-[var(--q-line)] p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--q-accent)]">إعدادات الجلسة</h3>
          {!host && !live ? <span className="text-xs text-[var(--q-muted)]">يحددها صاحب الطاولة</span> : null}
        </div>
        <p className="text-xs text-[var(--q-muted)]">نوع اللعب</p>
        <div className="grid grid-cols-2 gap-2">
          <Choice on={settings.mode === "friendly"} disabled={locked} onClick={() => onConfig({ ...settings, mode: "friendly" })}>
            <b>محدود</b>
            <small className="text-[var(--q-muted)]">الأوراق المسموحة مضاءة</small>
          </Choice>
          <Choice on={settings.mode === "free"} disabled={locked} onClick={() => onConfig({ ...settings, mode: "free" })}>
            <b>حر</b>
            <small className="text-[var(--q-muted)]">القطع مع القيد</small>
          </Choice>
        </div>
        <p className="text-xs text-[var(--q-muted)]">مدة الصكة</p>
        <div className="grid grid-cols-3 gap-2">
          {LENGTHS.map((len) => (
            <Choice key={len} on={settings.len === len} disabled={locked} onClick={() => onConfig({ ...settings, len })}>
              <b dir="ltr">{len}</b>
            </Choice>
          ))}
        </div>
        <p className="text-xs text-[var(--q-muted)]">اللعب على</p>
        <div className="grid grid-cols-5 gap-1.5">
          {STAKES.map((stake) => (
            <Choice key={stake} on={settings.stake === stake} disabled={locked} onClick={() => onConfig({ ...settings, stake })}>
              <Coin size={20} />
              <b dir="ltr">{stake.toLocaleString("en")}</b>
            </Choice>
          ))}
        </div>
        <p className={"text-xs leading-5 " + (short ? "text-[var(--q-error)]" : "text-[var(--q-muted)]")}>
          {settings.stake === 0
            ? "لعب بدون عملات: لا تربح ولا تخسر."
            : short
              ? `رصيدك ${coins.toLocaleString("en")} وما يكفي للعب على ${settings.stake.toLocaleString("en")}.`
              : `كل لاعب يدخل بـ ${settings.stake.toLocaleString("en")}. الفائز ياخذ ${(settings.stake * 2).toLocaleString("en")}، والخاسر يخسر دخوله.`}
        </p>
      </section>

      {host && !live ? (
        <button type="button" className="min-h-12 rounded-xl bg-[var(--q-primary)] font-bold text-[var(--q-primary-ink)]" onClick={onStart}>
          ابدأ الصكة
        </button>
      ) : null}
      {!host && !live ? <p className="text-center text-sm text-[var(--q-muted)]">ننتظر صاحب الطاولة يضغط ابدأ.</p> : null}
      {host && live ? (
        <button type="button" className="min-h-11 text-sm underline" onClick={onReset}>
          رجّع الديوانية
        </button>
      ) : null}
      <button type="button" className="min-h-11 text-sm text-[var(--q-muted)]" onClick={onLeave}>
        {live ? "إخفاء" : "خروج من الجلسة"}
      </button>
    </div>
  );
}
type Mail = { kind: string; toUser?: string | null; body?: unknown };

function readLocal(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem("sb");
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function loginLabel(email: string | null | undefined) {
  if (!email) return "";
  if (email.endsWith("@qayd.game")) {
    const local = email.slice(0, -"@qayd.game".length);
    if (!local || local.startsWith("u.")) return "";
    return local;
  }
  return email;
}

function localStats() {
  const data = readLocal();
  return {
    wins: Math.max(0, Number(data?.wins) || 0),
    games: Math.max(0, Number(data?.games) || 0),
    coins: Math.max(0, Number(data?.coins) || 0),
  };
}

function localName() {
  const data = readLocal();
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  return name.slice(0, 14);
}

function takeConvertFlag() {
  try {
    const on = sessionStorage.getItem("qayd-convert") === "1";
    if (on) sessionStorage.removeItem("qayd-convert");
    return on;
  } catch {
    return false;
  }
}

function frameSrc(boot: string) {
  const q = new URLSearchParams();
  if (location.search.includes("testfast")) q.set("testfast", "1");
  q.set("boot", boot);
  return `/qayd.html?${q.toString()}`;
}

function AccountBox({
  name,
  login,
  wins,
  games,
  coins,
  passNow,
  passNext,
  passNote,
  leaveArmed,
  onNow,
  onNext,
  onPassword,
  onLogout,
  onArmLeave,
  onClose,
}: {
  name: string;
  login: string;
  wins: number;
  games: number;
  coins: number;
  passNow: string;
  passNext: string;
  passNote: string;
  leaveArmed: boolean;
  onNow: (value: string) => void;
  onNext: (value: string) => void;
  onPassword: () => void;
  onLogout: () => void;
  onArmLeave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] px-3 py-3">
        <p className="text-xs text-[var(--q-muted)]">اسمك</p>
        <p className="qayd-display text-2xl text-[var(--q-accent)]">{name}</p>
        {login ? <p className="text-sm">اسم المستخدم: <bdi>{login}</bdi></p> : null}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl bg-[var(--q-card)] px-2 py-2">
          <b className="block text-lg">{games}</b>صكة
        </div>
        <div className="rounded-xl bg-[var(--q-card)] px-2 py-2">
          <b className="block text-lg">{wins}</b>فوز
        </div>
        <div className="rounded-xl bg-[var(--q-card)] px-2 py-2">
          <b className="block text-lg">{coins}</b>عملة
        </div>
      </div>
      <p className="text-sm leading-6">
        كرت المستوى والرتبة داخل إعدادات اللعبة، ويتحركون بنقاط الخبرة نفسها. الاسم والعملات والانتصارات والرتبة والصوت لهذا الحساب، وما تنتقل لحساب ثاني.
      </p>
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onPassword();
        }}
      >
        <h3 className="text-sm font-bold text-[var(--q-accent)]">كلمة المرور</h3>
        <p className="text-xs leading-5 text-[var(--q-muted)]">حفظها ينهي الجلسات الثانية على الأجهزة الأخرى.</p>
        <input
          type="password"
          value={passNow}
          onChange={(event) => onNow(event.target.value)}
          placeholder="الحالية"
          autoComplete="current-password"
          className="min-h-12 rounded-xl border border-[var(--q-line)] bg-[var(--q-input)] text-[var(--q-ink)] px-3"
        />
        <input
          type="password"
          value={passNext}
          onChange={(event) => onNext(event.target.value)}
          placeholder="الجديدة"
          autoComplete="new-password"
          className="min-h-12 rounded-xl border border-[var(--q-line)] bg-[var(--q-input)] text-[var(--q-ink)] px-3"
        />
        <button type="submit" className="min-h-12 rounded-xl border border-[var(--q-primary)]">
          حفظ كلمة المرور
        </button>
        {passNote ? <p className="text-sm text-[var(--q-error)]">{passNote}</p> : null}
      </form>
      <button type="button" className="min-h-12 rounded-xl bg-[var(--q-primary)] text-[var(--q-primary-ink)]" onClick={onClose}>
        رجوع للإعدادات
      </button>
      <button type="button" className="min-h-11 text-sm underline" onClick={leaveArmed ? onLogout : onArmLeave}>
        {leaveArmed ? "تأكيد تسجيل الخروج" : "تسجيل الخروج"}
      </button>
    </div>
  );
}

export function QaydShell() {
  const { user, isPending } = useCurrentUserState();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<object[]>([]);
  const sinceRef = useRef(0);
  const roomRef = useRef<Room | null>(null);
  const outboxRef = useRef<Mail[]>([]);
  const cmdRef = useRef<"poll" | "start" | "leave" | "reset">("poll");
  // Board edits wait here so quick taps are never lost: seats go out in order, then the latest settings.
  const pendingRef = useRef<{ config?: RoomSettings; seats: { userId: string; seat: number }[] }>({ seats: [] });
  const saveTimer = useRef(0);
  const codeRef = useRef<string | null>(null);
  const engineLiveRef = useRef(false);
  const droppedRef = useRef<Set<number>>(new Set());
  const prevUserRef = useRef<string | null | undefined>(undefined);
  const detachedRef = useRef(false);
  const presenceRef = useRef(true);
  const invitesRef = useRef(true);
  const blockedRef = useRef<Set<string>>(new Set());
  const blockedIdsRef = useRef<Set<string>>(new Set());
  const friendSeenRef = useRef("");
  const seenRef = useRef<Set<string>>(new Set());
  const inviteSeenRef = useRef<Set<string>>(new Set());
  const hostAwayRef = useRef(false);
  const [banner, setBanner] = useState<null | { text: string; code?: string }>(null);
  const [theme, setTheme] = useState("trad");
  const [src, setSrc] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "online" | "account" | "friends">(null);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [privateCode, setPrivateCode] = useState("");
  const [live, setLive] = useState(false);
  /* The online match this page carries moves for (every phone runs the same table). */
  const [syncMatch, setSyncMatch] = useState<{ matchId: string; topic: string } | null>(null);
  const syncRef = useRef<{ matchId: string; have: number; online: string; awayNames: string; seats: { seat: number; name: string }[] } | null>(null);
  const endSync = () => {
    syncRef.current = null;
    setSyncMatch(null);
  };
  const [passNow, setPassNow] = useState("");
  const [passNext, setPassNext] = useState("");
  const [passNote, setPassNote] = useState("");
  const [leaveArmed, setLeaveArmed] = useState(false);
  codeRef.current = code;

  // Panels wear the same colors as the table: re-read the player's theme whenever one opens.
  useEffect(() => {
    setTheme(readTheme());
  }, [panel, banner, src]);

  function tell(message: object) {
    const frame = frameRef.current?.contentWindow;
    if (!readyRef.current || !frame) {
      queueRef.current.push(message);
      return;
    }
    frame.postMessage({ source: "qayd-shell", ...message }, location.origin);
  }

  useEffect(() => {
    const unlock = () => {
      const frame = frameRef.current?.contentWindow as (Window & { QaidAudio?: { unlock?: () => void } }) | null;
      try { frame?.QaidAudio?.unlock?.(); } catch { /* the table is not open yet */ }
    };
    window.addEventListener("pointerdown", unlock, true);
    return () => window.removeEventListener("pointerdown", unlock, true);
  }, []);

  useEffect(() => {
    if (isPending) return;
    let cancel = false;
    readyRef.current = false;
    queueRef.current = [];
    setSrc(null);
    (async () => {
      const local = readLocal();
      const prev = prevUserRef.current;
      const nextId = user?.id ?? null;
      if (prev && prev !== nextId && local?.accountId === prev) {
        try { await saveProfile({ data: JSON.stringify(local) }); } catch { /* signed out already */ }
      }
      prevUserRef.current = nextId;
      try {
        if (!user) {
          if (local?.accountId) localStorage.setItem("sb", JSON.stringify(GUEST));
        } else {
          const remote = await loadProfile();
          const remoteData = remote.profile?.data ? (JSON.parse(remote.profile.data) as Record<string, unknown>) : null;
          const remoteAt = Number(remote.profile?.updatedAt) || 0;
          const owned = local && local.accountId === user.id ? local : null;
          const anonymous = local && local.accountId == null ? local : null;
          const convert = takeConvertFlag();
          let pick: Record<string, unknown>;
          if (owned && remoteData) pick = Number(owned.savedAt) >= remoteAt ? { ...owned } : { ...remoteData };
          else if (owned) pick = { ...owned };
          else if (remoteData) pick = { ...remoteData };
          else if (convert && anonymous) pick = { ...anonymous };
          else pick = { ...GUEST, name: (user.displayName || "لاعب").slice(0, 14) };
          pick.accountId = user.id;
          if ((!pick.name || pick.name === "ضيف قيد") && user.displayName) pick.name = user.displayName.slice(0, 14);
          pick.savedAt = Date.now();
          localStorage.setItem("sb", JSON.stringify(pick));
          const localNewer = owned ? Number(owned.savedAt) > remoteAt : false;
          if (!remoteData || localNewer || (convert && anonymous && !remoteData)) {
            await saveProfile({ data: JSON.stringify(pick) });
          }
        }
      } catch {
        /* session still settling */
      }
      if (!cancel) setSrc(frameSrc(user?.id || "guest"));
    })();
    return () => {
      cancel = true;
    };
  }, [isPending, user?.id]);

  useEffect(() => {
    if (!user) return;
    let stop = false;
    const look = async () => {
      try {
        const book = await listFriends();
        if (stop) return;
        blockedIdsRef.current = new Set(book.blocked.map((row) => row.id));
        if (invitesRef.current && !codeRef.current) {
          const fresh = (book.invites || []).find((row) => !inviteSeenRef.current.has(`${row.id}|${row.code}|${row.at}`));
          if (fresh) {
            inviteSeenRef.current.add(`${fresh.id}|${fresh.code}|${fresh.at}`);
            setBanner({ text: `${fresh.name} يدعوك لصكة`, code: fresh.code });
          }
        }
        const incoming = book.incoming.map((row) => row.id).sort().join("|");
        const accepted = book.friends.map((row) => row.id).sort().join("|");
        const stamp = incoming + "#" + accepted;
        const local = readLocal();
        const notif = (local?.prefs as { notif?: { friend?: number; accept?: number } } | undefined)?.notif;
        if (friendSeenRef.current && incoming !== friendSeenRef.current.split("#")[0] && notif?.friend !== 0 && book.incoming.length) {
          setNote("وصلك طلب صداقة");
        } else if (friendSeenRef.current && accepted !== friendSeenRef.current.split("#")[1] && notif?.accept !== 0) {
          const prev = new Set(friendSeenRef.current.split("#")[1].split("|").filter(Boolean));
          if (book.friends.some((row) => !prev.has(row.id))) setNote("انقبلت صداقة");
        }
        friendSeenRef.current = stamp;
        const notes = await listNotices();
        if (stop) return;
        setNotices(notes.items);
        setUnread(notes.unread);
      } catch {
        /* signed out or offline */
      }
    };
    void look();
    const timer = window.setInterval(() => void look(), 10000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [user?.id]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { source?: string; type?: string; open?: string; profile?: Record<string, unknown>; seat?: number; view?: unknown; id?: number; kind?: string; options?: unknown; action?: unknown; winner?: number; scores?: number[]; seed?: number; eval?: unknown; cuts?: unknown; req?: number; matchId?: string; payload?: Record<string, unknown>; body?: Record<string, unknown> };
      if (!data) return;
      if (data.source === "qayd-ui") {
        const prefs = (data as { prefs?: { showOnline?: boolean; invites?: boolean; blocked?: string[] } }).prefs;
        if (prefs) {
          presenceRef.current = prefs.showOnline !== false;
          invitesRef.current = prefs.invites !== false;
          blockedRef.current = new Set(prefs.blocked || []);
        }
        if (data.open === "online") setPanel("online");
        if (data.open === "friends") setPanel("friends");
        if (data.open === "settings") setPanel("account");
        if (data.open === "notices") setNoticeOpen(true);
        return;
      }
      if (data.source !== "qayd-net") return;
      if (data.type === "ready") {
        readyRef.current = true;
        const queued = queueRef.current.splice(0);
        for (const message of queued) tell(message);
        return;
      }
      if (data.type === "profile" && data.profile && user) {
        if (typeof data.profile.theme === "string" && PALETTES[data.profile.theme]) setTheme(data.profile.theme);
        if (data.profile.accountId && data.profile.accountId !== user.id) return;
        window.clearTimeout(saveTimer.current);
        const profile = { ...data.profile, accountId: user.id, savedAt: Number(data.profile.savedAt) || Date.now() };
        saveTimer.current = window.setTimeout(() => {
          void saveProfile({ data: JSON.stringify(profile) })
            .then(() => tell({ cmd: "saved", ok: true }))
            .catch(() => {
              setNote("تعذّر حفظ الحساب. بنحاول مع الحركة الجاية.");
              tell({ cmd: "saved", ok: false });
            });
        }, 700);
        return;
      }
      if (data.type === "sync-done") {
        endSync();
        try { sessionStorage.removeItem("qayd-match"); } catch { /* ignore */ }
        setBanner(null);
        return;
      }
      if (data.type === "local") {
        endSync();
        detachedRef.current = true;
        engineLiveRef.current = false;
        droppedRef.current.clear();
        const current = codeRef.current;
        codeRef.current = null;
        setCode(null);
        setRoom(null);
        roomRef.current = null;
        setLive(false);
        try { sessionStorage.removeItem("qayd-match"); } catch { /* ignore */ }
        void releasePlayer().catch(() => {
          if (!current) return;
          void syncRoom({ data: { code: current, since: sinceRef.current, cmd: "leave", send: [] } }).catch(() => undefined);
        });
        return;
      }
      if (data.type === "begin") {
        // A table against the computer: tell the server it started, so its XP can count.
        const matchId = String(data.matchId || "");
        if (!user || !matchId) return;
        const attempt = (left: number) => {
          void beginMatch({ data: { matchId } }).catch(() => {
            if (left > 0) window.setTimeout(() => attempt(left - 1), 3000);
          });
        };
        attempt(3);
        return;
      }
      if (data.type === "sync-push") {
        const move = data as unknown as { matchId?: string; k?: number; seat?: number; body?: Record<string, unknown> };
        const matchId = String(move.matchId || "");
        if (!user || !matchId) return;
        const send = (left: number) => {
          void pushMove({ data: { matchId, k: Number(move.k), seat: Number(move.seat), body: move.body || {} } })
            .then((res) => {
              if (res.ok && res.move) tell({ cmd: "sync-moves", matchId, moves: [res.move] });
              else if (!res.ok && left > 0) window.setTimeout(() => send(left - 1), 800);
            })
            .catch(() => { if (left > 0) window.setTimeout(() => send(left - 1), 800); });
        };
        send(6);
        return;
      }
      if (data.type === "xp") {
        const req = Number(data.req);
        if (!user) {
          tell({ cmd: "xp", req, result: null });
          return;
        }
        void settleXp({ data: data.payload || {} })
          .then((result) => tell({ cmd: "xp", req, result }))
          .catch(() => tell({ cmd: "xp", req, result: null }));
        return;
      }
      const current = roomRef.current;
      if (!current || !user) return;
      if (data.type === "view" || data.type === "need") {
        const member = current.members.find((m) => m.seat === data.seat);
        if (!member || member.userId === user.id) return;
        pushMail(outboxRef.current, {
          kind: data.type,
          toUser: member.userId,
          body: data.type === "view" ? data.view : { id: data.id, kind: data.kind, options: data.options },
        });
      }
      if (data.type === "sync" && current.hostId && current.hostId !== user.id) {
        outboxRef.current.push({ kind: "sync", toUser: current.hostId, body: {} });
      }
      if (data.type === "act" && current.hostId) {
        outboxRef.current.push({ kind: "act", toUser: current.hostId, body: { id: data.id, action: data.action } });
      }
      if (data.type === "qayd-watch" && current.hostId && current.hostId !== user.id) {
        outboxRef.current.push({ kind: "qayd-watch", toUser: current.hostId, body: data.body || {} });
      }
      if (data.type === "over") {
        outboxRef.current.push({ kind: "over", toUser: null, body: { winner: data.winner, scores: data.scores, seed: data.seed, eval: data.eval, cuts: data.cuts } });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [user?.id]);

  useEffect(() => {
    if (!code || !user) return;
    const uid = user.id;
    let stop = false;
    const tick = async () => {
      if (stop || detachedRef.current) return;
      const send = takeBatch(outboxRef.current, 8);
      // Seat moves and settings always reach the server before "start", so the deal uses what the owner sees.
      const pending = pendingRef.current;
      let cmd: "poll" | "start" | "leave" | "reset" | "config" | "seat" = "poll";
      let config: RoomSettings | undefined;
      let seat: { userId: string; seat: number } | undefined;
      if (cmdRef.current === "leave" || cmdRef.current === "reset") {
        cmd = cmdRef.current;
        cmdRef.current = "poll";
        pending.seats = [];
        pending.config = undefined;
      } else if (pending.seats.length) {
        cmd = "seat";
        seat = pending.seats.shift();
      } else if (pending.config) {
        cmd = "config";
        config = pending.config;
        pending.config = undefined;
      } else {
        cmd = cmdRef.current;
        cmdRef.current = "poll";
      }
      let accepted = false;
      try {
        const res = await syncRoom({ data: { code, since: sinceRef.current, cmd, send, config, seat } });
        // A reply that left before the latest tap must not flip the board back.
        if (res.room && pendingRef.current.config) res.room.settings = pendingRef.current.config;
        if (stop || detachedRef.current) return;
        if (!res.ok) {
          if (String(res.error || "").includes("لست في الغرفة")) {
            outboxRef.current.length = 0;
            tell({ cmd: "local" });
            engineLiveRef.current = false;
            droppedRef.current.clear();
            codeRef.current = null;
            setCode(null);
            setRoom(null);
            roomRef.current = null;
            setLive(false);
            setPanel("online");
            setNote("انتهت الجلسة السابقة، والمقاعد فاضيّة.");
            return;
          }
          restoreBatch(outboxRef.current, send);
          setNote(res.error || "انقطع الاتصال بالغرفة");
          if (cmd === "leave") {
            setCode(null);
            setRoom(null);
            roomRef.current = null;
          }
          return;
        }
        accepted = true;
        if (res.room) {
          roomRef.current = res.room;
          setRoom(res.room);
          setLive(res.room.phase === "live");
          if (res.room.phase !== "live") engineLiveRef.current = false;
          const sync = syncRef.current;
          if (sync && res.room.phase === "live") {
            const here = res.room.members.filter((m) => m.here && m.seat != null);
            const online = here.map((m) => Number(m.seat)).sort().join(",");
            if (online !== sync.online) {
              sync.online = online;
              tell({ cmd: "sync-online", seats: here.map((m) => Number(m.seat)) });
            }
            const away = sync.seats.filter((x) => x.seat >= 0 && !here.some((m) => Number(m.seat) === x.seat)).map((x) => x.name);
            const awayNames = away.join("، ");
            if (awayNames !== sync.awayNames) {
              sync.awayNames = awayNames;
              setBanner(awayNames ? { text: `${awayNames} طلع من الصكة. الكمبيوتر يلعب عنه لين يرجع.` } : null);
            }
          }
          const hostAway = !sync && res.room.phase === "live" && res.room.hostId !== uid && res.room.hostOnline === false;
          if (hostAway && !hostAwayRef.current) {
            setBanner({ text: "صاحب الطاولة انقطع. ننتظره شوي، وإذا ما رجع ترجع الديوانية." });
          } else if (!hostAway && hostAwayRef.current) {
            setBanner(null);
          }
          hostAwayRef.current = hostAway;
          if (seenRef.current.size) {
            for (const member of res.room.members) {
              if (member.userId !== uid && !seenRef.current.has(member.userId) && invitesRef.current) {
                setNote(`${member.name} دخل الديوانية`);
              }
            }
          }
          seenRef.current = new Set(res.room.members.map((member) => member.userId));
          if (res.room.hostId === uid && res.room.phase === "live") {
            for (const member of res.room.members) {
              if (!member.seat || member.seat === 0) continue;
              if (!member.online) {
                if (!droppedRef.current.has(member.seat)) {
                  droppedRef.current.add(member.seat);
                  tell({ cmd: "drop", seat: member.seat });
                }
              } else if (droppedRef.current.has(member.seat)) {
                droppedRef.current.delete(member.seat);
                tell({ cmd: "adopt", seat: member.seat, name: member.name });
              }
            }
          }
        }
          for (const mail of res.mail) {
            sinceRef.current = Math.max(sinceRef.current, mail.id);
            const body = JSON.parse(mail.body) as Record<string, unknown>;
            applyMail(mail.kind, body, mail.from);
          }
      } catch {
        if (!accepted) restoreBatch(outboxRef.current, send);
        if (!stop) setNote("الشبكة تعثرت. بنعيد المحاولة.");
      }
    };
    function applyMail(kind: string, body: Record<string, unknown>, from: string) {
      if (detachedRef.current) return;
      const me = uid;
      if (kind === "start") {
        const seats = Array.isArray(body.seats) ? (body.seats as { userId: string; seat: number; name: string }[]) : [];
        const mine = seats.find((s) => s.userId === me);
        const humans: Record<number, string> = {};
        for (const seat of seats) humans[seat.seat] = seat.name;
        if (!mine) return;
        startSync({ ...body, you: mine.seat, seats, matchId: String(body.matchId || ""), topic: String(body.topic || "") }, []);
        engineLiveRef.current = true;
        droppedRef.current.clear();
        try { sessionStorage.setItem("qayd-match", JSON.stringify({ code, matchId: body.matchId || null })); } catch { /* ignore */ }
        setLive(true);
        setPanel(null);
        setNote("");
        return;
      }
      if (kind === "reset") {
        endSync();
        engineLiveRef.current = false;
        droppedRef.current.clear();
        try { sessionStorage.removeItem("qayd-match"); } catch { /* ignore */ }
        tell({ cmd: "table-stop" });
        setLive(false);
        setPanel("online");
        setBanner(null);
        setNote(
          body.reason === "host-lost"
            ? "صاحب الطاولة انقطع، فرجعت الديوانية. المقاعد باقية، وتقدرون تبدون صكة جديدة."
            : "رجعت الديوانية. المقاعد باقية، وتقدرون تبدون صكة جديدة.",
        );
        return;
      }
      if (from === me) return;
      if (kind === "view") tell({ cmd: "view", view: body });
      if (kind === "need") tell({ cmd: "need", id: body.id, kind: body.kind, options: body.options });
      if (kind === "sync") tell({ cmd: "sync", seat: Number(body.seat) });
      if (kind === "act") tell({ cmd: "act", id: body.id, action: body.action, seat: body.seat });
      if (kind === "qayd-watch") tell({ cmd: "qayd-watch", body });
      if (kind === "drop") tell({ cmd: "drop", seat: Number(body.seat) });
      if (kind === "adopt") tell({ cmd: "adopt", seat: Number(body.seat), name: String(body.name || "") });
      if (kind === "over" && syncRef.current) return;
      if (kind === "over") {
        const mine = roomRef.current?.members.find((m) => m.userId === me);
        tell({ cmd: "result", you: mine?.seat ?? 2, winner: body.winner, scores: body.scores, matchId: body.matchId || roomRef.current?.matchId || null, eval: body.eval, cuts: body.cuts });
      }
    }
    // One request at a time, and a slower beat while everyone is just sitting in the lobby.
    let timer = 0;
    const loop = async () => {
      await tick();
      if (stop) return;
      // During a match the moves travel on their own channel; the room only needs a heartbeat.
      const playing = roomRef.current?.phase === "live" && !!syncRef.current;
      const busy =
        (roomRef.current?.phase === "live" && !playing) ||
        cmdRef.current !== "poll" ||
        outboxRef.current.length > 0 ||
        pendingRef.current.seats.length > 0 ||
        !!pendingRef.current.config;
      timer = window.setTimeout(() => void loop(), busy ? 120 : playing ? 1500 : 1200);
    };
    void loop();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [code, user?.id]);

  function startSync(info: Record<string, unknown>, moves: { k: number; seat: number; body: Record<string, unknown> }[]) {
    const matchId = String(info.matchId || "");
    if (!matchId) return;
    const seats = (Array.isArray(info.seats) ? (info.seats as { seat: number; name: string }[]) : [])
      .map((x) => ({ seat: Number(x.seat), name: String(x.name || "") }));
    syncRef.current = { matchId, have: moves.length ? moves[moves.length - 1].k : -1, online: "", awayNames: "", seats };
    tell({ cmd: "sync-start", ...info, matchId, moves });
    engineLiveRef.current = true;
    droppedRef.current.clear();
    setSyncMatch({ matchId, topic: String(info.topic || "") });
    try { sessionStorage.setItem("qayd-match", JSON.stringify({ code: codeRef.current, matchId })); } catch { /* ignore */ }
    setLive(true);
    setPanel(null);
  }

  async function enter(next: string, create = false): Promise<string | null> {
    detachedRef.current = false;
    setNote("");
    let cleaned = next.trim().toLowerCase();
    if (cleaned !== NAMED && !/^\d{6}$/.test(cleaned)) {
      setNote("الرمز ٦ أرقام.");
      return null;
    }
    try {
      const name = (localName() && localName() !== "ضيف قيد" ? localName() : user?.displayName || localName() || "لاعب").slice(0, 14);
      let res = await joinRoom({ data: { code: cleaned, name, create } });
      for (let attempt = 0; create && attempt < 4 && !res.ok && "taken" in res && res.taken; attempt += 1) {
        // A fresh room must be empty: if the random code is in use, roll another.
        cleaned = String(100000 + Math.floor(Math.random() * 900000));
        res = await joinRoom({ data: { code: cleaned, name, create } });
      }
      if (!res.ok || !res.room) {
        setNote(res.ok ? "ما قدرنا نفتح الديوانية" : res.error);
        return null;
      }
      sinceRef.current = Number(res.since) || 0;
      roomRef.current = res.room;
      setRoom(res.room);
      setCode(res.room.code);
      setLive(res.room.phase === "live");
      if (res.room.phase === "live") {
        const resume = (res as { resume?: Record<string, unknown> | null }).resume;
        if (resume && resume.matchId) {
          const matchId = String(resume.matchId);
          const moves: { k: number; seat: number; body: Record<string, unknown> }[] = [];
          for (let guard = 0; guard < 20; guard += 1) {
            const page = await pullMoves({ data: { matchId, since: moves.length ? moves[moves.length - 1].k : -1 } });
            if (!page.ok || !page.moves.length) break;
            moves.push(...page.moves);
            if (page.moves.length < 400) break;
          }
          startSync({ ...resume, matchId, topic: String(resume.topic || "") }, moves);
          setNote("رجعت لمقعدك في نفس الصكة.");
        } else {
          setNote("الصكة قائمة الحين. انتظر الجاية أو ادخل غرفة ثانية.");
        }
      }
      return res.room.code;
    } catch {
      setNote("ادخل بحسابك أول عشان تلعب مع خويك.");
      setPanel("account");
      return null;
    }
  }

  async function leaveLobby() {
    if (live && panel === "online") {
      setPanel(null);
      return;
    }
    if (panel === "account") {
      setPanel(null);
      return;
    }
    const current = code;
    if (current && !live) {
      try {
        await syncRoom({ data: { code: current, since: sinceRef.current, cmd: "leave", send: [] } });
      } catch {
        /* still close locally */
      }
    }
    setPanel(null);
    if (!live) {
      setCode(null);
      setRoom(null);
      roomRef.current = null;
    }
  }

  // A refresh in the middle of a match: go back to the same table and seat.
  useEffect(() => {
    if (!user || codeRef.current) return;
    let saved: { code?: string } | null = null;
    try { saved = JSON.parse(sessionStorage.getItem("qayd-match") || "null") as { code?: string } | null; } catch { saved = null; }
    if (saved?.code) void enter(String(saved.code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!syncMatch || !user) return;
    const { matchId, topic } = syncMatch;
    let stop = false;
    let instant = false;
    let cleanup: (() => void) | null = null;
    const deliver = (moves: { k: number; seat: number; body: Record<string, unknown> }[]) => {
      const sync = syncRef.current;
      if (!sync || sync.matchId !== matchId || !moves.length) return;
      for (const m of moves) if (m.k === sync.have + 1) sync.have = m.k;
      tell({ cmd: "sync-moves", matchId, moves });
    };
    const pull = async () => {
      const sync = syncRef.current;
      if (!sync || sync.matchId !== matchId) return;
      const res = await pullMoves({ data: { matchId, since: sync.have } });
      if (res.ok) deliver(res.moves);
    };
    // Realtime brings each move in a fraction of a second; pulling covers gaps and phones without it.
    void (async () => {
      try {
        const cfg = topic ? await movesConfig() : null;
        if (!cfg || stop) return;
        const { createClient } = await import("@supabase/supabase-js");
        const client = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
        const channel = client.channel(topic, { config: { broadcast: { self: true } } });
        channel.on("broadcast", { event: "m" }, (msg) => {
          const moves = (msg.payload as { moves?: { k: number; seat: number; body: Record<string, unknown> }[] })?.moves || [];
          const sync = syncRef.current;
          if (sync && moves.some((m) => m.k > sync.have + 1)) void pull().catch(() => undefined);
          deliver(moves);
        });
        channel.subscribe((status) => { instant = status === "SUBSCRIBED"; });
        cleanup = () => { void client.removeChannel(channel); };
        if (stop) cleanup();
      } catch {
        /* pulling still works */
      }
    })();
    let timer = 0;
    const loop = async () => {
      try { await pull(); } catch { /* next round */ }
      if (stop) return;
      timer = window.setTimeout(() => void loop(), instant ? 2500 : 350);
    };
    void loop();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      if (cleanup) cleanup();
    };
  }, [syncMatch?.matchId, user?.id]);

  useEffect(() => {
    if (!user?.displayName || !src) return;
    tell({ cmd: "name", name: user.displayName.slice(0, 14) });
    tell({ cmd: "xp-flush" });
  }, [user?.displayName, src]);

  useEffect(() => {
    tell({ cmd: "notices", show: !!user, unread });
  }, [user, unread, src]);

  const host = !!user && room?.hostId === user.id;

  return (
    <div className="fixed inset-0 bg-[var(--q-bg)]" data-theme={theme} style={PALETTES[theme] as CSSProperties}>
      {user ? (
        <NoticeBell
          open={noticeOpen}
          items={notices}
          unread={unread}
          onToggle={() => setNoticeOpen((open) => !open)}
          onRefresh={async () => {
            const notes = await listNotices();
            setNotices(notes.items);
            setUnread(notes.unread);
          }}
          onOpenHref={(href) => {
            setNoticeOpen(false);
            if (href === "friends") setPanel("friends");
            else if (href.startsWith("room:")) {
              setPanel("online");
              void enter(href.slice(5));
            }
          }}
        />
      ) : null}
      {banner ? (
        <div
          className="fixed inset-x-3 top-3 z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-[var(--q-primary)] px-4 py-3 text-sm text-[var(--q-primary-ink)] shadow-2xl"
          role="status"
          dir="rtl"
        >
          <span>{banner.text}</span>
          <span className="flex shrink-0 items-center gap-3">
            {banner.code ? (
              <button
                type="button"
                className="min-h-10 rounded-xl bg-[var(--q-surface)] px-3 text-[var(--q-accent)]"
                onClick={() => {
                  const roomCode = banner.code || "";
                  setBanner(null);
                  setPanel("online");
                  void enter(roomCode);
                }}
              >
                ادخل
              </button>
            ) : null}
            <button type="button" className="min-h-10 underline" onClick={() => setBanner(null)}>
              إخفاء
            </button>
          </span>
        </div>
      ) : null}
      {src ? (
        <iframe
          ref={frameRef}
          title={TITLE}
          src={src}
          className="h-full w-full border-0"
          allow="autoplay"
        />
      ) : (
        <div className="grid h-full place-items-center bg-[var(--q-bg)] text-[var(--q-accent)]">
          <div className="text-center">
            <h1 className="qayd-display text-4xl">{TITLE}</h1>
            <p className="mt-2 text-sm">نفتح الديوانية…</p>
          </div>
        </div>
      )}
      {panel ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-[#0c0608]/78" onClick={() => void leaveLobby()}>
          <section
            className="qayd-sheet max-h-[92dvh] w-full overflow-auto rounded-t-[28px] px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] text-[var(--q-ink)] sm:max-w-md sm:mb-6 sm:rounded-[28px] sm:border-b"
            style={(theme === "trad" ? { ...PALETTES.trad, ...TRAD_SHEET } : PALETTES[theme]) as CSSProperties}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={panel === "online" ? TITLE : panel === "friends" ? "الأصدقاء" : "الحساب"}
          >
            {panel === "account" ? (
              <>
                <h2 className="qayd-display text-3xl text-[var(--q-accent)]">الحساب</h2>
                <p className="mt-1 mb-4 text-sm leading-6">التقدم ينحفظ للحساب: الاسم، العملات، الانتصارات، والرتبة. ما نعرض نجاح الحفظ إلا بعد ما يوصل.</p>
                <SignInGate
                  fallback={<AuthPanel onDone={() => setPanel(null)} />}
                >
                  <AccountBox
                    name={localName() || user?.displayName || "لاعب"}
                    login={loginLabel(user?.primaryEmail)}
                    wins={localStats().wins}
                    games={localStats().games}
                    coins={localStats().coins}
                    passNow={passNow}
                    passNext={passNext}
                    passNote={passNote}
                    leaveArmed={leaveArmed}
                    onNow={setPassNow}
                    onNext={setPassNext}
                    onPassword={async () => {
                      setPassNote("");
                      if (passNext.length < 8) {
                        setPassNote("كلمة المرور الجديدة ٨ أحرف على الأقل.");
                        return;
                      }
                      const res = await authClient.changePassword({
                        currentPassword: passNow,
                        newPassword: passNext,
                        revokeOtherSessions: true,
                      });
                      if (res.error) {
                        setPassNote("كلمة المرور الحالية غير صحيحة.");
                        return;
                      }
                      setPassNow("");
                      setPassNext("");
                      setPassNote("تغيّرت كلمة المرور، والجلسات الثانية انتهت.");
                    }}
                    onArmLeave={() => setLeaveArmed(true)}
                    onLogout={async () => {
                      const mine = readLocal();
                      if (mine?.accountId && user) {
                        try {
                          await saveProfile({ data: JSON.stringify({ ...mine, accountId: user.id, savedAt: Date.now() }) });
                        } catch {
                          setPassNote("ما انحفظ الحساب. بقينا داخل عشان ما يضيع التقدم.");
                          setLeaveArmed(false);
                          return;
                        }
                      }
                      localStorage.setItem("sb", JSON.stringify(GUEST));
                      await signOut();
                    }}
                    onClose={() => {
                      setLeaveArmed(false);
                      setPanel(null);
                      tell({ cmd: "settings" });
                    }}
                  />
                </SignInGate>
              </>
            ) : panel === "friends" ? (
              <SignInGate fallback={<div className="mt-4"><AuthPanel /></div>}>
                <FriendsBook
                  onClose={() => setPanel(null)}
                  onInvite={async (friendId) => {
                    // Open (or reuse) the room first, then send the friend its real code.
                    let roomCode = codeRef.current;
                    setPanel("online");
                    if (!roomCode) roomCode = await enter(String(100000 + Math.floor(Math.random() * 900000)), true);
                    if (!roomCode) return;
                    try {
                      await inviteFriend({ data: { id: friendId, code: roomCode } });
                      setNote("انرسلت الدعوة. ننتظر خويك يدخل.");
                    } catch {
                      setNote("ما قدرنا نرسل الدعوة. تأكد إنه من أصدقائك.");
                    }
                  }}
                />
              </SignInGate>
            ) : (
              <>
                <p className="text-xs tracking-wide text-[var(--q-accent)]">ديوانية أونلاين</p>
                <h2 className="qayd-display text-3xl leading-tight text-[var(--q-accent)]">{room?.title || TITLE}</h2>
                <p className="mt-2 text-sm leading-6">
                  أنت وخويك تفتحون اللعبة وتضغطون أونلاين. نفس الديوانية، وأول واحد يبدأ الصكة. المقاعد الفاضية يكملها الكمبيوتر.
                </p>
                <SignInGate fallback={<div className="mt-4"><AuthPanel /></div>}>
                  {!code ? (
                    <div className="mt-4 grid gap-3">
                      <button type="button" className="min-h-12 rounded-xl bg-[var(--q-primary)] text-[var(--q-primary-ink)]" onClick={() => void enter(NAMED)}>
                        ادخل ديوانية {TITLE}
                      </button>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <input
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="رمز غرفة خاصة"
                          value={privateCode}
                          onChange={(e) => setPrivateCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          className="min-h-12 rounded-xl border border-[var(--q-line)] bg-[var(--q-input)] text-[var(--q-ink)] px-3 text-center text-xl tracking-[0.3em]"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          className="min-h-12 rounded-xl border border-[var(--q-primary)] px-4"
                          onClick={() => void (privateCode ? enter(privateCode) : enter(String(100000 + Math.floor(Math.random() * 900000)), true))}
                        >
                          {privateCode ? "ادخل" : "سوِّ غرفة"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <RoomBoard
                      room={room}
                      meId={user?.id || ""}
                      host={host}
                      live={live}
                      coins={localStats().coins}
                      showPresence={presenceRef.current}
                      label={(member) =>
                        blockedRef.current.has(member.name) || blockedIdsRef.current.has(member.userId) ? "محظور" : member.name
                      }
                      onConfig={(next) => {
                        if (!room) return;
                        const updated = { ...room, settings: next };
                        roomRef.current = updated;
                        setRoom(updated);
                        pendingRef.current.config = next;
                      }}
                      onSeat={(userId, seat) => {
                        pendingRef.current.seats.push({ userId, seat });
                      }}
                      onStart={() => {
                        detachedRef.current = false;
                        cmdRef.current = "start";
                        setNote("نجهّز الصكة…");
                      }}
                      onReset={() => {
                        cmdRef.current = "reset";
                      }}
                      onLeave={() => void leaveLobby()}
                    />
                  )}
                </SignInGate>
                {note ? <p className="mt-3 text-sm text-[var(--q-error)]">{note}</p> : null}
              </>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
