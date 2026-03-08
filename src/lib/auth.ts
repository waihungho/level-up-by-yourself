import { getSupabase, isSupabaseConfigured } from "./supabase";

export async function signInWithSolana(publicKey: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  const supabase = getSupabase();
  if (!supabase) return;

  // For simplicity, use wallet address as identifier
  // Upsert player by wallet address (creates if not exists)
  await supabase.from("players").upsert(
    { wallet_address: publicKey },
    { onConflict: "wallet_address" }
  );
}
