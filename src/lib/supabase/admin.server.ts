import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client with the SECRET key. It bypasses row-level
 * security, so use it only inside createServerFn handlers and server routes,
 * never in code the browser loads. The `.server.ts` suffix keeps it out of the
 * client bundle; the guard below fails loudly if that ever breaks.
 *
 * Reads SUPABASE_URL and SUPABASE_SECRET_KEY from the server environment
 * (Vercel project settings, or a git-ignored .env locally). Neither value is
 * stored in the repository.
 */
let cached: SupabaseClient | undefined;

export function getSupabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("getSupabaseAdmin() is server-only and must not run in the browser.");
  }
  if (cached) return cached;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    throw new Error("Supabase is not configured: set SUPABASE_URL and SUPABASE_SECRET_KEY.");
  }
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
