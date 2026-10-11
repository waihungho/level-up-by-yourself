import { getSupabase } from "./supabase";
import { utcDayStartISO } from "./time";

/*
 * Read-only squad queries (public anon client). Safe to import from client components;
 * writes live in squads.ts, which needs the service-role client.
 */

export interface SquadStats {
  playerId: string;
  wins: number;
  losses: number;
  rating: number;
}

export const DEFAULT_RATING = 1000;

/** Demo-mode stores shared with squads.ts writes. */
export const squadMem = {
  squads: new Map<string, string[]>(),
  stats: new Map<string, SquadStats>(),
  battles: [] as { attackerPlayerId: string; defenderPlayerId: string; createdAt: string }[],
};

const reader = getSupabase;

export async function savedSquadIds(playerId: string): Promise<string[] | null> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_squads").select("agent_ids").eq("player_id", playerId).maybeSingle();
    if (error) throw error;
    return data?.agent_ids ?? null;
  }
  return squadMem.squads.get(playerId) ?? null;
}

export async function getSquadStats(playerIds: string[]): Promise<Record<string, SquadStats>> {
  const out: Record<string, SquadStats> = {};
  for (const id of playerIds) out[id] = { playerId: id, wins: 0, losses: 0, rating: DEFAULT_RATING };
  if (!playerIds.length) return out;

  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_squad_stats").select("*").in("player_id", playerIds);
    if (error) throw error;
    for (const r of data ?? []) out[r.player_id] = { playerId: r.player_id, wins: r.wins, losses: r.losses, rating: r.rating };
    return out;
  }
  for (const id of playerIds) {
    const s = squadMem.stats.get(id);
    if (s) out[id] = { ...s };
  }
  return out;
}

export async function getSquadLeaderboard(limit = 20): Promise<(SquadStats & { agentIds: string[] })[]> {
  const sb = reader();
  let rows: SquadStats[];
  if (sb) {
    const { data, error } = await sb.from("levelup_squad_stats").select("*").order("rating", { ascending: false }).limit(limit);
    if (error) throw error;
    rows = (data ?? []).map((r) => ({ playerId: r.player_id, wins: r.wins, losses: r.losses, rating: r.rating }));
  } else {
    rows = [...squadMem.stats.values()].sort((a, b) => b.rating - a.rating).slice(0, limit);
  }
  const squads = new Map<string, string[]>();
  if (sb && rows.length) {
    const { data, error } = await sb
      .from("levelup_squads")
      .select("player_id,agent_ids")
      .in("player_id", rows.map((r) => r.playerId));
    if (error) throw error;
    for (const s of data ?? []) squads.set(s.player_id, s.agent_ids);
  } else if (!sb) {
    for (const r of rows) squads.set(r.playerId, squadMem.squads.get(r.playerId) ?? []);
  }
  return rows.map((r) => ({ ...r, agentIds: squads.get(r.playerId) ?? [] }));
}

export async function getRecentSquadOpponents(playerId: string, n: number): Promise<string[]> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_squad_battles")
      .select("defender_player_id")
      .eq("attacker_player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(n);
    if (error) throw error;
    return (data ?? []).map((r) => r.defender_player_id);
  }
  return squadMem.battles
    .filter((b) => b.attackerPlayerId === playerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, n)
    .map((b) => b.defenderPlayerId);
}

export async function countSquadBattlesToday(playerId: string): Promise<number> {
  const since = utcDayStartISO();
  const sb = reader();
  if (sb) {
    const { count, error } = await sb
      .from("levelup_squad_battles")
      .select("id", { count: "exact", head: true })
      .eq("attacker_player_id", playerId)
      .gte("created_at", since);
    if (error) throw error;
    return count ?? 0;
  }
  return squadMem.battles.filter((b) => b.attackerPlayerId === playerId && b.createdAt >= since).length;
}

