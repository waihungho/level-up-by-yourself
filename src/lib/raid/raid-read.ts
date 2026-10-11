import { getSupabase } from "@/lib/supabase";
import { selectAllPages } from "@/lib/supabase-pages";
import { utcDayStartISO } from "@/lib/time";
import type { BossStats } from "./bosses";

/*
 * Read-only raid queries (public anon client). Safe to import from client components;
 * writes live in raid-db.ts, which needs the service-role client.
 */

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

export type TrophyTier = "champion" | "elite" | "vanguard" | "slayer";

/** Demo-mode stores shared with raid-db.ts writes. */
export const mem = {
  bosses: [] as RaidBoss[],
  contribs: [] as RaidContribution[],
  hits: [] as RaidHit[],
  trophies: [] as { playerId: string; bossId: string; tier: TrophyTier }[],
  payouts: new Set<string>(),
};

/** Clears demo-mode raid data (tests). */
export function resetRaidMemory(): void {
  mem.bosses = [];
  mem.contribs = [];
  mem.hits = [];
  mem.trophies = [];
  mem.payouts = new Set<string>();
}

const reader = getSupabase;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapBoss(r: any): RaidBoss {
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

export async function getActiveBoss(): Promise<RaidBoss | null> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_raid_bosses").select("*").eq("status", "active").order("week_start", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapBoss(data) : null;
  }
  return mem.bosses.filter((b) => b.status === "active").sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0] ?? null;
}

export async function getBossById(id: string): Promise<RaidBoss | null> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_raid_bosses").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapBoss(data) : null;
  }
  const b = mem.bosses.find((x) => x.id === id);
  return b ? { ...b } : null;
}

export async function getBossByWeek(weekStart: string): Promise<RaidBoss | null> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_raid_bosses").select("*").eq("week_start", weekStart).maybeSingle();
    if (error) throw error;
    return data ? mapBoss(data) : null;
  }
  const b = mem.bosses.find((x) => x.weekStart === weekStart);
  return b ? { ...b } : null;
}

export async function getLatestBoss(): Promise<RaidBoss | null> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_raid_bosses").select("*").order("week_start", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapBoss(data) : null;
  }
  const b = [...mem.bosses].sort((a, x) => x.weekStart.localeCompare(a.weekStart))[0];
  return b ? { ...b } : null;
}

export async function getPastBosses(limit = 10): Promise<RaidBoss[]> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_raid_bosses").select("*").neq("status", "active").order("week_start", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapBoss);
  }
  return mem.bosses.filter((b) => b.status !== "active").sort((a, b) => b.weekStart.localeCompare(a.weekStart)).slice(0, limit);
}

type ContributionRow = { boss_id: string; player_id: string; damage: number | string; attempts: number; best_hit: number; label: string | null };

function mapContribution(r: ContributionRow): RaidContribution {
  return { bossId: r.boss_id, playerId: r.player_id, damage: Number(r.damage), attempts: r.attempts, bestHit: r.best_hit, label: r.label ?? "" };
}

/** Every contributor, highest damage first (paged: payouts must not stop at PostgREST's 1000-row cap). */
export async function getContributions(bossId: string): Promise<RaidContribution[]> {
  const sb = reader();
  if (sb) {
    const rows = await selectAllPages<ContributionRow>((from, to) =>
      sb
        .from("levelup_raid_contributions")
        .select("*")
        .eq("boss_id", bossId)
        .order("damage", { ascending: false })
        .order("player_id")
        .range(from, to)
    );
    return rows.map(mapContribution);
  }
  return mem.contribs.filter((c) => c.bossId === bossId).sort((a, b) => b.damage - a.damage).map((c) => ({ ...c }));
}

export interface RaidStandings {
  top: RaidContribution[];
  participants: number;
  me: { rank: number; damage: number } | null;
}

/** Leaderboard slice for the raid view: top `limit`, participant count and the player's own rank. */
export async function getRaidStandings(bossId: string, playerId: string | null, limit: number): Promise<RaidStandings> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_raid_standings", { p_boss_id: bossId, p_player_id: playerId, p_limit: limit });
    if (!error && data) {
      const me = data.me as (ContributionRow & { rank: number }) | null;
      return {
        top: ((data.top ?? []) as ContributionRow[]).map(mapContribution),
        participants: Number(data.participants ?? 0),
        me: me ? { rank: Number(me.rank), damage: Number(me.damage) } : null,
      };
    }
    // Fallback until migration 006 is applied.
  }
  const all = await getContributions(bossId);
  const myIndex = playerId ? all.findIndex((c) => c.playerId === playerId) : -1;
  return {
    top: all.slice(0, limit),
    participants: all.length,
    me: myIndex >= 0 ? { rank: myIndex + 1, damage: all[myIndex].damage } : null,
  };
}

/** Labels of the top contributor and of one specific player (Hall of Fame), without reading every row. */
export async function getChampionAndPlayerLabel(
  bossId: string,
  playerId: string | null
): Promise<{ champion: string | null; player: string | null }> {
  const sb = reader();
  if (sb) {
    const [top, one] = await Promise.all([
      sb.from("levelup_raid_contributions").select("label").eq("boss_id", bossId).order("damage", { ascending: false }).limit(1).maybeSingle(),
      playerId
        ? sb.from("levelup_raid_contributions").select("label").eq("boss_id", bossId).eq("player_id", playerId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (top.error) throw top.error;
    if (one.error) throw one.error;
    return { champion: top.data?.label || null, player: one.data?.label || null };
  }
  const all = await getContributions(bossId);
  return { champion: all[0]?.label || null, player: all.find((c) => c.playerId === playerId)?.label || null };
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
  return mem.hits
    .filter((h) => h.bossId === bossId)
    .map((h, i) => ({ h, i }))
    .sort((a, b) => b.h.createdAt.localeCompare(a.h.createdAt) || b.i - a.i)
    .slice(0, n)
    .map(({ h }) => ({ ...h }));
}

export async function countRaidAttemptsToday(playerId: string): Promise<number> {
  const since = utcDayStartISO();
  const sb = reader();
  if (sb) {
    const { count, error } = await sb.from("levelup_raid_hits").select("id", { count: "exact", head: true }).eq("player_id", playerId).gte("created_at", since);
    if (error) throw error;
    return count ?? 0;
  }
  return mem.hits.filter((h) => h.playerId === playerId && h.createdAt >= since).length;
}

/** Bosses that were defeated/expired but whose payout has not completed (retry target). */
export async function getUnpaidFinishedBoss(): Promise<RaidBoss | null> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_raid_bosses").select("*").neq("status", "active").is("paid_out_at", null).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapBoss(data) : null;
  }
  return mem.bosses.find((b) => b.status !== "active" && !b.paidOutAt) ?? null;
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
  for (const t of mem.trophies) out[t.playerId]?.push({ bossId: t.bossId, tier: t.tier });
  return out;
}

export async function getAllTrophies(): Promise<{ playerId: string; bossId: string; tier: TrophyTier }[]> {
  const sb = reader();
  if (sb) {
    const { data, error } = await sb.from("levelup_player_trophies").select("*");
    if (error) throw error;
    return (data ?? []).map((r) => ({ playerId: r.player_id, bossId: r.boss_id, tier: r.tier }));
  }
  return mem.trophies.map((t) => ({ ...t }));
}
