import { getWriteClient } from "@/lib/supabase-admin";
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

/** Demo-mode (no Supabase) store; tests reset it with resetExpeditionMemory(). */
export const expeditionMem = { rows: [] as Expedition[] };

export function resetExpeditionMemory(): void {
  expeditionMem.rows = [];
}

const COLUMNS = "id, player_id, agent_id, duration_h, started_at, ends_at, claimed_at, reward";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Expedition {
  return {
    id: row.id,
    playerId: row.player_id,
    agentId: row.agent_id,
    durationH: row.duration_h,
    startedAt: new Date(row.started_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : null,
    reward: row.reward,
  };
}

/** The player's unclaimed expeditions (running or finished), oldest first. */
export async function getOpenExpeditions(playerId: string): Promise<Expedition[]> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.from("levelup_expeditions").select(COLUMNS).eq("player_id", playerId).is("claimed_at", null).order("started_at");
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }
  return expeditionMem.rows.filter((e) => e.playerId === playerId && !e.claimedAt).map((e) => ({ ...e }));
}

export async function countOpenExpeditions(playerId: string): Promise<number> {
  const sb = getWriteClient();
  if (sb) {
    const { count, error } = await sb.from("levelup_expeditions").select("id", { count: "exact", head: true }).eq("player_id", playerId).is("claimed_at", null);
    if (error) throw error;
    return count ?? 0;
  }
  return expeditionMem.rows.filter((e) => e.playerId === playerId && !e.claimedAt).length;
}

export async function getExpedition(id: string): Promise<Expedition | null> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.from("levelup_expeditions").select(COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }
  const found = expeditionMem.rows.find((e) => e.id === id);
  return found ? { ...found } : null;
}

/** Inserts a new expedition; null when the agent already has an unclaimed one (unique partial index). */
export async function insertExpedition(input: Omit<Expedition, "id" | "claimedAt">): Promise<Expedition | null> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_expeditions")
      .insert({
        player_id: input.playerId,
        agent_id: input.agentId,
        duration_h: input.durationH,
        started_at: input.startedAt,
        ends_at: input.endsAt,
        reward: input.reward,
      })
      .select(COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") return null;
      throw error;
    }
    return mapRow(data);
  }
  // Demo mode: no awaits below, so the check and insert are atomic in JS.
  if (expeditionMem.rows.some((e) => e.agentId === input.agentId && !e.claimedAt)) return null;
  const row: Expedition = { ...input, id: crypto.randomUUID(), claimedAt: null };
  expeditionMem.rows.push(row);
  return { ...row };
}

/** Removes an expedition that was never claimed (start lost a race for the last slot). */
export async function deleteExpedition(id: string): Promise<void> {
  const sb = getWriteClient();
  if (sb) {
    const { error } = await sb.from("levelup_expeditions").delete().eq("id", id).is("claimed_at", null);
    if (error) throw error;
    return;
  }
  expeditionMem.rows = expeditionMem.rows.filter((e) => e.id !== id || e.claimedAt);
}

/**
 * Atomically marks a finished, unclaimed expedition of this player as claimed. Exactly one
 * concurrent call gets the row back; every other call (too early, not theirs, already claimed) gets null.
 */
export async function claimExpeditionRow(id: string, playerId: string, now: Date): Promise<Expedition | null> {
  const nowIso = now.toISOString();
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_expeditions")
      .update({ claimed_at: nowIso })
      .eq("id", id)
      .eq("player_id", playerId)
      .is("claimed_at", null)
      .lte("ends_at", nowIso)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }
  const row = expeditionMem.rows.find((e) => e.id === id && e.playerId === playerId && !e.claimedAt && e.endsAt <= nowIso);
  if (!row) return null;
  row.claimedAt = nowIso;
  return { ...row };
}

/** Undoes a claim whose rewards could not be granted, so the player can retry. */
export async function releaseClaim(id: string): Promise<void> {
  const sb = getWriteClient();
  if (sb) {
    const { error } = await sb.from("levelup_expeditions").update({ claimed_at: null }).eq("id", id);
    if (error) throw error;
    return;
  }
  const row = expeditionMem.rows.find((e) => e.id === id);
  if (row) row.claimedAt = null;
}
