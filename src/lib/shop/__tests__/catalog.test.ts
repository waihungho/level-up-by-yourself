import { describe, it, expect } from "vitest";
import { DIMENSIONS } from "@/lib/constants";
import { GEM_PACKS, SHOP_ITEMS, elixirGrowth, gearBonus, gearTier, gearUpgradeCost, getItem } from "../catalog";

describe("gem packs", () => {
  it("match the approved prices", () => {
    expect(GEM_PACKS).toMatchObject({
      starter: { sol: 0.05, gems: 50 },
      standard: { sol: 0.1, gems: 110 },
      big: { sol: 0.25, gems: 300 },
      whale: { sol: 0.5, gems: 650 },
    });
  });
});

describe("isPackId", () => {
  it("accepts only real pack ids, not inherited object keys", async () => {
    const { isPackId } = await import("../catalog");
    expect(isPackId("whale")).toBe(true);
    expect(isPackId("toString")).toBe(false);
    expect(isPackId("constructor")).toBe(false);
  });
});

describe("catalog", () => {
  it("prices every item as specified", () => {
    const price = (id: string) => getItem(id)?.price;
    expect(price("elixir_physical")).toBe(30);
    expect(price("elixir_grand")).toBe(80);
    expect(price("scroll_growth")).toBe(60);
    expect(price("refill_training")).toBe(40);
    expect(price("refill_pvp")).toBe(40);
    expect(price("ticket_squad")).toBe(30);
    expect(price("ticket_raid")).toBe(50);
    expect(price("aura_ember")).toBe(100);
    expect(price("namecolor_gold")).toBe(50);
    expect(price("title_whale")).toBe(150);
  });

  it("has 5 category elixirs, 6 auras, 6 name colours and 3 titles", () => {
    const count = (kind: string) => SHOP_ITEMS.filter((i) => i.kind === kind).length;
    expect(count("elixir")).toBe(6);
    expect(count("aura")).toBe(6);
    expect(count("namecolor")).toBe(6);
    expect(count("title")).toBe(3);
  });

  it("returns undefined for unknown items and has unique ids", () => {
    expect(getItem("nope")).toBeUndefined();
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
  });
});

describe("elixirGrowth", () => {
  it("gives +3 to every dimension of the elixir's category", () => {
    const g = elixirGrowth(getItem("elixir_technical")!);
    const tech = DIMENSIONS.filter((d) => d.category === "Technical");
    expect(Object.keys(g)).toHaveLength(tech.length);
    expect(tech.every((d) => g[d.id] === 3)).toBe(true);
  });

  it("gives +2 to all 50 dimensions for the grand elixir", () => {
    const g = elixirGrowth(getItem("elixir_grand")!);
    expect(Object.keys(g)).toHaveLength(50);
    expect(Object.values(g).every((v) => v === 2)).toBe(true);
  });
});

describe("gear", () => {
  it("costs 20 + 10 per level, with no cap", () => {
    expect(gearUpgradeCost(1)).toBe(30);
    expect(gearUpgradeCost(10)).toBe(120);
    expect(gearUpgradeCost(500)).toBe(5020);
  });

  it("maps levels to tiers", () => {
    expect([0, 1, 4, 5, 9, 10, 19, 20, 99].map(gearTier)).toEqual([null, "bronze", "bronze", "silver", "silver", "gold", "gold", "mythic", "mythic"]);
  });

  it("computes battle bonuses per slot", () => {
    expect(gearBonus("future", { weapon: 2, armor: 3, relic: 4 })).toEqual({
      catAvg: { Physical: 3, Technical: 9, Mental: 3, Spiritual: 3, Social: 7 },
      speed: 8,
    });
    expect(gearBonus("medieval", {})).toEqual({ catAvg: { Physical: 0, Technical: 0, Mental: 0, Spiritual: 0, Social: 0 }, speed: 0 });
  });
});
