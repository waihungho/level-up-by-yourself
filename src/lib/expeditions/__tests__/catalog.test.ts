import { describe, it, expect } from "vitest";
import { DIMENSIONS } from "@/lib/constants";
import { mulberry32 } from "@/lib/tactical/rng";
import { EXPEDITION_DURATIONS, EXPEDITION_REWARDS, isExpeditionDuration, MAX_ACTIVE, rollReward } from "../catalog";

const categoryOf = (dimId: number) => DIMENSIONS.find((d) => d.id === dimId)!.category;
const total = (growth: Record<number, number>) => Object.values(growth).reduce((s, v) => s + v, 0);

describe("expedition catalog", () => {
  it("offers 4h, 8h and 12h with growing rewards and 3 slots", () => {
    expect(EXPEDITION_DURATIONS).toEqual([4, 8, 12]);
    expect(EXPEDITION_REWARDS[4]).toMatchObject({ growth: 0.6, gems: 1, ticketChance: 0 });
    expect(EXPEDITION_REWARDS[8]).toMatchObject({ growth: 1.2, gems: 3, ticketChance: 0 });
    expect(EXPEDITION_REWARDS[12]).toMatchObject({ growth: 2.0, gems: 5, ticketChance: 0.15 });
    expect(MAX_ACTIVE).toBe(3);
  });

  it("accepts only the listed durations", () => {
    expect(isExpeditionDuration(8)).toBe(true);
    for (const bad of [0, 6, 24, "8", null, undefined, 8.5]) expect(isExpeditionDuration(bad)).toBe(false);
  });
});

describe("rollReward", () => {
  it.each([
    [4, 0.6, 1],
    [8, 1.2, 3],
    [12, 2.0, 5],
  ] as const)("%ih splits %f growth over 2 dimensions and gives %i gems", (duration, growth, gems) => {
    const r = rollReward(duration, "modern", mulberry32(duration));
    expect(Object.keys(r.growth)).toHaveLength(2);
    expect(total(r.growth)).toBeCloseTo(growth);
    expect(r.gems).toBe(gems);
  });

  it("grows only the role's category (medieval Physical, future Technical, modern Mental)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      for (const [role, category] of [["medieval", "Physical"], ["future", "Technical"], ["modern", "Mental"]] as const) {
        const dims = Object.keys(rollReward(8, role, rng).growth).map(Number);
        expect(new Set(dims).size).toBe(2);
        for (const d of dims) expect(categoryOf(d)).toBe(category);
      }
    }
  });

  it("is deterministic for the same rng seed", () => {
    expect(rollReward(12, "future", mulberry32(42))).toEqual(rollReward(12, "future", mulberry32(42)));
  });

  it("gives a Raid Ticket only on 12h, about 15% of the time", () => {
    const rng = mulberry32(1);
    expect(Array.from({ length: 500 }, () => rollReward(4, "medieval", rng)).some((r) => r.ticket)).toBe(false);
    expect(Array.from({ length: 500 }, () => rollReward(8, "medieval", rng)).some((r) => r.ticket)).toBe(false);
    const tickets = Array.from({ length: 2000 }, () => rollReward(12, "medieval", rng)).filter((r) => r.ticket).length;
    expect(tickets / 2000).toBeGreaterThan(0.11);
    expect(tickets / 2000).toBeLessThan(0.19);
  });

  it("ticket roll uses the rng: below 0.15 wins, above loses", () => {
    expect(rollReward(12, "modern", () => 0.1).ticket).toBe(true);
    expect(rollReward(12, "modern", () => 0.5).ticket).toBe(false);
  });
});
