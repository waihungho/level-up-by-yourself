import { describe, it, expect, beforeEach, vi } from "vitest";
import { getOrCreatePlayer, getPlayerByWallet, getAgentWithDimensions } from "@/lib/db";
import { getOrBuildSquad } from "@/lib/squads";
import { DIMENSIONS } from "@/lib/constants";

const failAbilityFor = new Set<string>();
vi.mock("@/lib/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...mod,
    addAbilityPoints: async (playerId: string, points: number) => {
      if (failAbilityFor.has(playerId)) {
        failAbilityFor.delete(playerId);
        throw new Error("transient");
      }
      return mod.addAbilityPoints(playerId, points);
    },
  };
});
import {
  applyRaidDamage,
  countRaidAttemptsToday,
  createBoss,
  getActiveBoss,
  getBossByWeek,
  getContributions,
  getRecentHits,
  getTotalDamage,
  getTrophies,
  LAST_HIT_ABILITY,
  payoutBoss,
  resetRaidMemory,
  REWARDS,
  setBossStatus,
  getBossById,
  tierForRank,
} from "../raid-db";
import { computeBossStats, BOSSES } from "../bosses";

let week = 0;
async function newBoss(maxHp = 1000) {
  week++;
  return createBoss({ bossKey: BOSSES[0].key, weekStart: `2030-01-${String(week).padStart(2, "0")}`, stats: computeBossStats([], BOSSES[0]), maxHp });
}

async function player() {
  const wallet = "raid-" + crypto.randomUUID();
  const p = await getOrCreatePlayer(wallet);
  return { id: p.id, wallet };
}

beforeEach(() => resetRaidMemory());

describe("bosses", () => {
  it("creates an active boss and is idempotent per week", async () => {
    const b = await newBoss();
    expect(b.status).toBe("active");
    expect(b.hpRemaining).toBe(1000);
    expect((await getActiveBoss())?.id).toBe(b.id);
    const again = await createBoss({ bossKey: BOSSES[1].key, weekStart: b.weekStart, stats: b.stats, maxHp: 5 });
    expect(again.id).toBe(b.id);
    expect((await getBossByWeek(b.weekStart))?.id).toBe(b.id);
  });

  it("has no active boss after it expires", async () => {
    const b = await newBoss();
    await setBossStatus(b.id, "expired");
    expect(await getActiveBoss()).toBeNull();
  });
});

describe("applyRaidDamage", () => {
  it("lets exactly one of two concurrent killing blows land the kill", async () => {
    const b = await newBoss(1000);
    const [p1, p2] = [await player(), await player()];
    const results = await Promise.all([
      applyRaidDamage({ bossId: b.id, playerId: p1.id, damage: 700, bestHit: 300, counters: 1, label: "A" }),
      applyRaidDamage({ bossId: b.id, playerId: p2.id, damage: 700, bestHit: 300, counters: 1, label: "B" }),
    ]);
    expect(results.filter((r) => r.killed)).toHaveLength(1);
    const killer = results[0].killed ? p1.id : p2.id;
    const after = (await getBossByWeek(b.weekStart))!;
    expect(after.status).toBe("defeated");
    expect(after.hpRemaining).toBe(0);
    expect(after.lastHitPlayerId).toBe(killer);
  });

  it("credits only the damage actually applied: overkill is capped and hits after the kill count as 0", async () => {
    const b = await newBoss(100);
    const [p1, p2] = [await player(), await player()];
    const kill = await applyRaidDamage({ bossId: b.id, playerId: p1.id, damage: 150, bestHit: 150, counters: 0, label: "A" });
    expect(kill).toMatchObject({ killed: true, applied: 100 });
    const late = await applyRaidDamage({ bossId: b.id, playerId: p2.id, damage: 50, bestHit: 50, counters: 0, label: "B" });
    expect(late).toMatchObject({ killed: false, applied: 0 });
    const contribs = await getContributions(b.id);
    expect(contribs.find((c) => c.playerId === p1.id)?.damage).toBe(100);
    expect(contribs.find((c) => c.playerId === p2.id)).toMatchObject({ damage: 0, attempts: 1 });
  });

  it("stamps the hit with the attempt's start time", async () => {
    const b = await newBoss(1000);
    const p = await player();
    await applyRaidDamage({ bossId: b.id, playerId: p.id, damage: 5, bestHit: 5, counters: 0, label: "A", createdAt: "2030-01-01T10:00:00.000Z" });
    expect((await getRecentHits(b.id, 1))[0].createdAt).toBe("2030-01-01T10:00:00.000Z");
  });

  it("accumulates contributions, attempts, best hit, hits feed and daily attempts", async () => {
    const b = await newBoss(100_000);
    const p = await player();
    await applyRaidDamage({ bossId: b.id, playerId: p.id, damage: 300, bestHit: 120, counters: 2, label: "Kade" });
    await applyRaidDamage({ bossId: b.id, playerId: p.id, damage: 200, bestHit: 150, counters: 0, label: "Kade" });
    const [c] = await getContributions(b.id);
    expect(c).toMatchObject({ playerId: p.id, damage: 500, attempts: 2, bestHit: 150 });
    expect(await getTotalDamage(b.id)).toBe(500);
    expect((await getRecentHits(b.id, 10)).map((h) => h.damage)).toEqual([200, 300]);
    expect(await countRaidAttemptsToday(p.id)).toBe(2);
  });
});

describe("payouts", () => {
  it("maps ranks to tiers", () => {
    expect([1, 2, 3, 4, 10, 11].map(tierForRank)).toEqual(["champion", "elite", "elite", "vanguard", "vanguard", "participant"]);
  });

  it("pays a defeated boss exactly once with tier rewards and a slayer trophy", async () => {
    const b = await newBoss(1000);
    const [p1, p2] = [await player(), await player()];
    await applyRaidDamage({ bossId: b.id, playerId: p1.id, damage: 600, bestHit: 300, counters: 0, label: "A" });
    await applyRaidDamage({ bossId: b.id, playerId: p2.id, damage: 500, bestHit: 300, counters: 0, label: "B" });
    expect(await payoutBoss(b.id)).toBe(true);
    expect(await payoutBoss(b.id)).toBe(false);
    const champ = await getPlayerByWallet(p1.wallet);
    const slayer = await getPlayerByWallet(p2.wallet);
    expect(champ!.abilityScore).toBe(REWARDS.champion.ability);
    expect(slayer!.abilityScore).toBe(REWARDS.elite.ability + LAST_HIT_ABILITY);
    const trophies = await getTrophies([p1.id, p2.id]);
    expect(trophies[p1.id].map((t) => t.tier)).toEqual(["champion"]);
    expect(trophies[p2.id].map((t) => t.tier).sort()).toEqual(["elite", "slayer"]);
  });

  it("pays half (rounded down) and no slayer for an expired boss", async () => {
    const b = await newBoss(1_000_000);
    const p = await player();
    await applyRaidDamage({ bossId: b.id, playerId: p.id, damage: 10, bestHit: 10, counters: 0, label: "A" });
    await setBossStatus(b.id, "expired");
    expect(await payoutBoss(b.id)).toBe(true);
    expect((await getPlayerByWallet(p.wallet))!.abilityScore).toBe(Math.floor(REWARDS.champion.ability / 2));
  });

  it("spreads the growth reward across the boss's weakness dimensions", async () => {
    const b = await newBoss(100);
    const p = await player();
    const squad = (await getOrBuildSquad(p.id))!;
    const weakDim = DIMENSIONS.find((d) => d.category === BOSSES[0].weak)!.id;
    const before = squad[0].dimensions.find((d) => d.dimensionId === weakDim)!.value;
    await applyRaidDamage({ bossId: b.id, playerId: p.id, damage: 100, bestHit: 100, counters: 0, label: "A" });
    await payoutBoss(b.id);
    const after = (await getAgentWithDimensions(squad[0].id))!.dimensions.find((d) => d.dimensionId === weakDim)!.value;
    const weakCount = DIMENSIONS.filter((d) => d.category === BOSSES[0].weak).length;
    expect(after - before).toBeCloseTo(REWARDS.champion.growthTotal / weakCount, 2);
  });

  it("resumes a payout that failed partway without paying anyone twice", async () => {
    const b = await newBoss(100);
    const [p1, p2] = [await player(), await player()];
    await applyRaidDamage({ bossId: b.id, playerId: p1.id, damage: 60, bestHit: 60, counters: 0, label: "A" });
    await applyRaidDamage({ bossId: b.id, playerId: p2.id, damage: 60, bestHit: 60, counters: 0, label: "B" });
    failAbilityFor.add(p2.id);
    await expect(payoutBoss(b.id)).rejects.toThrow("transient");
    expect((await getBossById(b.id))!.paidOutAt).toBeNull();
    expect(await payoutBoss(b.id)).toBe(true);
    expect((await getPlayerByWallet(p1.wallet))!.abilityScore).toBe(REWARDS.champion.ability);
    expect((await getPlayerByWallet(p2.wallet))!.abilityScore).toBe(REWARDS.elite.ability + LAST_HIT_ABILITY);
    expect((await getBossById(b.id))!.paidOutAt).not.toBeNull();
  });

  it("refuses to pay a boss that is still active", async () => {
    const b = await newBoss();
    expect(await payoutBoss(b.id)).toBe(false);
  });
});
