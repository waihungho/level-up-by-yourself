import { getAllAgentsWithDimensions, getPlayersByIds, getPvpStatsForAgents } from "./db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { DIMENSIONS } from "./constants";
import type { AgentWithDimensions, PvpStats, RoleCategory } from "./types";

export const RANK_CATEGORIES = ["Physical", "Mental", "Social", "Spiritual", "Technical"] as const;
export type RankCategory = (typeof RANK_CATEGORIES)[number];

export interface RankedAgent {
  id: string;
  playerId: string;
  name: string;
  role: RoleCategory;
  spriteSeed: Record<string, number>;
  totalAbility: number;
  topCategory: RankCategory;
  wallet: string | null;
  pvp: PvpStats;
}

export interface Rankings {
  totalPlayers: number;
  totalAgents: number;
  top: RankedAgent[];
}

const TOP_N = 100;

function dimValues(agent: AgentWithDimensions): Map<number, number> {
  return new Map(agent.dimensions.map((d) => [d.dimensionId, d.value]));
}

function totalAbility(values: Map<number, number>): number {
  return DIMENSIONS.reduce((sum, dim) => sum + (values.get(dim.id) ?? 10), 0);
}

function topCategory(values: Map<number, number>): RankCategory {
  let best: RankCategory = RANK_CATEGORIES[0];
  let bestAvg = -Infinity;
  for (const cat of RANK_CATEGORIES) {
    const dims = DIMENSIONS.filter((d) => d.category === cat);
    const avg = dims.reduce((s, d) => s + (values.get(d.id) ?? 10), 0) / dims.length;
    if (avg > bestAvg) {
      best = cat;
      bestAvg = avg;
    }
  }
  return best;
}

async function countPlayers(fallback: number): Promise<number> {
  const sb = getSupabase();
  if (!sb) return fallback;
  const { count, error } = await sb.from("levelup_players").select("id", { count: "exact", head: true });
  return error ? fallback : count ?? fallback;
}

/** Rankings computed in Postgres (migration 007); null when the function is missing or fails. */
export async function rankingsFromRpc(sb: SupabaseClient): Promise<Rankings | null> {
  const { data, error } = await sb.rpc("levelup_rankings", { p_limit: TOP_N });
  if (error || !data || !Array.isArray((data as Rankings).top)) return null;
  return data as Rankings;
}

/** Top agents by total ability, with owner wallets and PvP records. */
export async function buildRankings(): Promise<Rankings> {
  const sb = getSupabase();
  if (sb) {
    const fromDb = await rankingsFromRpc(sb);
    if (fromDb) return fromDb;
    // Fallback until migration 007 is applied: reads every dimension row (slow).
  }
  const all = await getAllAgentsWithDimensions();
  const scored = all.map((agent) => {
    const values = dimValues(agent);
    return { agent, values, total: totalAbility(values) };
  });
  scored.sort((a, b) => b.total - a.total);
  const top = scored.slice(0, TOP_N);

  const ownerIds = [...new Set(top.map((s) => s.agent.playerId))];
  const [owners, pvp, totalPlayers] = await Promise.all([
    getPlayersByIds(ownerIds),
    getPvpStatsForAgents(top.map((s) => s.agent.id)),
    countPlayers(new Set(all.map((a) => a.playerId)).size),
  ]);
  const wallets = new Map(owners.map((p) => [p.id, p.walletAddress]));

  return {
    totalPlayers,
    totalAgents: all.length,
    top: top.map(({ agent, values, total }) => ({
      id: agent.id,
      playerId: agent.playerId,
      name: agent.name,
      role: agent.role,
      spriteSeed: agent.spriteSeed as Record<string, number>,
      totalAbility: total,
      topCategory: topCategory(values),
      wallet: wallets.get(agent.playerId) ?? null,
      pvp: pvp[agent.id],
    })),
  };
}
