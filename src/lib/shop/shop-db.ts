import { getWriteClient } from "@/lib/supabase-admin";
import { utcDayStartISO } from "@/lib/time";
import type { AttemptMode } from "./catalog";
import { shopMem } from "./shop-memory";
import type { CosmeticKind } from "./shop-read";
import { getTitles } from "./shop-read";

export * from "./shop-read";

const DAY_MS = 86_400_000;
const todayDate = () => utcDayStartISO().slice(0, 10);

export class AlreadyOwnedError extends Error {
  constructor() {
    super("already_owned");
  }
}

// ---------------------------------------------------------------------------
// Training Scroll buff
// ---------------------------------------------------------------------------

/** Extends the agent's ×2 growth buff by `days` from max(now, current expiry); returns the new expiry. */
export async function extendGrowthBuff(agentId: string, days: number): Promise<string> {
  const sb = getWriteClient();
  let current: string | null;
  if (sb) {
    const { data, error } = await sb.from("levelup_agent_buffs").select("expires_at").eq("agent_id", agentId).eq("kind", "growth_x2").maybeSingle();
    if (error) throw error;
    current = data?.expires_at ?? null;
  } else {
    current = shopMem.buffs.get(agentId) ?? null;
  }
  const base = Math.max(Date.now(), current ? Date.parse(current) : 0);
  const expiresAt = new Date(base + days * DAY_MS).toISOString();
  if (sb) {
    const { error } = await sb.from("levelup_agent_buffs").upsert({ agent_id: agentId, kind: "growth_x2", expires_at: expiresAt }, { onConflict: "agent_id,kind" });
    if (error) throw error;
  } else {
    shopMem.buffs.set(agentId, expiresAt);
  }
  return expiresAt;
}

/** Agents (of those given) whose ×2 growth buff is still active. */
export async function getActiveGrowthBuffs(agentIds: string[]): Promise<Set<string>> {
  const now = new Date().toISOString();
  const sb = getWriteClient();
  if (sb) {
    if (!agentIds.length) return new Set();
    const { data, error } = await sb.from("levelup_agent_buffs").select("agent_id").eq("kind", "growth_x2").gt("expires_at", now).in("agent_id", agentIds);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.agent_id));
  }
  return new Set(agentIds.filter((id) => (shopMem.buffs.get(id) ?? "") > now));
}

/** Every agent with an active ×2 growth buff (daily growth job). */
export async function getAllActiveGrowthBuffs(): Promise<Set<string>> {
  const now = new Date().toISOString();
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.from("levelup_agent_buffs").select("agent_id").eq("kind", "growth_x2").gt("expires_at", now);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.agent_id));
  }
  return new Set([...shopMem.buffs].filter(([, exp]) => exp > now).map(([id]) => id));
}

// ---------------------------------------------------------------------------
// Refills / tickets
// ---------------------------------------------------------------------------

export async function addAttemptBonus(input: { playerId: string; agentId: string | null; mode: AttemptMode; extra: number }): Promise<void> {
  const sb = getWriteClient();
  const day = todayDate();
  if (sb) {
    const { error } = await sb.from("levelup_attempt_bonuses").insert({ player_id: input.playerId, agent_id: input.agentId, mode: input.mode, extra: input.extra, day });
    if (error) throw error;
    return;
  }
  shopMem.bonuses.push({ ...input, day });
}

/** Extra attempts bought for today (UTC) for an agent (training/pvp) or a player (squad/raid). */
export async function getAttemptBonusToday(filter: { playerId?: string; agentId?: string; mode: AttemptMode }): Promise<number> {
  const day = todayDate();
  const sb = getWriteClient();
  if (sb) {
    let q = sb.from("levelup_attempt_bonuses").select("extra").eq("day", day).eq("mode", filter.mode);
    if (filter.agentId) q = q.eq("agent_id", filter.agentId);
    if (filter.playerId) q = q.eq("player_id", filter.playerId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).reduce((s, r) => s + r.extra, 0);
  }
  return shopMem.bonuses
    .filter((b) => b.day === day && b.mode === filter.mode && (!filter.agentId || b.agentId === filter.agentId) && (!filter.playerId || b.playerId === filter.playerId))
    .reduce((s, b) => s + b.extra, 0);
}

// ---------------------------------------------------------------------------
// Cosmetics / titles
// ---------------------------------------------------------------------------

export async function setCosmetic(agentId: string, kind: CosmeticKind, value: string): Promise<void> {
  const sb = getWriteClient();
  if (sb) {
    const { error } = await sb.from("levelup_agent_cosmetics").upsert({ agent_id: agentId, kind, value }, { onConflict: "agent_id,kind" });
    if (error) throw error;
    return;
  }
  shopMem.cosmetics.set(agentId, { ...(shopMem.cosmetics.get(agentId) ?? {}), [kind]: value });
}

/** Sets the player's active title; buying the title they already have throws AlreadyOwnedError. */
export async function grantTitle(playerId: string, title: string): Promise<void> {
  if ((await getTitles([playerId]))[playerId] === title) throw new AlreadyOwnedError();
  const sb = getWriteClient();
  if (sb) {
    const { error } = await sb.from("levelup_player_titles").upsert({ player_id: playerId, title }, { onConflict: "player_id" });
    if (error) throw error;
    return;
  }
  shopMem.titles.set(playerId, title);
}
