import { getWriteClient } from "@/lib/supabase-admin";
import type { AgentWithDimensions } from "@/lib/types";
import type { GearSlot } from "./catalog";
import { getGearForAgents } from "./gear-read";
import { shopMem } from "./shop-memory";

export { getGearForAgents } from "./gear-read";

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

/** Fighters with their gear attached (one batched read) so toSide can apply battle bonuses. */
export async function withGear<T extends AgentWithDimensions>(agents: T[]): Promise<T[]> {
  const gear = await getGearForAgents(agents.map((a) => a.id));
  return agents.map((a) => ({ ...a, gear: gear[a.id] ?? {} }));
}
