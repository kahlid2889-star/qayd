import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { authMessage, useSession } from "./session";
import { AVATARS, Avatar, Btn, Coin, Field, Note, Sheet, Tabs, Toggle, inputCls, reasonLabel } from "./ui";

type Mode = "in" | "up" | "forgot";

function AuthForms({ onDone }: { onDone: () => void }) {
  const s = useSession();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [username, setUsername] = useState(""); const [displayName, setDisplayName] = useState("");
  const [free, setFree] = useState<null | boolean>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [info, setInfo] = useState("");
  const stamp = useRef(0);

  // Instant username check while typing (debounced); the server still has the final word.
  useEffect(() => {
    setFree(null);
    const u = username.trim().toLowerCase();
    if (mode !== "up" || !/^[a-z0-9_]{3,20}$/.test(u)) return;
    const mine = ++stamp.current;
    const t = setTimeout(() => { void api.usernameAvailable(u).then((v) => { if (stamp.current === mine) setFree(v); }).catch(() => undefined); }, 350);
    return () => clearTimeout(t);
  }, [username, mode]);

  const userErr = mode === "up" && username && !/^[a-z0-9_]{3,20}$/i.test(username) ? "٣ إلى ٢٠ حرف: إنجليزي وأرقام و _ فقط" : free === false ? "الاسم مأخوذ" : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setInfo(""); setBusy(true);
    try {
      if (mode === "in") { await s.signIn(email, password); onDone(); }
      else if (mode === "up") {
        if (userErr || !displayName.trim()) throw new Error(userErr || "اكتب اسمك على الطاولة");
        const r = await s.signUp({ email, password, username, displayName });
        if (r === "confirm-email") setInfo("وصلتك رسالة على إيميلك. اضغط الرابط وبعدها سجّل دخولك."); else onDone();
      } else { await s.resetPassword(email); setInfo("أرسلنا لك رابط تغيير كلمة المرور. شوف إيميلك."); }
    } catch (x) { setErr(authMessage(x)); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      {mode !== "forgot" && <Tabs value={mode} onChange={(m) => { setMode(m); setErr(""); setInfo(""); }} items={[{ id: "in", label: "دخول" }, { id: "up", label: "حساب جديد" }]} />}
      {mode === "forgot" && <p className="text-sm text-[var(--q-muted)]">اكتب إيميلك ونرسل لك رابط تغيير كلمة المرور.</p>}
      {mode === "up" && (<>
        <Field label="الاسم على الطاولة" hint="يظهر للاعبين (حتى ١٤ حرف)"><input className={inputCls} value={displayName} maxLength={14} onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" /></Field>
        <Field label="اسم المستخدم" hint={free === true ? "✓ متاح" : "الأصدقاء يلقونك فيه. إنجليزي وأرقام"} error={userErr}>
          <input className={inputCls} dir="ltr" value={username} maxLength={20} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoComplete="username" autoCapitalize="none" />
        </Field>
      </>)}
      <Field label="الإيميل"><input className={inputCls} dir="ltr" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
      {mode !== "forgot" && <Field label="كلمة المرور" hint={mode === "up" ? "٨ أحرف على الأقل" : undefined}><input className={inputCls} dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "up" ? "new-password" : "current-password"} minLength={8} required /></Field>}
      {err && <Note kind="error">{err}</Note>}{info && <Note kind="ok">{info}</Note>}
      <Btn tone="primary" wide busy={busy} type="submit">{mode === "in" ? "ادخل" : mode === "up" ? "سوِّ الحساب" : "أرسل الرابط"}</Btn>
      {mode === "in" && <button type="button" className="min-h-11 text-sm text-[var(--q-muted)] underline" onClick={() => { setMode("forgot"); setErr(""); }}>نسيت كلمة المرور؟</button>}
      {mode === "forgot" && <button type="button" className="min-h-11 text-sm text-[var(--q-muted)] underline" onClick={() => { setMode("in"); setErr(""); setInfo(""); }}>رجوع للدخول</button>}
      <p className="text-center text-xs text-[var(--q-muted)]">اللعب ضد الكمبيوتر يشتغل بدون حساب. الحساب للأونلاين والأصدقاء.</p>
    </form>
  );
}

function NewPassword() {
  const s = useSession(); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(""); try { await s.setNewPassword(pw); } catch (x) { setErr(authMessage(x)); } finally { setBusy(false); } }}>
      <p className="text-sm text-[var(--q-muted)]">اكتب كلمة المرور الجديدة.</p>
      <Field label="كلمة المرور الجديدة"><input className={inputCls} dir="ltr" type="password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required /></Field>
      {err && <Note kind="error">{err}</Note>}
      <Btn tone="primary" wide busy={busy} type="submit">احفظ</Btn>
    </form>
  );
}

function Profile() {
  const s = useSession(); const p = s.profile;
  const [name, setName] = useState(p?.display_name ?? ""); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pw, setPw] = useState(""); const [openPw, setOpenPw] = useState(false);
  useEffect(() => { setName(p?.display_name ?? ""); }, [p?.display_name]);
  if (!p) return <p className="text-sm text-[var(--q-muted)]">نحمّل حسابك…</p>;
  const save = async (patch: Parameters<typeof api.updateProfile>[0]) => {
    setBusy(true); setMsg(null);
    try { await api.updateProfile(patch); await s.refresh(); setMsg({ kind: "ok", text: "انحفظ" }); } catch (x) { setMsg({ kind: "error", text: (x as Error).message }); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--q-line)] bg-[var(--q-card)] p-3">
        <Avatar name={p.display_name} avatar={p.avatar} size={56} />
        <div className="min-w-0 flex-1"><b className="block truncate text-lg">{p.display_name}</b><span dir="ltr" className="block truncate text-sm text-[var(--q-muted)]">@{p.username}</span><span className="text-xs text-[var(--q-muted)]">{s.session?.user.email}</span></div>
        <div className="text-end"><b className="block text-lg"><Coin /> {(s.wallet?.coins ?? 0).toLocaleString("en")}</b><small className="text-xs text-[var(--q-muted)]">XP {p.xp}</small></div>
      </div>

      <section className="grid gap-2"><h3 className="text-sm font-extrabold">الاسم والصورة</h3>
        <div className="flex gap-2"><input className={inputCls} value={name} maxLength={14} onChange={(e) => setName(e.target.value)} aria-label="الاسم على الطاولة" /><Btn tone="primary" busy={busy} disabled={!name.trim() || name.trim() === p.display_name} onClick={() => void save({ display_name: name })}>احفظ</Btn></div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="الصورة">
          {Object.keys(AVATARS).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={p.avatar === k} onClick={() => void save({ avatar: k })} className={`rounded-full p-0.5 ${p.avatar === k ? "ring-2 ring-[var(--q-primary)]" : ""}`}><Avatar avatar={k} size={44} /></button>
          ))}
        </div>
      </section>

      <section className="grid gap-2"><h3 className="text-sm font-extrabold">الخصوصية</h3>
        <Toggle on={p.show_online} onChange={(v) => void save({ show_online: v })} label="أظهر إني متصل" hint="الأصدقاء يشوفون إنك أونلاين وفي أي غرفة" />
        <Toggle on={p.accept_friend_requests} onChange={(v) => void save({ accept_friend_requests: v })} label="أستقبل طلبات الصداقة" />
        <Toggle on={p.accept_invites} onChange={(v) => void save({ accept_invites: v })} label="أستقبل دعوات الغرف" hint="من الأصدقاء بس" />
      </section>

      <section className="grid gap-2"><h3 className="text-sm font-extrabold">عملات الأونلاين</h3>
        <p className="text-xs text-[var(--q-muted)]">عملات اللعب ضد الكمبيوتر ثانية وتبقى على جهازك. عملات الأونلاين يحفظها الخادم ولا أحد يقدر يغيّرها.</p>
        <ul className="grid gap-1">
          {(s.wallet?.history ?? []).slice(0, 6).map((h, i) => (
            <li key={i} className="flex justify-between rounded-lg bg-[var(--q-card)] px-3 py-2 text-sm"><span>{reasonLabel(h.reason)}</span><b dir="ltr" style={{ color: h.delta >= 0 ? "var(--q-ok)" : "var(--q-error)" }}>{h.delta > 0 ? "+" : ""}{h.delta}</b></li>
          ))}
        </ul>
      </section>

      {msg && <Note kind={msg.kind}>{msg.text}</Note>}
      <section className="grid gap-2">
        {openPw ? (
          <form className="grid gap-2" onSubmit={async (e) => { e.preventDefault(); try { await s.setNewPassword(pw); setPw(""); setOpenPw(false); setMsg({ kind: "ok", text: "تغيّرت كلمة المرور" }); } catch (x) { setMsg({ kind: "error", text: (x as Error).message }); } }}>
            <input className={inputCls} dir="ltr" type="password" minLength={8} placeholder="كلمة مرور جديدة" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required /><Btn type="submit" tone="primary">غيّر</Btn>
          </form>
        ) : <Btn tone="ghost" onClick={() => setOpenPw(true)}>تغيير كلمة المرور</Btn>}
        <Btn tone="danger" onClick={() => void s.signOut()}>تسجيل الخروج</Btn>
      </section>
    </div>
  );
}

export function AccountSheet({ open, onClose, theme }: { open: boolean; onClose: () => void; theme: string }) {
  const s = useSession();
  return (
    <Sheet open={open} onClose={onClose} theme={theme} title={s.recovering ? "كلمة مرور جديدة" : s.session ? "حسابي" : "حسابك في قيد"}>
      {!s.configured ? <Note kind="error">الأونلاين مو مفعّل في هذا الموقع بعد (إعدادات Supabase ناقصة).</Note>
        : !s.ready ? <p className="text-sm text-[var(--q-muted)]">لحظة…</p>
        : s.recovering ? <NewPassword />
        : s.session ? <Profile /> : <AuthForms onDone={onClose} />}
    </Sheet>
  );
}
