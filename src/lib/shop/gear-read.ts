import { getSupabase } from "@/lib/supabase";
import { selectAllPages } from "@/lib/supabase-pages";
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

/** Every agent's gear (agents without gear are absent). For whole-population jobs like boss scaling. */
export async function getAllGear(): Promise<Record<string, Gear>> {
  const out: Record<string, Gear> = {};
  const sb = getSupabase();
  if (sb) {
    const rows = await selectAllPages<{ agent_id: string; slot: string; level: number }>((from, to) =>
      sb.from("levelup_agent_gear").select("agent_id, slot, level").order("agent_id").order("slot").range(from, to)
    );
    for (const r of rows) (out[r.agent_id] ??= {})[r.slot as GearSlot] = r.level;
    return out;
  }
  for (const [id, gear] of shopMem.gear) out[id] = { ...gear };
  return out;
}
