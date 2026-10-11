import type { SupabaseClient } from "@supabase/supabase-js";
import { addAbilityPoints, applyAgentGrowth, getAgentWithDimensions, getPlayerAgents } from "@/lib/db";
import { getOrBuildSquad } from "@/lib/squads";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { DIMENSIONS } from "@/lib/constants";
import type { AgentWithDimensions } from "@/lib/types";
import { bossByKey, type BossStats } from "./bosses";

export type BossStatus = "active" | "defeated" | "expired";

export interface RaidBoss {
  id: string;
  bossKey: string;
  weekStart: string;
  stats: BossStats;
  maxHp: number;
  hpRemaining: number;
  status: BossStatus;
  lastHitPlayerId: string | null;
  defeatedAt: string | null;
  paidOutAt: string | null;
  createdAt: string;
}

export interface RaidContribution {
  bossId: string;
  playerId: string;
  damage: number;
  attempts: number;
  bestHit: number;
  /** Latest attack label (lead agent name) for display. */
  label: string;
}

export interface RaidHit {
  id: string;
  bossId: string;
  playerId: string;
  damage: number;
  counters: number;
  label: string;
  createdAt: string;
}

export type RewardTier = "champion" | "elite" | "vanguard" | "participant";
export type TrophyTier = "champion" | "elite" | "vanguard" | "slayer";

export const REWARDS: Record<RewardTier, { ability: number; growthPerDim: number }> = {
  champion: { ability: 300, growthPerDim: 3.0 },
  elite: { ability: 150, growthPerDim: 2.0 },
  vanguard: { ability: 75, growthPerDim: 1.0 },
  participant: { ability: 30, growthPerDim: 0.5 },
};
export const LAST_HIT_ABILITY = 100;
export const EXPIRED_REWARD_FACTOR = 0.5;
export const MAX_RAID_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Demo-mode stores
// ---------------------------------------------------------------------------
let memBosses: RaidBoss[] = [];
let memContribs: RaidContribution[] = [];
let memHits: RaidHit[] = [];
let memTrophies: { playerId: string; bossId: string; tier: TrophyTier }[] = [];

/** Clears demo-mode raid data (tests). */
export function resetRaidMemory(): void {
  memBosses = [];
  memContribs = [];
  memHits = [];
  memTrophies = [];
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBoss(r: any): RaidBoss {
  return {
    id: r.id,
    bossKey: r.boss_key,
    weekStart: r.week_start,
    stats: r.stats,
    maxHp: Number(r.max_hp),
    hpRemaining: Number(r.hp_remaining),
    status: r.status,
    lastHitPlayerId: r.last_hit_player_id,
    defeatedAt: r.defeated_at,
    paidOutAt: r.paid_out_at,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Bosses
// ---------------------------------------------------------------------------

export async function getActiveBoss(): Promise<RaidBoss | null> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_raid_bosses").select("*").eq("status", "active").order("week_start", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapBoss(data) : null;
  }
  return memBosses.filter((b) => b.status === "active").sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0] ?? null;
}

export async function getBossById(id: string): Promise<RaidBoss | null> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_raid_bosses").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapBoss(data) : null;
  }
  const b = memBosses.find((x) => x.id === id);
  return b ? { ...b } : null;
}

export async function getBossByWeek(weekStart: string): Promise<RaidBoss | null> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_raid_bosses").select("*").eq("week_start", weekStart).maybeSingle();
    if (error) throw error;
    return data ? mapBoss(data) : null;
  }
  const b = memBosses.find((x) => x.weekStart === weekStart);
  return b ? { ...b } : null;
}

export async function getLatestBoss(): Promise<RaidBoss | null> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_raid_bosses").select("*").order("week_start", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapBoss(data) : null;
  }
  const b = [...memBosses].sort((a, x) => x.weekStart.localeCompare(a.weekStart))[0];
  return b ? { ...b } : null;
}

export async function getPastBosses(limit = 10): Promise<RaidBoss[]> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_raid_bosses").select("*").neq("status", "active").order("week_start", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapBoss);
  }
  return memBosses.filter((b) => b.status !== "active").sort((a, b) => b.weekStart.localeCompare(a.weekStart)).slice(0, limit);
}

/** Creates the boss for a week; if one already exists for that week it is returned unchanged. */
export async function createBoss(input: { bossKey: string; weekStart: string; stats: BossStats; maxHp: number }): Promise<RaidBoss> {
  const existing = await getBossByWeek(input.weekStart);
  if (existing) return existing;
  const sb = writer();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_raid_bosses")
      .upsert(
        { boss_key: input.bossKey, week_start: input.weekStart, stats: input.stats, max_hp: input.maxHp, hp_remaining: input.maxHp },
        { onConflict: "week_start", ignoreDuplicates: true }
      )
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? mapBoss(data) : (await getBossByWeek(input.weekStart))!;
  }
  const boss: RaidBoss = {
    id: crypto.randomUUID(),
    bossKey: input.bossKey,
    weekStart: input.weekStart,
    stats: input.stats,
    maxHp: input.maxHp,
    hpRemaining: input.maxHp,
    status: "active",
    lastHitPlayerId: null,
    defeatedAt: null,
    paidOutAt: null,
    createdAt: new Date().toISOString(),
  };
  memBosses.push(boss);
  return { ...boss };
}

export async function setBossStatus(id: string, status: "expired"): Promise<void> {
  const sb = writer();
  if (sb) {
    const { error } = await sb.from("levelup_raid_bosses").update({ status }).eq("id", id).eq("status", "active");
    if (error) throw error;
    return;
  }
  const b = memBosses.find((x) => x.id === id);
  if (b && b.status === "active") b.status = status;
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

/** Atomically subtracts damage; exactly one call can report killed=true. Contribution and feed are always recorded. */
export async function applyRaidDamage(input: {
  bossId: string;
  playerId: string;
  damage: number;
  bestHit: number;
  counters: number;
  label: string;
}): Promise<{ hpRemaining: number; killed: boolean }> {
  const damage = Math.max(0, Math.round(input.damage));
  const sb = writer();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_raid_apply_damage", {
      p_boss: input.bossId,
      p_player: input.playerId,
      p_damage: damage,
      p_best: Math.round(input.bestHit),
      p_counters: input.counters,
      p_label: input.label,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { hpRemaining: Number(row.hp_remaining), killed: !!row.killed };
  }

  // Demo mode: no awaits below, so this block is atomic in JS.
  const boss = memBosses.find((b) => b.id === input.bossId);
  if (!boss) throw new Error("boss not found");
  let killed = false;
  if (boss.status === "active") {
    const prev = boss.hpRemaining;
    boss.hpRemaining = Math.max(prev - damage, 0);
    if (boss.hpRemaining === 0 && prev > 0) {
      killed = true;
      boss.status = "defeated";
      boss.lastHitPlayerId = input.playerId;
      boss.defeatedAt = new Date().toISOString();
    }
  }
  const c = memContribs.find((x) => x.bossId === input.bossId && x.playerId === input.playerId);
  if (c) {
    c.damage += damage;
    c.attempts += 1;
    c.bestHit = Math.max(c.bestHit, input.bestHit);
    c.label = input.label;
  } else {
    memContribs.push({ bossId: input.bossId, playerId: input.playerId, damage, attempts: 1, bestHit: input.bestHit, label: input.label });
  }
  memHits.push({ id: crypto.randomUUID(), bossId: input.bossId, playerId: input.playerId, damage, counters: input.counters, label: input.label, createdAt: new Date().toISOString() });
  return { hpRemaining: boss.hpRemaining, killed };
}

export async function getContributions(bossId: string): Promise<RaidContribution[]> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_raid_contributions").select("*").eq("boss_id", bossId).order("damage", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({ bossId: r.boss_id, playerId: r.player_id, damage: Number(r.damage), attempts: r.attempts, bestHit: r.best_hit, label: r.label ?? "" }));
  }
  return memContribs.filter((c) => c.bossId === bossId).sort((a, b) => b.damage - a.damage).map((c) => ({ ...c }));
}

export async function getTotalDamage(bossId: string): Promise<number> {
  return (await getContributions(bossId)).reduce((s, c) => s + c.damage, 0);
}

export async function getRecentHits(bossId: string, n: number): Promise<RaidHit[]> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_raid_hits").select("*").eq("boss_id", bossId).order("created_at", { ascending: false }).limit(n);
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, bossId: r.boss_id, playerId: r.player_id, damage: Number(r.damage), counters: r.counters, label: r.label, createdAt: r.created_at }));
  }
  return memHits
    .filter((h) => h.bossId === bossId)
    .map((h, i) => ({ h, i }))
    .sort((a, b) => b.h.createdAt.localeCompare(a.h.createdAt) || b.i - a.i)
    .slice(0, n)
    .map(({ h }) => ({ ...h }));
}

export async function countRaidAttemptsToday(playerId: string): Promise<number> {
  const since = todayStartISO();
  const sb = reader();
  if (sb) {
    const { count, error } = await sb.from("levelup_raid_hits").select("id", { count: "exact", head: true }).eq("player_id", playerId).gte("created_at", since);
    if (error) throw error;
    return count ?? 0;
  }
  return memHits.filter((h) => h.playerId === playerId && h.createdAt >= since).length;
}

// ---------------------------------------------------------------------------
// Payout
// ---------------------------------------------------------------------------

export function tierForRank(rank: number): RewardTier {
  if (rank === 1) return "champion";
  if (rank <= 3) return "elite";
  if (rank <= 10) return "vanguard";
  return "participant";
}

/** Marks the boss paid; true only for the first caller, and only once it is defeated or expired. */
async function claimPayout(boss: RaidBoss): Promise<boolean> {
  if (boss.status === "active" || boss.paidOutAt) return false;
  const sb = writer();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_raid_bosses")
      .update({ paid_out_at: new Date().toISOString() })
      .eq("id", boss.id)
      .is("paid_out_at", null)
      .neq("status", "active")
      .select("id");
    if (error) throw error;
    return (data ?? []).length === 1;
  }
  const b = memBosses.find((x) => x.id === boss.id);
  if (!b || b.paidOutAt) return false;
  b.paidOutAt = new Date().toISOString();
  return true;
}

async function rewardAgents(playerId: string): Promise<AgentWithDimensions[]> {
  const squad = await getOrBuildSquad(playerId);
  if (squad) return squad;
  const agents = await getPlayerAgents(playerId);
  const full = (await Promise.all(agents.map((a) => getAgentWithDimensions(a.id)))).filter((a): a is AgentWithDimensions => !!a);
  const total = (a: AgentWithDimensions) => a.dimensions.reduce((s, d) => s + d.value, 0);
  return full.sort((a, b) => total(b) - total(a)).slice(0, 1);
}

async function addTrophy(playerId: string, bossId: string, tier: TrophyTier): Promise<void> {
  const sb = writer();
  if (sb) {
    const { error } = await sb.from("levelup_player_trophies").upsert({ player_id: playerId, boss_id: bossId, tier }, { onConflict: "player_id,boss_id,tier", ignoreDuplicates: true });
    if (error) throw error;
    return;
  }
  if (!memTrophies.some((t) => t.playerId === playerId && t.bossId === bossId && t.tier === tier)) memTrophies.push({ playerId, bossId, tier });
}

export async function payoutBoss(bossId: string): Promise<boolean> {
  const boss = await getBossById(bossId);
  if (!boss || !(await claimPayout(boss))) return false;

  const defeated = boss.status === "defeated";
  const factor = defeated ? 1 : EXPIRED_REWARD_FACTOR;
  const def = bossByKey(boss.bossKey);
  const weakDims = def ? DIMENSIONS.filter((d) => d.category === def.weak).map((d) => d.id) : [];
  const contributions = await getContributions(bossId);

  for (const [i, c] of contributions.entries()) {
    const tier = tierForRank(i + 1);
    const reward = REWARDS[tier];
    let ability = Math.floor(reward.ability * factor);
    if (defeated && boss.lastHitPlayerId === c.playerId) {
      ability += LAST_HIT_ABILITY;
      await addTrophy(c.playerId, bossId, "slayer");
    }
    await addAbilityPoints(c.playerId, ability);
    if (tier !== "participant") await addTrophy(c.playerId, bossId, tier);

    const perDim = parseFloat((reward.growthPerDim * factor).toFixed(2));
    const growth = Object.fromEntries(weakDims.map((id) => [id, perDim]));
    for (const agent of await rewardAgents(c.playerId)) await applyAgentGrowth(agent.id, growth);
  }
  return true;
}

export async function getTrophies(playerIds: string[]): Promise<Record<string, { bossId: string; tier: TrophyTier }[]>> {
  const out: Record<string, { bossId: string; tier: TrophyTier }[]> = {};
  for (const id of playerIds) out[id] = [];
  if (!playerIds.length) return out;
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_player_trophies").select("*").in("player_id", playerIds);
    if (error) throw error;
    for (const r of data ?? []) out[r.player_id]?.push({ bossId: r.boss_id, tier: r.tier });
    return out;
  }
  for (const t of memTrophies) out[t.playerId]?.push({ bossId: t.bossId, tier: t.tier });
  return out;
}

export async function getAllTrophies(): Promise<{ playerId: string; bossId: string; tier: TrophyTier }[]> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_player_trophies").select("*");
    if (error) throw error;
    return (data ?? []).map((r) => ({ playerId: r.player_id, bossId: r.boss_id, tier: r.tier }));
  }
  return memTrophies.map((t) => ({ ...t }));
}
