import { addAbilityPoints, applyAgentGrowth, getAgentWithDimensions, getPlayerAgents } from "@/lib/db";
import { getOrBuildSquad } from "@/lib/squads";
import { getWriteClient } from "@/lib/supabase-admin";
import { DIMENSIONS } from "@/lib/constants";
import type { AgentWithDimensions } from "@/lib/types";
import { bossByKey, type BossStats } from "./bosses";
import { getBossById, getBossByWeek, getContributions, mapBoss, mem, type RaidBoss, type RaidContribution, type TrophyTier } from "./raid-read";

export * from "./raid-read";

const writer = getWriteClient;

export type RewardTier = "champion" | "elite" | "vanguard" | "participant";

/** growthTotal is spread evenly across the boss's weakness-category dimensions for each reward agent. */
export const REWARDS: Record<RewardTier, { ability: number; growthTotal: number }> = {
  champion: { ability: 300, growthTotal: 3.0 },
  elite: { ability: 150, growthTotal: 2.0 },
  vanguard: { ability: 75, growthTotal: 1.0 },
  participant: { ability: 30, growthTotal: 0.5 },
};
export const LAST_HIT_ABILITY = 100;
export const EXPIRED_REWARD_FACTOR = 0.5;
export const MAX_RAID_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Bosses
// ---------------------------------------------------------------------------

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
  mem.bosses.push(boss);
  return { ...boss };
}

export async function setBossStatus(id: string, status: "expired"): Promise<void> {
  const sb = writer();
  if (sb) {
    const { error } = await sb.from("levelup_raid_bosses").update({ status }).eq("id", id).eq("status", "active");
    if (error) throw error;
    return;
  }
  const b = mem.bosses.find((x) => x.id === id);
  if (b && b.status === "active") b.status = status;
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

/**
 * Atomically subtracts damage; exactly one call can report killed=true. Only damage actually applied
 * to the boss is credited (overkill is capped, hits after the kill count as 0), so the leaderboard
 * always matches what payout ranks. The attempt itself is always recorded (daily limit, feed).
 */
export async function applyRaidDamage(input: {
  bossId: string;
  playerId: string;
  damage: number;
  bestHit: number;
  counters: number;
  label: string;
  /** When the attempt started (defaults to now) so it counts on the day it was fought. */
  createdAt?: string;
}): Promise<{ hpRemaining: number; killed: boolean; applied: number }> {
  const damage = Math.max(0, Math.round(input.damage));
  const createdAt = input.createdAt ?? new Date().toISOString();
  const sb = writer();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_raid_apply_damage", {
      p_boss: input.bossId,
      p_player: input.playerId,
      p_damage: damage,
      p_best: Math.round(input.bestHit),
      p_counters: input.counters,
      p_label: input.label,
      p_created_at: createdAt,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { hpRemaining: Number(row.hp_remaining), killed: !!row.killed, applied: Number(row.applied) };
  }

  // Demo mode: no awaits below, so this block is atomic in JS.
  const boss = mem.bosses.find((b) => b.id === input.bossId);
  if (!boss) throw new Error("boss not found");
  let killed = false;
  let applied = 0;
  if (boss.status === "active") {
    const prev = boss.hpRemaining;
    boss.hpRemaining = Math.max(prev - damage, 0);
    applied = prev - boss.hpRemaining;
    if (boss.hpRemaining === 0 && prev > 0) {
      killed = true;
      boss.status = "defeated";
      boss.lastHitPlayerId = input.playerId;
      boss.defeatedAt = new Date().toISOString();
    }
  }
  const c = mem.contribs.find((x) => x.bossId === input.bossId && x.playerId === input.playerId);
  if (c) {
    c.damage += applied;
    c.attempts += 1;
    c.bestHit = Math.max(c.bestHit, input.bestHit);
    c.label = input.label;
  } else {
    mem.contribs.push({ bossId: input.bossId, playerId: input.playerId, damage: applied, attempts: 1, bestHit: input.bestHit, label: input.label });
  }
  mem.hits.push({ id: crypto.randomUUID(), bossId: input.bossId, playerId: input.playerId, damage: applied, counters: input.counters, label: input.label, createdAt });
  return { hpRemaining: boss.hpRemaining, killed, applied };
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

/** Claims one contributor's reward; true for exactly one caller, so retries never pay anyone twice. */
async function claimPlayerPayout(bossId: string, playerId: string): Promise<boolean> {
  const sb = writer();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_raid_payouts")
      .upsert({ boss_id: bossId, player_id: playerId }, { onConflict: "boss_id,player_id", ignoreDuplicates: true })
      .select("player_id");
    if (error) throw error;
    return (data ?? []).length === 1;
  }
  const key = `${bossId}:${playerId}`;
  if (mem.payouts.has(key)) return false;
  mem.payouts.add(key);
  return true;
}

async function markPaidOut(bossId: string): Promise<boolean> {
  const sb = writer();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_raid_bosses")
      .update({ paid_out_at: new Date().toISOString() })
      .eq("id", bossId)
      .is("paid_out_at", null)
      .select("id");
    if (error) throw error;
    return (data ?? []).length === 1;
  }
  const b = mem.bosses.find((x) => x.id === bossId);
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
  if (!mem.trophies.some((t) => t.playerId === playerId && t.bossId === bossId && t.tier === tier)) mem.trophies.push({ playerId, bossId, tier });
}

async function payContributor(boss: RaidBoss, c: RaidContribution, rank: number, weakDims: number[]): Promise<void> {
  const defeated = boss.status === "defeated";
  const factor = defeated ? 1 : EXPIRED_REWARD_FACTOR;
  const tier = tierForRank(rank);
  const reward = REWARDS[tier];
  let ability = Math.floor(reward.ability * factor);
  if (defeated && boss.lastHitPlayerId === c.playerId) {
    ability += LAST_HIT_ABILITY;
    await addTrophy(c.playerId, boss.id, "slayer");
  }
  if (tier !== "participant") await addTrophy(c.playerId, boss.id, tier);

  if (weakDims.length) {
    const perDim = parseFloat(((reward.growthTotal * factor) / weakDims.length).toFixed(2));
    const growth = Object.fromEntries(weakDims.map((id) => [id, perDim]));
    await Promise.all((await rewardAgents(c.playerId)).map((agent) => applyAgentGrowth(agent.id, growth)));
  }
  // Last: trophies are idempotent and growth is small, so a retry after a failure here re-grants the least.
  await addAbilityPoints(c.playerId, ability);
}

/**
 * Pays every contributor of a defeated or expired boss. Each player is claimed individually before
 * being paid, and the boss is only marked paid once everyone is processed, so a failed run can be
 * resumed without double-paying. Returns true when this call completed the payout.
 */
export async function payoutBoss(bossId: string): Promise<boolean> {
  const boss = await getBossById(bossId);
  if (!boss || boss.status === "active" || boss.paidOutAt) return false;

  const def = bossByKey(boss.bossKey);
  const weakDims = def ? DIMENSIONS.filter((d) => d.category === def.weak).map((d) => d.id) : [];
  const contributions = await getContributions(bossId);
  for (const [i, c] of contributions.entries()) {
    if (await claimPlayerPayout(bossId, c.playerId)) {
      try {
        await payContributor(boss, c, i + 1, weakDims);
      } catch (e) {
        await releasePlayerPayout(bossId, c.playerId);
        throw e;
      }
    }
  }
  return markPaidOut(bossId);
}

async function releasePlayerPayout(bossId: string, playerId: string): Promise<void> {
  const sb = writer();
  if (sb) {
    const { error } = await sb.from("levelup_raid_payouts").delete().eq("boss_id", bossId).eq("player_id", playerId);
    if (error) throw error;
    return;
  }
  mem.payouts.delete(`${bossId}:${playerId}`);
}

