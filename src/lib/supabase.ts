import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;
let _currentWallet: string | null = null;

export const isSupabaseConfigured = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

/**
 * Set the wallet address for RLS policies.
 * Calls set_config('app.wallet_address', ...) so current_setting() works in RLS.
 */
export async function setSupabaseWallet(walletAddress: string) {
  if (_currentWallet === walletAddress) return;
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.rpc("set_wallet_context", { wallet: walletAddress });
  _currentWallet = walletAddress;
}

export function getCurrentWallet() {
  return _currentWallet;
}
