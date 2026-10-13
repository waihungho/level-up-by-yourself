import { getSupabase } from "@/lib/supabase";
import type { NftMint } from "./eligibility";

/** The agent's live mint (confirmed, else the newest pending), or null. Public read; client-safe. */
export async function getNftMint(agentId: string): Promise<NftMint | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("levelup_nft_mints")
    .select("agent_id, asset_address, status, created_at, tx_signature")
    .eq("agent_id", agentId)
    .in("status", ["pending", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    agentId: data.agent_id,
    assetAddress: data.asset_address,
    status: data.status,
    createdAt: data.created_at,
    txSignature: data.tx_signature,
  };
}
