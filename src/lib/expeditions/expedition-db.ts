import { getWriteClient } from "@/lib/supabase-admin";
import { applyGems, getGemBalance } from "@/lib/shop/gems";
import { addAttemptBonus, applyGrowthAtomic } from "@/lib/shop/shop-db";
import type { ExpeditionDuration, ExpeditionReward } from "./catalog";

export interface Expedition {
  id: string;
  playerId: string;
  agentId: string;
  durationH: ExpeditionDuration;
  startedAt: string;
  endsAt: string;
  claimedAt: string | null;
  reward: ExpeditionReward;
}

/** What the player sees before claiming: the pre-rolled reward stays on the server. */
export type ExpeditionSummary = Omit<Expedition, "playerId" | "claimedAt" | "reward">;

/** Demo-mode (no Supabase) store; tests reset it with resetExpeditionMemory(). */
export const expeditionMem = { rows: [] as Expedition[] };

export function resetExpeditionMemory(): void {
  expeditionMem.rows = [];
}

interface ExpeditionRow {
  id: string;
  player_id: string;
  agent_id: string;
  duration_h: ExpeditionDuration;
  started_at: string;
  ends_at: string;
  claimed_at: string | null;
  reward: ExpeditionReward;
}

const COLUMNS = "id, player_id, agent_id, duration_h, started_at, ends_at, claimed_at, reward";
const iso = (t: string) => new Date(t).toISOString();

function mapRow(row: ExpeditionRow): Expedition {
  return {
    id: row.id,
    playerId: row.player_id,
    agentId: row.agent_id,
    durationH: row.duration_h,
    startedAt: iso(row.started_at),
    endsAt: iso(row.ends_at),
    claimedAt: row.claimed_at ? iso(row.claimed_at) : null,
    reward: row.reward,
  };
}

/** The player's unclaimed expeditions (running or finished), oldest first. */
export async function getOpenExpeditions(playerId: string): Promise<Expedition[]> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.from("levelup_expeditions").select(COLUMNS).eq("player_id", playerId).is("claimed_at", null).order("started_at");
    if (error) throw error;
    return ((data ?? []) as ExpeditionRow[]).map(mapRow);
  }
  return expeditionMem.rows.filter((e) => e.playerId === playerId && !e.claimedAt).map((e) => ({ ...e }));
}

export type StartResult = { result: "ok"; expedition: Expedition } | { result: "limit" | "agent_away" };

/**
 * Inserts an expedition unless the player already has `max` open ones or the agent is away.
 * One transaction under a per-player lock, so concurrent starts can't overshoot the cap.
 */
export async function startExpeditionTx(input: Omit<Expedition, "id" | "claimedAt" | "endsAt">, max: number): Promise<StartResult> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_start_expedition", {
      p_player: input.playerId,
      p_agent: input.agentId,
      p_duration: input.durationH,
      p_started_at: input.startedAt,
      p_reward: input.reward,
      p_max: max,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { result: StartResult["result"]; expedition: ExpeditionRow | null };
    return row.result === "ok" ? { result: "ok", expedition: mapRow(row.expedition!) } : { result: row.result };
  }

  // Demo mode: no awaits below, so the checks and the insert are atomic in JS.
  const open = expeditionMem.rows.filter((e) => !e.claimedAt);
  if (open.filter((e) => e.playerId === input.playerId).length >= max) return { result: "limit" };
  if (open.some((e) => e.agentId === input.agentId)) return { result: "agent_away" };
  const endsAt = new Date(Date.parse(input.startedAt) + input.durationH * 3_600_000).toISOString();
  const row: Expedition = { ...input, id: crypto.randomUUID(), endsAt, claimedAt: null };
  expeditionMem.rows.push(row);
  return { result: "ok", expedition: { ...row } };
}

export type ClaimResult =
  | { result: "ok"; expedition: Expedition; balance: number; gemsGranted: number }
  | { result: "already_claimed" | "not_ready"; expedition: Expedition }
  | { result: "not_found" | "not_owner" };

/**
 * Claims a finished expedition and grants its growth, gems (ref `exp:<id>`) and raid ticket in one
 * transaction: either the claim and every grant happen, or nothing does.
 */
export async function claimExpeditionTx(id: string, playerId: string, now: Date): Promise<ClaimResult> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_claim_expedition", { p_id: id, p_player: playerId, p_now: now.toISOString() });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { result: ClaimResult["result"]; expedition: ExpeditionRow | null; balance: number | null; gems_granted: number | null };
    switch (row.result) {
      case "ok":
        return { result: "ok", expedition: mapRow(row.expedition!), balance: Number(row.balance ?? 0), gemsGranted: Number(row.gems_granted ?? 0) };
      case "already_claimed":
      case "not_ready":
        return { result: row.result, expedition: mapRow(row.expedition!) };
      default:
        return { result: row.result };
    }
  }

  // Demo mode: the claim is marked synchronously (exactly one caller wins), and undone if a grant
  // throws, which stands in for the transaction rollback. Growth goes first: the in-memory gem and
  // ticket writes can't fail for a positive credit, so a failure never leaves a partial grant.
  const row = expeditionMem.rows.find((e) => e.id === id);
  if (!row) return { result: "not_found" };
  if (row.playerId !== playerId) return { result: "not_owner" };
  if (row.claimedAt) return { result: "already_claimed", expedition: { ...row } };
  if (row.endsAt > now.toISOString()) return { result: "not_ready", expedition: { ...row } };
  row.claimedAt = now.toISOString();
  try {
    await applyGrowthAtomic(row.agentId, row.reward.growth);
    const gems = row.reward.gems > 0 ? await applyGems({ playerId, delta: row.reward.gems, reason: "expedition", ref: `exp:${id}` }) : null;
    if (row.reward.ticket) await addAttemptBonus({ playerId, agentId: null, mode: "raid", extra: 1 });
    return {
      result: "ok",
      expedition: { ...row },
      balance: gems?.balance ?? (await getGemBalance(playerId)),
      gemsGranted: gems?.applied ? row.reward.gems : 0,
    };
  } catch (e) {
    row.claimedAt = null;
    throw e;
  }
}
