import { describe, it, expect, beforeEach } from "vitest";
import { resetShopMemory } from "../shop-memory";
import {
  addAttemptBonus,
  AlreadyOwnedError,
  extendGrowthBuff,
  getActiveGrowthBuffs,
  getAttemptBonusToday,
  getCosmetics,
  getTitles,
  grantTitle,
  setCosmetic,
} from "../shop-db";

beforeEach(() => resetShopMemory());

describe("growth buffs", () => {
  it("lasts 7 days and extends from the current expiry when bought again", async () => {
    const now = Date.now();
    const first = await extendGrowthBuff("a1", 7);
    expect(Date.parse(first) - now).toBeGreaterThan(6.9 * 86_400_000);
    const second = await extendGrowthBuff("a1", 7);
    expect(Date.parse(second) - Date.parse(first)).toBeCloseTo(7 * 86_400_000, -3);
    expect(await getActiveGrowthBuffs(["a1", "a2"])).toEqual(new Set(["a1"]));
  });
});

describe("attempt bonuses", () => {
  it("sums today's bonuses per agent or player and mode", async () => {
    await addAttemptBonus({ playerId: "p1", agentId: "a1", mode: "pvp", extra: 3 });
    await addAttemptBonus({ playerId: "p1", agentId: "a1", mode: "pvp", extra: 3 });
    await addAttemptBonus({ playerId: "p1", agentId: null, mode: "raid", extra: 1 });
    expect(await getAttemptBonusToday({ agentId: "a1", mode: "pvp" })).toBe(6);
    expect(await getAttemptBonusToday({ playerId: "p1", mode: "raid" })).toBe(1);
    expect(await getAttemptBonusToday({ playerId: "p1", mode: "squad_pvp" })).toBe(0);
    expect(await getAttemptBonusToday({ agentId: "a2", mode: "pvp" })).toBe(0);
  });
});

describe("cosmetics and titles", () => {
  it("stores one aura and one name colour per agent, replacing older ones", async () => {
    await setCosmetic("a1", "aura", "ember");
    await setCosmetic("a1", "aura", "frost");
    await setCosmetic("a1", "namecolor", "gold");
    expect(await getCosmetics(["a1", "a2"])).toEqual({ a1: { aura: "frost", namecolor: "gold" } });
  });

  it("grants a title once", async () => {
    await grantTitle("p1", "whale");
    await expect(grantTitle("p1", "whale")).rejects.toBeInstanceOf(AlreadyOwnedError);
    await grantTitle("p1", "patron");
    expect(await getTitles(["p1", "p2"])).toEqual({ p1: "patron" });
  });
});
