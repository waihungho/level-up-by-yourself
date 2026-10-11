import { describe, it, expect, beforeEach } from "vitest";
import { getOrCreatePlayer, getPlayerByWallet } from "@/lib/db";
import { FIRST_BOSS_HP, MAX_BOSS_HP, MIN_BOSS_HP, nextBossHp, runRaidWeekly, weekStartOf } from "../raid-cron";
import { applyRaidDamage, getBossById, getLatestBoss, resetRaidMemory, REWARDS, type RaidBoss } from "../raid-db";
import { BOSSES } from "../bosses";

beforeEach(() => resetRaidMemory());

const MON = new Date("2031-03-03T00:00:05Z"); // a Monday
const NEXT_MON = new Date("2031-03-10T00:00:05Z");

function boss(over: Partial<RaidBoss>): RaidBoss {
  return {
    id: "b", bossKey: BOSSES[0].key, weekStart: "2031-03-03", stats: { catAvg: { Physical: 1, Technical: 1, Mental: 1, Spiritual: 1, Social: 1 }, speed: 1 },
    maxHp: 1_000_000, hpRemaining: 0, status: "defeated", lastHitPlayerId: null, defeatedAt: null, paidOutAt: null, createdAt: "", ...over,
  };
}

describe("weekStartOf", () => {
  it("returns the Monday (UTC) of the week", () => {
    expect(weekStartOf(new Date("2031-03-05T15:00:00Z"))).toBe("2031-03-03");
    expect(weekStartOf(new Date("2031-03-09T23:59:59Z"))).toBe("2031-03-03");
    expect(weekStartOf(MON)).toBe("2031-03-03");
  });
});

describe("nextBossHp", () => {
  it("uses the first-boss estimate when there is no previous boss", () => {
    expect(nextBossHp(null, 0)).toBe(FIRST_BOSS_HP);
  });
  it("grows 10% over last week's damage when the boss survived", () => {
    expect(nextBossHp(boss({ status: "expired" }), 2_000_000)).toBe(2_200_000);
  });
  it("grows faster when the boss died early, capped at 1.6x", () => {
    const day2 = boss({ status: "defeated", defeatedAt: "2031-03-04T12:00:00Z" });
    expect(nextBossHp(day2, 2_000_000)).toBe(3_200_000);
    const day5 = boss({ status: "defeated", defeatedAt: "2031-03-07T12:00:00Z" });
    expect(nextBossHp(day5, 2_000_000)).toBe(2_200_000);
  });
  it("clamps to the min and max", () => {
    expect(nextBossHp(boss({ status: "expired" }), 10)).toBe(MIN_BOSS_HP);
    expect(nextBossHp(boss({ status: "expired" }), 1e12)).toBe(MAX_BOSS_HP);
  });
});

describe("runRaidWeekly", () => {
  it("spawns the first boss, and a second run in the same week does nothing", async () => {
    const first = await runRaidWeekly(MON);
    const b = (await getLatestBoss())!;
    expect(first).toEqual({ closed: null, spawned: b.id, created: true });
    expect(b.maxHp).toBe(FIRST_BOSS_HP);
    expect(b.bossKey).toBe(BOSSES[0].key);
    const again = await runRaidWeekly(new Date("2031-03-05T00:00:00Z"));
    expect(again).toEqual({ closed: null, spawned: b.id, created: false });
  });

  it("next week expires a surviving boss, pays half, and spawns the next boss in rotation", async () => {
    await runRaidWeekly(MON);
    const b1 = (await getLatestBoss())!;
    const wallet = "cron-" + crypto.randomUUID();
    const p = await getOrCreatePlayer(wallet);
    await applyRaidDamage({ bossId: b1.id, playerId: p.id, damage: 1000, bestHit: 100, counters: 0, label: "A" });

    const r = await runRaidWeekly(NEXT_MON);
    expect(r.closed).toBe(b1.id);
    const closed = (await getBossById(b1.id))!;
    expect(closed.status).toBe("expired");
    expect(closed.paidOutAt).not.toBeNull();
    expect((await getPlayerByWallet(wallet))!.abilityScore).toBe(Math.floor(REWARDS.champion.ability / 2));
    const b2 = (await getLatestBoss())!;
    expect(b2.bossKey).toBe(BOSSES[1].key);
    expect(b2.maxHp).toBe(MIN_BOSS_HP); // 1000 * 1.1 is below the floor
  });
});
