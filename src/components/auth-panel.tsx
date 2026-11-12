import { useState, type FormEvent } from "react";
import { authClient, GROK_PROVIDERS, signIn, socialLoginEnabled } from "@/lib/auth/client";

export function loginToEmail(raw: string) {
  const t = raw.trim().toLowerCase();
  if (t.includes("@")) return t;
  if (/^[a-z0-9._-]{3,40}$/.test(t)) return `${t}@qayd.game`;
  const bytes = new TextEncoder().encode(t);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  const b64 = btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `u.${b64}@qayd.game`;
}

export function AuthPanel({ onDone }: { onDone?: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("up");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [display, setDisplay] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("كلمة المرور ٨ أحرف على الأقل.");
      return;
    }
    if (login.trim().length < 2) {
      setError("اكتب اسم الدخول.");
      return;
    }
    setBusy(true);
    const email = loginToEmail(login);
    const name = (display || login).trim().slice(0, 14);
    try {
      if (mode === "up") sessionStorage.setItem("qayd-convert", "1");
      else sessionStorage.removeItem("qayd-convert");
    } catch {
      /* private mode */
    }
    const res =
      mode === "up"
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      const msg = res.error.message || "";
      setError(
        /exist|already/i.test(msg)
          ? "اسم الدخول مستخدم. ادخل بدل ما تسجّل."
          : /invalid|password|credential/i.test(msg)
            ? "اسم الدخول أو كلمة المرور غير صحيحة."
            : "ما قدرنا نفتح الحساب. جرّب مرة ثانية.",
      );
      return;
    }
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <label className="grid gap-1 text-sm">
        اسم الدخول
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          className="min-h-12 rounded-xl border border-[var(--q-line)] bg-[var(--q-input)] text-[var(--q-ink)] px-3 text-base"
        />
      </label>
      {mode === "up" ? (
        <label className="grid gap-1 text-sm">
          الاسم على الطاولة
          <input
            value={display}
            onChange={(e) => setDisplay(e.target.value)}
            maxLength={14}
            className="min-h-12 rounded-xl border border-[var(--q-line)] bg-[var(--q-input)] text-[var(--q-ink)] px-3 text-base"
          />
        </label>
      ) : null}
      <label className="grid gap-1 text-sm">
        كلمة المرور
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "up" ? "new-password" : "current-password"}
          className="min-h-12 rounded-xl border border-[var(--q-line)] bg-[var(--q-input)] text-[var(--q-ink)] px-3 text-base"
        />
      </label>
      {error ? <p className="text-sm text-[var(--q-error)]">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="min-h-12 rounded-xl bg-[var(--q-primary)] text-[var(--q-primary-ink)] disabled:opacity-60"
      >
        {busy ? "لحظة…" : mode === "up" ? "إنشاء الحساب" : "دخول"}
      </button>
      <button
        type="button"
        className="min-h-11 text-sm underline"
        onClick={() => {
          setMode(mode === "up" ? "in" : "up");
          setError("");
        }}
      >
        {mode === "up" ? "عندي حساب — دخول" : "حساب جديد"}
      </button>
      <div className="grid gap-2">
        {(socialLoginEnabled ? GROK_PROVIDERS : []).map((p) => (
          <button
            key={p.providerId}
            type="button"
            onClick={() => signIn(p.providerId, { callbackURL: "/" })}
            className="min-h-11 rounded-xl border border-[var(--q-ink)]/20 bg-[var(--q-input)] text-[var(--q-ink)] text-sm"
          >
            المتابعة عبر {p.label}
          </button>
        ))}
      </div>
      <p className="text-xs leading-5 text-[var(--q-ink)]/70">
        اسمك وعملك ورتبتك وخياراتك تنحفظ تلقائيًا على الحساب، وترجع لك على أي جهاز تدخل منه.
      </p>
    </form>
  );
}
