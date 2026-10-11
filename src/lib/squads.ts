import { getAgentWithDimensions, getAllAgentsWithDimensions, getPlayerAgents } from "./db";
import { getSupabase } from "./supabase";
import { selectAllPages } from "./supabase-pages";
import { getWriteClient } from "./supabase-admin";
import { getRecentSquadOpponents, getSquadStats, savedSquadIds, squadMem } from "./squads-read";

export * from "./squads-read";

const reader = getSupabase;
const writer = getWriteClient;
import { SQUAD_SIZE } from "./tactical/constants";
import type { Rng } from "./tactical/rng";
import type { AgentWithDimensions } from "./types";

export const ELO_K = 32;
export const MATCH_BAND = 150;
export const MATCH_BAND_MAX = 2000;
export const MAX_SQUAD_BATTLES = 2;

export function totalStats(a: AgentWithDimensions): number {
  return a.dimensions.reduce((s, d) => s + d.value, 0);
}

/** All of a player's agents with dimensions loaded (agents without dimensions are dropped). */
export async function loadFullAgents(playerId: string): Promise<AgentWithDimensions[]> {
  const agents = await getPlayerAgents(playerId);
  return (await Promise.all(agents.map((a) => getAgentWithDimensions(a.id)))).filter(
    (a): a is AgentWithDimensions => !!a && a.dimensions.length > 0
  );
}

/** The player's single strongest agent (solo raids, rewards for players without a squad). */
export async function strongestAgent(playerId: string): Promise<AgentWithDimensions | null> {
  return (await loadFullAgents(playerId)).sort((a, b) => totalStats(b) - totalStats(a))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Saved squad if every agent is still owned, else the top 3 by total stats; null if < 3 agents. */
export function pickSquad(owned: AgentWithDimensions[], savedIds: string[] | null): AgentWithDimensions[] | null {
  if (owned.length < SQUAD_SIZE) return null;
  if (savedIds && savedIds.length === SQUAD_SIZE) {
    const saved = savedIds.map((id) => owned.find((a) => a.id === id));
    if (saved.every(Boolean)) return saved as AgentWithDimensions[];
  }
  return [...owned].sort((a, b) => totalStats(b) - totalStats(a)).slice(0, SQUAD_SIZE);
}

export function eloDelta(winnerRating: number, loserRating: number): number {
  const expected = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
  return Math.max(1, Math.round(ELO_K * (1 - expected)));
}

/** Random candidate within ±150 rating (widening by 150), avoiding recent opponents when possible. */
export function chooseOpponent(
  candidates: { playerId: string; rating: number }[],
  rating: number,
  recent: string[],
  rng: Rng
): string | null {
  if (!candidates.length) return null;
  for (let band = MATCH_BAND; band <= MATCH_BAND_MAX; band += MATCH_BAND) {
    const inBand = candidates.filter((c) => Math.abs(c.rating - rating) <= band);
    if (!inBand.length) continue;
    const fresh = inBand.filter((c) => !recent.includes(c.playerId));
    const pool = fresh.length ? fresh : inBand;
    return pool[Math.floor(rng() * pool.length)].playerId;
  }
  return candidates[Math.floor(rng() * candidates.length)].playerId;
}

// ---------------------------------------------------------------------------
// Squads
// ---------------------------------------------------------------------------

/** Saved squad ids, or null if missing or any agent is no longer owned. */
export async function getSquad(playerId: string): Promise<string[] | null> {
  const ids = await savedSquadIds(playerId);
  if (!ids) return null;
  const owned = new Set((await getPlayerAgents(playerId)).map((a) => a.id));
  return ids.every((id) => owned.has(id)) ? ids : null;
}

export async function saveSquad(playerId: string, agentIds: string[]): Promise<void> {
  const owned = new Set((await getPlayerAgents(playerId)).map((a) => a.id));
  const valid = agentIds.length === SQUAD_SIZE && new Set(agentIds).size === SQUAD_SIZE && agentIds.every((id) => owned.has(id));
  if (!valid) throw new Error("invalid_squad");

  const sb = writer();
  if (sb) {
    const { error } = await sb
      .from("levelup_squads")
      .upsert({ player_id: playerId, agent_ids: agentIds, updated_at: new Date().toISOString() }, { onConflict: "player_id" });
    if (error) throw error;
    return;
  }
  squadMem.squads.set(playerId, [...agentIds]);
}

export async function getOrBuildSquad(playerId: string): Promise<AgentWithDimensions[] | null> {
  return pickSquad(await loadFullAgents(playerId), await savedSquadIds(playerId));
}

// ---------------------------------------------------------------------------
// Stats / leaderboard
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Matchmaking
// ---------------------------------------------------------------------------

async function opponentPool(excludePlayerId: string): Promise<string[]> {
  const sb = reader();
  const counts = new Map<string, number>();
  let saved: string[];
  if (sb) {
    const [agents, squads] = await Promise.all([
      selectAllPages<{ player_id: string }>((from, to) => sb.from("levelup_agents").select("player_id").order("id").range(from, to)),
      selectAllPages<{ player_id: string }>((from, to) => sb.from("levelup_squads").select("player_id").order("player_id").range(from, to)),
    ]);
    for (const a of agents) counts.set(a.player_id, (counts.get(a.player_id) ?? 0) + 1);
    saved = squads.map((s) => s.player_id);
  } else {
    for (const a of await getAllAgentsWithDimensions()) counts.set(a.playerId, (counts.get(a.playerId) ?? 0) + 1);
    saved = [...squadMem.squads.keys()];
  }
  const pool = new Set<string>(saved);
  for (const [id, n] of counts) if (n >= SQUAD_SIZE) pool.add(id);
  pool.delete(excludePlayerId);
  return [...pool];
}

export async function findSquadOpponent(playerId: string, rating: number, rng: Rng, exclude: string[] = []): Promise<string | null> {
  const pool = (await opponentPool(playerId)).filter((id) => !exclude.includes(id));
  if (!pool.length) return null;
  const stats = await getSquadStats(pool);
  const recent = await getRecentSquadOpponents(playerId, 3);
  return chooseOpponent(pool.map((id) => ({ playerId: id, rating: stats[id].rating })), rating, recent, rng);
}

export async function recordSquadBattle(input: {
  attackerPlayerId: string;
  defenderPlayerId: string;
  winnerPlayerId: string;
  attackerSquad: string[];
  defenderSquad: string[];
  rounds: unknown[];
  manualActions: number;
  /** When the battle started (defaults to now) so it counts on the day it was fought. */
  createdAt?: string;
}): Promise<{ ratingDelta: number }> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const loserId = input.winnerPlayerId === input.attackerPlayerId ? input.defenderPlayerId : input.attackerPlayerId;
  const stats = await getSquadStats([input.winnerPlayerId, loserId]);
  const delta = eloDelta(stats[input.winnerPlayerId].rating, stats[loserId].rating);

  const sb = writer();
  if (sb) {
    const { error } = await sb.from("levelup_squad_battles").insert({
      attacker_player_id: input.attackerPlayerId,
      defender_player_id: input.defenderPlayerId,
      winner_player_id: input.winnerPlayerId,
      attacker_squad: input.attackerSquad,
      defender_squad: input.defenderSquad,
      rounds: input.rounds,
      rating_delta: delta,
      manual_actions: input.manualActions,
      created_at: createdAt,
    });
    if (error) throw error;
    const { error: rpcError } = await sb.rpc("levelup_squad_apply_result", {
      p_winner: input.winnerPlayerId,
      p_loser: loserId,
      p_delta: delta,
    });
    if (rpcError) throw rpcError;
    return { ratingDelta: delta };
  }

  squadMem.battles.push({ attackerPlayerId: input.attackerPlayerId, defenderPlayerId: input.defenderPlayerId, createdAt });
  const w = stats[input.winnerPlayerId];
  const l = stats[loserId];
  squadMem.stats.set(w.playerId, { ...w, wins: w.wins + 1, rating: w.rating + delta });
  squadMem.stats.set(l.playerId, { ...l, losses: l.losses + 1, rating: l.rating - delta });
  return { ratingDelta: delta };
}
