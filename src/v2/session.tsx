import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./supabase";
import { api, type Profile, type Wallet } from "./api";

type Ctx = {
  configured: boolean; ready: boolean; session: Session | null; profile: Profile | null; wallet: Wallet | null;
  recovering: boolean; refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (a: { email: string; password: string; username: string; displayName: string }) => Promise<"signed-in" | "confirm-email">;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  setNewPassword: (password: string) => Promise<void>;
};
const C = createContext<Ctx | null>(null);
export const useSession = () => { const v = useContext(C); if (!v) throw new Error("useSession outside SessionProvider"); return v; };

/** Auth errors, in the player's words. */
export function authMessage(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e);
  if (/invalid login credentials/i.test(m)) return "الإيميل أو كلمة المرور غلط";
  if (/already registered|already been registered/i.test(m)) return "هذا الإيميل مسجّل. جرّب تسجيل الدخول";
  if (/password should be at least|weak/i.test(m)) return "كلمة المرور ضعيفة. استخدم ٨ أحرف على الأقل";
  if (/email.*(invalid|format)|unable to validate email/i.test(m)) return "الإيميل غير صالح";
  if (/rate limit|too many/i.test(m)) return "محاولات كثيرة. انتظر شوي وجرّب";
  if (/not confirmed/i.test(m)) return "فعّل إيميلك أول من الرسالة اللي وصلتك";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "ما فيه اتصال. جرّب بعد شوي";
  return m;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [recovering, setRecovering] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, w] = await Promise.all([api.myProfile(), api.wallet()]);
      setProfile(p); setWallet(w);
    } catch { /* signed out meanwhile */ }
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const sb = supabase();
    let alive = true;
    void sb.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setReady(true); } });
    const { data: sub } = sb.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") { setProfile(null); setWallet(null); }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { if (session?.user.id) void refresh(); }, [session?.user.id, refresh]);

  const value = useMemo<Ctx>(() => ({
    configured: supabaseConfigured, ready, session, profile, wallet, recovering, refresh,
    async signIn(email, password) {
      const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(authMessage(error));
    },
    async signUp({ email, password, username, displayName }) {
      const { data, error } = await supabase().auth.signUp({ email: email.trim(), password, options: { data: { username: username.trim().toLowerCase(), display_name: displayName.trim() } } });
      if (error) throw new Error(authMessage(error));
      return data.session ? "signed-in" : "confirm-email";
    },
    async signOut() { await supabase().auth.signOut(); },
    async resetPassword(email) {
      const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/v2` });
      if (error) throw new Error(authMessage(error));
    },
    async setNewPassword(password) {
      const { error } = await supabase().auth.updateUser({ password });
      if (error) throw new Error(authMessage(error));
      setRecovering(false);
    },
  }), [ready, session, profile, wallet, recovering, refresh]);

  return <C.Provider value={value}>{children}</C.Provider>;
}
