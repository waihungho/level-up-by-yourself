import { getSupabase } from "@/lib/supabase";
import type { Gear, GearSlot } from "./catalog";
import { shopMem } from "./shop-memory";

/** agentId → gear levels (empty object when the agent has none). Public read; safe in client components. */
export async function getGearForAgents(agentIds: string[]): Promise<Record<string, Gear>> {
  const out: Record<string, Gear> = Object.fromEntries(agentIds.map((id) => [id, {}]));
  if (!agentIds.length) return out;
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from("levelup_agent_gear").select("agent_id, slot, level").in("agent_id", agentIds);
    if (error) return out;
    for (const r of data ?? []) out[r.agent_id][r.slot as GearSlot] = r.level;
    return out;
  }
  for (const id of agentIds) out[id] = { ...(shopMem.gear.get(id) ?? {}) };
  return out;
}
