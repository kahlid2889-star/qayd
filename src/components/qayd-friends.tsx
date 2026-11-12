import { useEffect, useMemo, useState } from "react";
import { ACHIEVEMENTS, type Activity } from "@/lib/qayd/social";
import { listFriends, openFriend, requestFriend, respondFriend, searchPlayer } from "@/lib/qayd/server";

type Card = {
  id: string;
  name: string;
  at: number;
  online: boolean;
  activity: Activity;
  xp: number;
  stage: number;
  line: string;
  face: string;
  suit: string;
  title: string;
  pct: number;
  red: boolean;
  wins: number | null;
  games: number | null;
  mark: string;
};

type Book = {
  incoming: Card[];
  outgoing: Card[];
  friends: Card[];
  blocked: { id: string; name: string; at: number }[];
};

type Hit = { id: string; name: string; online: boolean };

type Profile = {
  id: string;
  name: string;
  relation: "friend" | "incoming" | "outgoing" | "none" | "blocked";
  blocked: boolean;
  online?: boolean;
  activity?: Activity;
  photo?: string;
  mark?: string;
  face?: string;
  suit?: string;
  title?: string;
  line?: string;
  red?: boolean;
  xp?: number;
  into?: number;
  need?: number;
  pct?: number;
  wins?: number | null;
  games?: number | null;
  losses?: number | null;
  hands?: number | null;
  kaboots?: number | null;
  best?: number | null;
  earned?: string[];
};

const TABS = [
  ["all", "الكل"],
  ["online", "متصل"],
  ["offline", "بعيد"],
  ["in", "وصلني"],
  ["out", "أرسلته"],
] as const;

type Tab = (typeof TABS)[number][0];

const ACTIVITY: Record<Activity, string> = {
  live: "داخل صكة",
  room: "داخل غرفة",
  online: "متصل",
  offline: "غير متصل",
};

const MARK: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

function activityRank(activity: Activity) {
  return activity === "live" ? 0 : activity === "room" ? 1 : activity === "online" ? 2 : 3;
}

function RankPip({ face, suit, red }: { face: string; suit: string; red: boolean }) {
  return (
    <span
      className="grid h-[64px] w-[46px] shrink-0 place-items-center rounded-md bg-white shadow-[0_1px_0_#fff_inset,0_4px_10px_rgba(20,10,8,.18)]"
      style={{ color: red ? "#c8102e" : "#161616" }}
      aria-hidden="true"
    >
      <b className="text-[15px] leading-none">{face}</b>
      <span className="text-lg leading-none">{suit}</span>
    </span>
  );
}

function Portrait({ name, mark, photo }: { name: string; mark?: string; photo?: string }) {
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--q-primary)] text-lg text-[var(--q-primary-ink)]">
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : mark && MARK[mark] ? MARK[mark] : name.slice(0, 1)}
    </span>
  );
}

export function FriendsBook({ onClose, onInvite }: { onClose: () => void; onInvite: (friendId: string) => void }) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [msg, setMsg] = useState("");
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const next = await listFriends();
    setBook({ incoming: next.incoming, outgoing: next.outgoing, friends: next.friends, blocked: next.blocked });
    setPhase("ready");
  }

  useEffect(() => {
    let stop = false;
    const pull = () => {
      void listFriends()
        .then((next) => {
          if (stop) return;
          setBook({ incoming: next.incoming, outgoing: next.outgoing, friends: next.friends, blocked: next.blocked });
          setPhase("ready");
        })
        .catch(() => {
          if (!stop) setPhase((current) => (current === "loading" ? "error" : current));
        });
    };
    pull();
    const timer = window.setInterval(pull, 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  async function run(job: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg("");
    try {
      await job();
      await refresh();
      setMsg(ok);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "ما تم الطلب");
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    setBusy(true);
    setMsg("");
    try {
      const next = await openFriend({ data: { id } });
      setProfile(next);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "ما انفتح الملف");
    } finally {
      setBusy(false);
    }
  }

  const friends = useMemo(() => {
    const rows = book?.friends || [];
    const needle = query.trim();
    return rows
      .filter((row) => {
        if (tab === "online") return row.activity !== "offline";
        if (tab === "offline") return row.activity === "offline";
        if (tab === "in" || tab === "out") return false;
        return true;
      })
      .filter((row) => !needle || row.name.includes(needle) || row.id.includes(needle))
      .slice()
      .sort((a, b) => activityRank(a.activity) - activityRank(b.activity) || a.name.localeCompare(b.name, "ar"));
  }, [book, tab, query]);

  const onlineCount = (book?.friends || []).filter((row) => row.activity !== "offline").length;

  if (profile) {
    const earned = new Set(profile.earned || []);
    return (
      <div dir="rtl" className="grid gap-3">
        <button type="button" className="min-h-10 justify-self-start text-sm text-[var(--q-accent)]" onClick={() => setProfile(null)}>
          رجوع للقائمة
        </button>
        <div className="flex items-center gap-3">
          <Portrait name={profile.name} mark={profile.mark} photo={profile.photo} />
          <div className="min-w-0">
            <h2 className="qayd-display truncate text-3xl text-[var(--q-accent)]">{profile.name}</h2>
            <p className="text-sm">{profile.blocked ? "محظور" : ACTIVITY[profile.activity || "offline"]}</p>
          </div>
        </div>
        {profile.blocked ? (
          <p className="text-sm leading-6">الحظر قائم. ما نعرض رتبته ولا إحصاءه.</p>
        ) : (
          <>
            <section className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-2xl border border-[var(--q-gold)] bg-[var(--q-card)] p-3">
              <RankPip face={profile.face || "٧"} suit={profile.suit || "♦"} red={!!profile.red} />
              <div>
                <p className="text-xs text-[var(--q-muted)]">كرت المستوى</p>
                <b className="block text-lg">{profile.line}</b>
                <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--q-ink)_12%,transparent)]">
                  <i className="block h-full bg-[var(--q-gold)]" style={{ width: `${profile.pct || 0}%` }} />
                </span>
                <p className="mt-1 text-xs text-[var(--q-muted)]">
                  {profile.need ? `${profile.into} / ${profile.need}` : "اكتملت الرحلة"} · {profile.xp} خبرة
                </p>
              </div>
            </section>
            <section className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-[var(--q-card)] px-2 py-2"><b className="block text-lg">{profile.games ?? "—"}</b>صكة</div>
              <div className="rounded-xl bg-[var(--q-card)] px-2 py-2"><b className="block text-lg">{profile.wins ?? "—"}</b>فوز</div>
              <div className="rounded-xl bg-[var(--q-card)] px-2 py-2"><b className="block text-lg">{profile.losses ?? "—"}</b>خسارة</div>
            </section>
            {profile.games ? (
              <p className="text-sm text-[var(--q-muted)]">
                نسبة الفوز {Math.round(((profile.wins || 0) / profile.games) * 100)}٪
                {profile.kaboots != null ? ` · كبوت ${profile.kaboots}` : ""}
                {profile.best != null ? ` · أفضل سلسلة ${profile.best}` : ""}
              </p>
            ) : null}
            <section>
              <h3 className="mb-2 text-sm font-bold text-[var(--q-accent)]">التحديات المحفوظة</h3>
              <ul className="grid gap-2">
                {ACHIEVEMENTS.map((item) => {
                  const on = earned.has(item.id);
                  return (
                    <li key={item.id} className={"rounded-xl border px-3 py-2 text-sm " + (on ? "border-[var(--q-gold)] bg-[var(--q-card)]" : "border-[var(--q-line)] opacity-60")}>
                      <b>{item.name}</b>
                      <p className="text-xs text-[var(--q-muted)]">{on ? item.detail : "ما اكتمل"}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {profile.relation === "friend" ? (
            <>
              <button type="button" disabled={busy} className="min-h-11 rounded-xl bg-[var(--q-primary)] px-4 text-[var(--q-primary-ink)]" onClick={() => onInvite(profile.id)}>ادعُ للطاولة</button>
              <button type="button" disabled={busy} className="min-h-11 rounded-xl border border-[var(--q-line)] px-3" onClick={() => void run(() => respondFriend({ data: { id: profile.id, action: "remove" } }).then(() => setProfile(null)), "انشال من الأصدقاء")}>إزالة</button>
            </>
          ) : null}
          {profile.relation === "incoming" ? (
            <>
              <button type="button" disabled={busy} className="min-h-11 rounded-xl bg-[var(--q-primary)] px-4 text-[var(--q-primary-ink)]" onClick={() => void run(() => respondFriend({ data: { id: profile.id, action: "accept" } }).then(() => open(profile.id)), "قبلت الطلب")}>قبول</button>
              <button type="button" disabled={busy} className="min-h-11 rounded-xl border border-[var(--q-line)] px-3" onClick={() => void run(() => respondFriend({ data: { id: profile.id, action: "refuse" } }).then(() => setProfile(null)), "رفضت الطلب")}>رفض</button>
            </>
          ) : null}
          {profile.relation === "outgoing" ? (
            <button type="button" disabled={busy} className="min-h-11 rounded-xl border border-[var(--q-line)] px-3" onClick={() => void run(() => respondFriend({ data: { id: profile.id, action: "cancel" } }).then(() => setProfile(null)), "ألغيت الطلب")}>إلغاء الطلب</button>
          ) : null}
          {profile.relation === "none" ? (
            <button type="button" disabled={busy} className="min-h-11 rounded-xl bg-[var(--q-primary)] px-4 text-[var(--q-primary-ink)]" onClick={() => void run(() => requestFriend({ data: { id: profile.id } }).then(() => open(profile.id)), "انرسل الطلب")}>أرسل طلب</button>
          ) : null}
          {profile.relation === "blocked" ? (
            <button type="button" disabled={busy} className="min-h-11 rounded-xl border border-[var(--q-line)] px-3" onClick={() => void run(() => respondFriend({ data: { id: profile.id, action: "unblock" } }).then(() => setProfile(null)), "انفك الحظر")}>فك الحظر</button>
          ) : profile.relation !== "none" ? (
            <button type="button" disabled={busy} className="min-h-11 rounded-xl border border-[var(--q-line)] px-3" onClick={() => void run(() => respondFriend({ data: { id: profile.id, action: "block" } }).then(() => setProfile(null)), "انحظر")}>حظر</button>
          ) : null}
        </div>
        {msg ? <p className="text-sm text-[var(--q-accent)]">{msg}</p> : null}
      </div>
    );
  }

  return (
    <div dir="rtl" className="grid gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-wide text-[var(--q-accent)]">ديوانية الخوي</p>
          <h2 className="qayd-display text-3xl text-[var(--q-accent)]">الأصدقاء</h2>
        </div>
        <p className="text-sm text-[var(--q-muted)]">{onlineCount} متصل</p>
      </div>
      <form
        className="grid grid-cols-[1fr_auto] gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const q = query.trim();
          if (q.length < 2) {
            setHits(null);
            setMsg("اكتب حرفين على الأقل.");
            return;
          }
          void run(async () => {
            const hit = await searchPlayer({ data: { q } });
            setHits(hit.results || []);
            if (!hit.found) throw new Error(hit.reason || "ما لقينا أحد");
          }, "لقينا نتائج");
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value.slice(0, 40))}
          placeholder="اسم المستخدم"
          aria-label="بحث عن لاعب"
          className="min-h-12 rounded-xl border border-[var(--q-line)] bg-[var(--q-input)] px-3 text-[var(--q-ink)]"
        />
        <button type="submit" disabled={busy} className="min-h-12 rounded-xl bg-[var(--q-primary)] px-4 text-[var(--q-primary-ink)]">بحث</button>
      </form>
      {hits ? (
        hits.length ? (
          <div className="grid gap-2">
            {hits.map((hit) => (
              <div key={hit.id} className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--q-card)] px-3 py-2">
                <button type="button" className="min-w-0 text-start" onClick={() => void open(hit.id)}>
                  <b className="block truncate">{hit.name}</b>
                  <span className="text-xs text-[var(--q-muted)]">{hit.online ? "متصل" : "غير متصل"}</span>
                </button>
                <button type="button" disabled={busy} className="min-h-10 rounded-xl border border-[var(--q-primary)] px-3 text-sm" onClick={() => void run(() => requestFriend({ data: { id: hit.id } }), "انرسل الطلب")}>
                  أرسل طلب
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--q-muted)]">ما لقينا أحد بهذا الاسم.</p>
        )
      ) : null}
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="أقسام الأصدقاء">
        {TABS.map(([id, label]) => {
          const count = id === "in" ? book?.incoming.length || 0 : id === "out" ? book?.outgoing.length || 0 : 0;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={"min-h-10 shrink-0 rounded-full border px-3 text-sm " + (tab === id ? "border-[var(--q-gold)] bg-[var(--q-card)] font-bold" : "border-[var(--q-line)]")}
            >
              {label}{count ? ` ${count}` : ""}
            </button>
          );
        })}
      </div>
      {phase === "loading" ? <p className="text-sm text-[var(--q-muted)]">نفتح قائمة الخوي…</p> : null}
      {phase === "error" ? (
        <div className="rounded-2xl border border-[var(--q-line)] px-3 py-4 text-sm">
          <p>ما انفتحت القائمة. يمكن الشبكة قطعت.</p>
          <button type="button" className="mt-2 min-h-10 rounded-xl border border-[var(--q-primary)] px-3" onClick={() => { setPhase("loading"); void refresh().catch(() => setPhase("error")); }}>
            أعد المحاولة
          </button>
        </div>
      ) : null}
      {tab === "in" ? (
        (book?.incoming.length ? book.incoming.map((row) => (
          <article key={row.id} className="flex items-center gap-3 rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] px-3 py-3">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => void open(row.id)}>
              <Portrait name={row.name} mark={row.mark} />
              <span className="min-w-0"><b className="block truncate">{row.name}</b><span className="text-xs text-[var(--q-muted)]">طلب صداقة · {row.line}</span></span>
            </button>
            <span className="flex shrink-0 gap-1">
              <button type="button" disabled={busy} className="min-h-10 rounded-xl bg-[var(--q-primary)] px-3 text-sm text-[var(--q-primary-ink)]" onClick={() => void run(() => respondFriend({ data: { id: row.id, action: "accept" } }), "قبلت الطلب")}>قبول</button>
              <button type="button" disabled={busy} className="min-h-10 rounded-xl border border-[var(--q-line)] px-2 text-sm" onClick={() => void run(() => respondFriend({ data: { id: row.id, action: "refuse" } }), "رفضت الطلب")}>رفض</button>
            </span>
          </article>
        )) : <p className="text-sm text-[var(--q-muted)]">ما فيه طلبات واصلة.</p>)
      ) : null}
      {tab === "out" ? (
        (book?.outgoing.length ? book.outgoing.map((row) => (
          <article key={row.id} className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] px-3 py-3">
            <button type="button" className="min-w-0 text-start" onClick={() => void open(row.id)}>
              <b className="block truncate">{row.name}</b>
              <span className="text-xs text-[var(--q-muted)]">بانتظار الرد</span>
            </button>
            <button type="button" disabled={busy} className="min-h-10 rounded-xl border border-[var(--q-line)] px-3 text-sm" onClick={() => void run(() => respondFriend({ data: { id: row.id, action: "cancel" } }), "ألغيت الطلب")}>إلغاء</button>
          </article>
        )) : <p className="text-sm text-[var(--q-muted)]">ما فيه طلبات خارجة.</p>)
      ) : null}
      {tab !== "in" && tab !== "out" ? (
        friends.length ? friends.map((row) => (
          <article key={row.id} className="flex items-center gap-3 rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] px-3 py-3">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => void open(row.id)}>
              <span className="relative">
                <Portrait name={row.name} mark={row.mark} />
                <i className={"absolute bottom-0 left-0 h-3 w-3 rounded-full border-2 border-[var(--q-card)] " + (row.activity === "offline" ? "bg-[var(--q-muted)]" : "bg-[var(--q-ok)]")} />
              </span>
              <span className="min-w-0">
                <b className="block truncate">{row.name}</b>
                <span className="block truncate text-xs text-[var(--q-muted)]">{ACTIVITY[row.activity]} · {row.line}</span>
              </span>
            </button>
            <RankPip face={row.face} suit={row.suit} red={row.red} />
          </article>
        )) : (
          <p className="rounded-2xl border border-dashed border-[var(--q-line)] px-3 py-6 text-center text-sm text-[var(--q-muted)]">
            {query.trim() ? "ما فيه صديق يطابق البحث." : tab === "online" ? "ما فيه أحد متصل الآن." : tab === "offline" ? "كل أصحابك متصلون، أو ما أضفت أحد." : "ما فيه أصدقاء بعد. ابحث بالاسم أو المعرّف."}
          </p>
        )
      ) : null}
      {tab === "all" && book?.blocked.length ? (
        <div className="grid gap-2">
          <h3 className="text-sm text-[var(--q-muted)]">محظورون</h3>
          {book.blocked.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--q-card)] px-3 py-2 text-sm">
              <span className="truncate">{row.name}</span>
              <button type="button" disabled={busy} className="min-h-10" onClick={() => void run(() => respondFriend({ data: { id: row.id, action: "unblock" } }), "انفك الحظر")}>فك الحظر</button>
            </div>
          ))}
        </div>
      ) : null}
      {msg ? <p className="text-sm text-[var(--q-accent)]">{msg}</p> : null}
      <button type="button" className="min-h-11 text-sm" onClick={onClose}>رجوع</button>
    </div>
  );
}
