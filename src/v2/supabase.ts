import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The v2 app talks to Supabase straight from the browser, with the PUBLISHABLE key only.
 * What a player may read or change is decided by row-level security and the RPC functions in
 * supabase/migrations — never by hiding the key. The secret key never reaches this bundle.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();

export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).");
  client ??= createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "qayd-v2-auth" },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}
