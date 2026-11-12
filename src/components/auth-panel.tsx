import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { authOptions } from "@/lib/auth/options";

/**
 * Sign-in / sign-up for Qayd. Players only pick a username and a password; the account
 * email is derived from the username (it is never shown), so the old accounts keep working.
 */
export function loginToEmail(raw: string) {
  const t = raw.trim().toLowerCase();
  if (t.includes("@")) return t;
  if (/^[a-z0-9._-]{3,40}$/.test(t)) return `${t}@qayd.game`;
  const bytes = new TextEncoder().encode(t);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  const b64 = btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `u.${b64}@qayd.game`;
}

/** 3–20 letters (Arabic or English), digits, dot or underscore. No spaces. */
export function usernameProblem(raw: string): string {
  const u = raw.trim();
  if (u.length < 3) return "اسم المستخدم ٣ أحرف على الأقل";
  if (u.length > 20) return "اسم المستخدم ٢٠ حرف كحد أقصى";
  if (/\s/.test(u)) return "بدون مسافات";
  if (!/^[\p{L}\p{N}_.]+$/u.test(u)) return "حروف وأرقام و _ و . فقط";
  return "";
}

/** Better Auth errors, in the player's words. Never blame the password for a server problem. */
function explain(err: { code?: string; message?: string; status?: number } | null | undefined, mode: "in" | "up"): string {
  const code = err?.code ?? "", msg = err?.message ?? "";
  if (/USER_ALREADY_EXISTS/.test(code) || /already exists/i.test(msg)) return "اسم المستخدم مأخوذ. اختر اسم ثاني، أو ادخل إذا هو حسابك.";
  if (code === "INVALID_EMAIL_OR_PASSWORD" || /invalid email or password/i.test(msg)) return "اسم المستخدم أو كلمة السر غلط.";
  if (code === "PASSWORD_TOO_SHORT") return "كلمة السر ٨ أحرف على الأقل.";
  if (code === "PASSWORD_TOO_LONG") return "كلمة السر طويلة مرة.";
  if (code === "INVALID_ORIGIN" || /origin/i.test(msg)) return "إعداد الموقع ناقص، فالخادم رفض الطلب. مو خطأ منك.";
  if (err?.status === 429) return "محاولات كثيرة. انتظر دقيقة وجرّب.";
  if (!err) return "";
  return mode === "up" ? "ما قدرنا نسوي الحساب. جرّب بعد شوي." : "ما قدرنا ندخلك. جرّب بعد شوي.";
}

const input = "min-h-12 w-full rounded-xl border border-[var(--q-line)] bg-[var(--q-input)] px-3 text-base text-[var(--q-ink)] outline-none focus:border-[var(--q-primary)]";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function AuthPanel({ onDone }: { onDone?: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("up");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [google, setGoogle] = useState(false);

  useEffect(() => { void authOptions().then((o) => setGoogle(o.google)).catch(() => setGoogle(false)); }, []);

  const userErr = username ? usernameProblem(username) : "";
  const passErr = password && password.length < 8 ? "كلمة السر ٨ أحرف على الأقل" : "";
  const confirmErr = mode === "up" && confirm && confirm !== password ? "كلمتا السر ما تتطابق" : "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const u = usernameProblem(username);
    if (u) return setError(u);
    if (password.length < 8) return setError("كلمة السر ٨ أحرف على الأقل");
    if (mode === "up" && confirm !== password) return setError("كلمتا السر ما تتطابق");
    setBusy(true);
    const email = loginToEmail(username);
    try {
      try { if (mode === "up") sessionStorage.setItem("qayd-convert", "1"); else sessionStorage.removeItem("qayd-convert"); } catch { /* private mode */ }
      const res = mode === "up"
        ? await authClient.signUp.email({ email, password, name: username.trim().slice(0, 14) })
        : await authClient.signIn.email({ email, password });
      if (res.error) { setError(explain(res.error, mode)); return; }
      onDone?.();
    } catch {
      setError("ما فيه اتصال. جرّب بعد شوي.");
    } finally {
      setBusy(false);
    }
  }

  async function withGoogle() {
    setError(""); setBusy(true);
    try {
      const res = await authClient.signIn.social({ provider: "google", callbackURL: location.pathname || "/" });
      if (res?.error) setError(explain(res.error, "in"));
    } catch {
      setError("ما قدرنا نفتح Google. جرّب بعد شوي.");
    } finally {
      setBusy(false);
    }
  }

  const switchTo = (m: "in" | "up") => { setMode(m); setError(""); setConfirm(""); };

  return (
    <div className="grid gap-4" dir="rtl">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-[var(--q-card)] p-1">
        {(["up", "in"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchTo(m)}
            className={`min-h-11 rounded-xl text-sm font-bold ${mode === m ? "bg-[var(--q-surface)] text-[var(--q-primary)] shadow" : "text-[var(--q-muted)]"}`}>
            {m === "up" ? "حساب جديد" : "تسجيل الدخول"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="grid gap-3" noValidate>
        <div className="grid gap-1 text-sm">
          <label htmlFor="qa-user" className="font-bold">اسم المستخدم</label>
          <input id="qa-user" className={input} value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20}
            autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={!!userErr} />
          <span className={`text-xs ${userErr ? "text-[var(--q-error)]" : "text-[var(--q-muted)]"}`}>{userErr || (mode === "up" ? "يظهر لخوياك على الطاولة، ويلقونك فيه" : " ")}</span>
        </div>

        <div className="grid gap-1 text-sm">
          <label htmlFor="qa-pass" className="font-bold">كلمة السر</label>
          <div className="relative">
            <input id="qa-pass" className={`${input} pl-16`} type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "up" ? "new-password" : "current-password"} dir="ltr" aria-invalid={!!passErr} />
            <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 left-0 min-w-14 px-3 text-xs text-[var(--q-muted)]" aria-label={show ? "إخفاء كلمة السر" : "إظهار كلمة السر"}>{show ? "إخفاء" : "إظهار"}</button>
          </div>
          {passErr && <span className="text-xs text-[var(--q-error)]">{passErr}</span>}
        </div>

        {mode === "up" && (
          <div className="grid gap-1 text-sm">
            <label htmlFor="qa-confirm" className="font-bold">تأكيد كلمة السر</label>
            <input id="qa-confirm" className={input} type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" dir="ltr" aria-invalid={!!confirmErr} />
            {confirmErr && <span className="text-xs text-[var(--q-error)]">{confirmErr}</span>}
          </div>
        )}

        {error && <p role="alert" className="rounded-xl border border-[var(--q-error)] px-3 py-2 text-sm text-[var(--q-error)]">{error}</p>}

        <button type="submit" disabled={busy} className="min-h-12 rounded-xl bg-[var(--q-primary)] text-base font-bold text-[var(--q-primary-ink)] disabled:opacity-60">
          {busy ? "لحظة…" : mode === "up" ? "سوِّ الحساب" : "ادخل"}
        </button>
      </form>

      {google && (
        <>
          <div className="flex items-center gap-3 text-xs text-[var(--q-muted)]"><i className="h-px flex-1 bg-[var(--q-line)]" />أو<i className="h-px flex-1 bg-[var(--q-line)]" /></div>
          <button type="button" onClick={() => void withGoogle()} disabled={busy}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--q-line)] bg-white text-sm font-bold text-[#1f1f1f] disabled:opacity-60">
            <GoogleMark /> المتابعة بحساب Google
          </button>
        </>
      )}

      <p className="text-center text-xs text-[var(--q-muted)]">
        {mode === "up" ? "عندك حساب؟ " : "ما عندك حساب؟ "}
        <button type="button" className="min-h-11 font-bold text-[var(--q-primary)] underline" onClick={() => switchTo(mode === "up" ? "in" : "up")}>{mode === "up" ? "سجّل دخولك" : "سوِّ حساب جديد"}</button>
      </p>
    </div>
  );
}
