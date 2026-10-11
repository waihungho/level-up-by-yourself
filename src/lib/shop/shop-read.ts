import { getSupabase } from "@/lib/supabase";
import { shopMem } from "./shop-memory";

/*
 * Public cosmetic reads (anon client) — safe to import from client components.
 */

export type CosmeticKind = "aura" | "namecolor";
export type Cosmetics = Partial<Record<CosmeticKind, string>>;

/** agentId → { aura?, namecolor? } for agents that have any cosmetic. */
export async function getCosmetics(agentIds: string[]): Promise<Record<string, Cosmetics>> {
  const out: Record<string, Cosmetics> = {};
  if (!agentIds.length) return out;
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from("levelup_agent_cosmetics").select("agent_id, kind, value").in("agent_id", agentIds);
    if (error) return out;
    for (const r of data ?? []) (out[r.agent_id] ??= {})[r.kind as CosmeticKind] = r.value;
    return out;
  }
  for (const id of agentIds) {
    const c = shopMem.cosmetics.get(id);
    if (c) out[id] = { ...c };
  }
  return out;
}

/** playerId → title id for players that have one. */
export async function getTitles(playerIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!playerIds.length) return out;
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from("levelup_player_titles").select("player_id, title").in("player_id", playerIds);
    if (error) return out;
    for (const r of data ?? []) out[r.player_id] = r.title;
    return out;
  }
  for (const id of playerIds) {
    const t = shopMem.titles.get(id);
    if (t) out[id] = t;
  }
  return out;
}
