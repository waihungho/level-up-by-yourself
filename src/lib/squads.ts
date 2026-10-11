import type { SupabaseClient } from "@supabase/supabase-js";
import { getAgentWithDimensions, getAllAgentsWithDimensions, getPlayerAgents } from "./db";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { getAdminSupabase } from "./supabase-admin";
import { SQUAD_SIZE } from "./tactical/constants";
import type { Rng } from "./tactical/rng";
import type { AgentWithDimensions } from "./types";

export interface SquadStats {
  playerId: string;
  wins: number;
  losses: number;
  rating: number;
}

export const DEFAULT_RATING = 1000;
export const ELO_K = 32;
export const MATCH_BAND = 150;
export const MATCH_BAND_MAX = 2000;
export const MAX_SQUAD_BATTLES = 2;

// ---------------------------------------------------------------------------
// Demo-mode stores
// ---------------------------------------------------------------------------
const localSquads = new Map<string, string[]>();
const localStats = new Map<string, SquadStats>();
const localBattles: { attackerPlayerId: string; defenderPlayerId: string; createdAt: string }[] = [];

function reader(): SupabaseClient | null {
  return getSupabase();
}

function writer(): SupabaseClient | null {
  const admin = getAdminSupabase();
  if (!admin && isSupabaseConfigured) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return admin;
}

function todayStartISO(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function totalStats(a: AgentWithDimensions): number {
  return a.dimensions.reduce((s, d) => s + d.value, 0);
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

async function savedSquadIds(playerId: string): Promise<string[] | null> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_squads").select("agent_ids").eq("player_id", playerId).maybeSingle();
    if (error) throw error;
    return data?.agent_ids ?? null;
  }
  return localSquads.get(playerId) ?? null;
}

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
  localSquads.set(playerId, [...agentIds]);
}

export async function getOrBuildSquad(playerId: string): Promise<AgentWithDimensions[] | null> {
  const agents = await getPlayerAgents(playerId);
  const full = (await Promise.all(agents.map((a) => getAgentWithDimensions(a.id)))).filter(
    (a): a is AgentWithDimensions => !!a && a.dimensions.length > 0
  );
  return pickSquad(full, await savedSquadIds(playerId));
}

// ---------------------------------------------------------------------------
// Stats / leaderboard
// ---------------------------------------------------------------------------

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
    const s = localStats.get(id);
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
    rows = [...localStats.values()].sort((a, b) => b.rating - a.rating).slice(0, limit);
  }
  return Promise.all(rows.map(async (r) => ({ ...r, agentIds: (await savedSquadIds(r.playerId)) ?? [] })));
}

// ---------------------------------------------------------------------------
// Matchmaking
// ---------------------------------------------------------------------------

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
  return localBattles
    .filter((b) => b.attackerPlayerId === playerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, n)
    .map((b) => b.defenderPlayerId);
}

async function opponentPool(excludePlayerId: string): Promise<string[]> {
  const sb = reader();
  const counts = new Map<string, number>();
  let saved: string[];
  if (sb) {
    const [{ data: agents, error: e1 }, { data: squads, error: e2 }] = await Promise.all([
      sb.from("levelup_agents").select("player_id"),
      sb.from("levelup_squads").select("player_id"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    for (const a of agents ?? []) counts.set(a.player_id, (counts.get(a.player_id) ?? 0) + 1);
    saved = (squads ?? []).map((s) => s.player_id);
  } else {
    for (const a of await getAllAgentsWithDimensions()) counts.set(a.playerId, (counts.get(a.playerId) ?? 0) + 1);
    saved = [...localSquads.keys()];
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

export async function countSquadBattlesToday(playerId: string): Promise<number> {
  const since = todayStartISO();
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
  return localBattles.filter((b) => b.attackerPlayerId === playerId && b.createdAt >= since).length;
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

  localBattles.push({ attackerPlayerId: input.attackerPlayerId, defenderPlayerId: input.defenderPlayerId, createdAt });
  const w = stats[input.winnerPlayerId];
  const l = stats[loserId];
  localStats.set(w.playerId, { ...w, wins: w.wins + 1, rating: w.rating + delta });
  localStats.set(l.playerId, { ...l, losses: l.losses + 1, rating: l.rating - delta });
  return { ratingDelta: delta };
}
