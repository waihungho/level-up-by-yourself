import { getWriteClient } from "@/lib/supabase-admin";
import type { AgentWithDimensions } from "@/lib/types";
import type { GearSlot } from "./catalog";
import { getGearForAgents } from "./gear-read";
import { getCosmetics } from "./shop-read";
import { shopMem } from "./shop-memory";

/** One slot's level, read with the service role; throws on error (never guesses 0 when pricing an upgrade). */
export async function readGearLevel(agentId: string, slot: GearSlot): Promise<number> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.from("levelup_agent_gear").select("level").eq("agent_id", agentId).eq("slot", slot).maybeSingle();
    if (error) throw error;
    return data?.level ?? 0;
  }
  return shopMem.gear.get(agentId)?.[slot] ?? 0;
}

/** Raises a slot from `expectedLevel` to expectedLevel + 1; false if the level changed meanwhile. */
export async function upgradeGearLevel(agentId: string, slot: GearSlot, expectedLevel: number): Promise<boolean> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_gear_upgrade", { p_agent: agentId, p_slot: slot, p_expected: expectedLevel });
    if (error) throw error;
    return data === true;
  }
  const gear = shopMem.gear.get(agentId) ?? {};
  if ((gear[slot] ?? 0) !== expectedLevel) return false;
  shopMem.gear.set(agentId, { ...gear, [slot]: expectedLevel + 1 });
  return true;
}

/** Fighters with their gear (battle bonuses) and aura (battle visuals) attached, in two batched reads. */
export async function withGear<T extends AgentWithDimensions>(agents: T[]): Promise<T[]> {
  const ids = agents.map((a) => a.id);
  const [gear, cosmetics] = await Promise.all([getGearForAgents(ids), getCosmetics(ids)]);
  return agents.map((a) => ({ ...a, gear: gear[a.id] ?? {}, ...(cosmetics[a.id]?.aura ? { aura: cosmetics[a.id].aura } : {}) }));
}
