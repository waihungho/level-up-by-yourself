import { getAllAgentsWithDimensions } from "@/lib/db";
import { getAllGear } from "@/lib/shop/gear-read";
import { BOSSES, bossForWeek, computeBossStats } from "./bosses";
import { createBoss, getBossById, getLatestBoss, getTotalDamage, payoutBoss, setBossStatus, type RaidBoss } from "./raid-db";
import { MEDIAN_ATTEMPT_DAMAGE } from "./raid-engine";

export const MIN_BOSS_HP = 200_000;
export const MAX_BOSS_HP = 50_000_000;
/** Week 1 estimate: ~14 daily players × 3 attempts × 5 days × median attempt damage. */
export const FIRST_BOSS_HP = 14 * 3 * 5 * MEDIAN_ATTEMPT_DAMAGE;
/** A boss should survive most of its week: aim for a kill on day 6 (Saturday). */
const TARGET_KILL_DAY = 6;
const GROWTH = 1.1;
/**
 * Max HP jump after an early kill. A day-1 kill would ask for 1.1 × 6 = 6.6x, but bosses also hit
 * harder now (BOSS_DAMAGE_MULT), so 5x already lands near day 6 without overshooting into an escape.
 */
const MAX_GROWTH = 5;
const DAY_MS = 86_400_000;

/** Monday 00:00 UTC of the week containing `now`, as YYYY-MM-DD. */
export function weekStartOf(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

function clampHp(hp: number): number {
  return Math.min(MAX_BOSS_HP, Math.max(MIN_BOSS_HP, Math.round(hp)));
}

/** Next boss HP aims for a kill around day 6, based on how last week's boss went. */
export function nextBossHp(prev: RaidBoss | null, totalDamage: number): number {
  if (!prev) return clampHp(FIRST_BOSS_HP);
  if (prev.status !== "defeated" || !prev.defeatedAt) return clampHp(totalDamage * GROWTH);
  const dayKilled = Math.floor((Date.parse(prev.defeatedAt) - Date.parse(`${prev.weekStart}T00:00:00Z`)) / DAY_MS) + 1;
  const mult = Math.min((GROWTH * TARGET_KILL_DAY) / Math.max(dayKilled, 1), MAX_GROWTH);
  return clampHp(totalDamage * mult);
}

/**
 * Weekly job (Monday 00:00 UTC): close last week's boss (expire + half rewards if alive,
 * pay out if defeated but unpaid) and spawn the next boss in rotation. Idempotent per week.
 */
export async function runRaidWeekly(now: Date): Promise<{ closed: string | null; spawned: string; created: boolean }> {
  const week = weekStartOf(now);
  const latest = await getLatestBoss();
  if (latest && latest.weekStart >= week) return { closed: null, spawned: latest.id, created: false };

  let closed: RaidBoss | null = null;
  if (latest) {
    if (latest.status === "active") await setBossStatus(latest.id, "expired");
    await payoutBoss(latest.id); // no-op if already paid
    closed = await getBossById(latest.id);
  }

  const totalDamage = closed ? await getTotalDamage(closed.id) : 0;
  const rotation = closed ? BOSSES.findIndex((b) => b.key === closed.bossKey) + 1 : 0;
  const def = bossForWeek(rotation);
  const [agents, gear] = await Promise.all([getAllAgentsWithDimensions(), getAllGear()]);
  const stats = computeBossStats(agents.map((a) => (gear[a.id] ? { ...a, gear: gear[a.id] } : a)), def);
  const boss = await createBoss({ bossKey: def.key, weekStart: week, stats, maxHp: nextBossHp(closed, totalDamage) });
  return { closed: closed?.id ?? null, spawned: boss.id, created: true };
}
