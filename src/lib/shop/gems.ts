import { getWriteClient } from "@/lib/supabase-admin";
import { shopMem } from "./shop-memory";

export { resetShopMemory } from "./shop-memory";

export class InsufficientGemsError extends Error {
  constructor() {
    super("insufficient_gems");
  }
}

export async function getGemBalance(playerId: string): Promise<number> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.from("levelup_gem_wallets").select("balance").eq("player_id", playerId).maybeSingle();
    if (error) throw error;
    return data?.balance ?? 0;
  }
  return shopMem.balances.get(playerId) ?? 0;
}

/**
 * Atomically adds `delta` (negative = spend) and records it under a unique `ref`.
 * A repeated ref is a no-op (applied=false). A spend that would go below zero throws
 * InsufficientGemsError and changes nothing.
 */
export async function applyGems(input: { playerId: string; delta: number; reason: string; ref: string }): Promise<{ balance: number; applied: boolean }> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_gems_apply", {
      p_player: input.playerId,
      p_delta: input.delta,
      p_reason: input.reason,
      p_ref: input.ref,
    });
    if (error) {
      if (error.message?.includes("insufficient_gems")) throw new InsufficientGemsError();
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { balance: Number(row.balance), applied: !!row.applied };
  }

  // Demo mode: synchronous section, so it is atomic in JS.
  const current = shopMem.balances.get(input.playerId) ?? 0;
  if (shopMem.refs.has(input.ref)) return { balance: current, applied: false };
  if (current + input.delta < 0) throw new InsufficientGemsError();
  shopMem.refs.add(input.ref);
  shopMem.balances.set(input.playerId, current + input.delta);
  return { balance: current + input.delta, applied: true };
}
