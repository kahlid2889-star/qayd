import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client. Uses only the PUBLISHABLE key, which is meant to be
 * public: what it may do is decided by row-level security in Supabase, not by
 * hiding the key. The secret key never belongs here (see admin.server.ts).
 *
 * Returns null when the two VITE_ variables are not set, so a build without
 * Supabase keeps working.
 */
let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  cached = url && key ? createClient(url, key) : null;
  return cached;
}
