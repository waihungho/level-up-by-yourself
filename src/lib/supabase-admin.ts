import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

/**
 * Service-role client for server routes only. The key has no NEXT_PUBLIC_
 * prefix so it is never bundled for the browser. Returns null when unset.
 */
export function getAdminSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!_admin) {
    _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _admin;
}

/**
 * Client for server-side writes: the service-role client when configured, null in demo mode
 * (callers then use in-memory stores). Throws if Supabase is configured without the service key.
 */
export function getWriteClient(): SupabaseClient | null {
  const admin = getAdminSupabase();
  if (!admin && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return admin;
}
