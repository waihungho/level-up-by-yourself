import { describe, it, expect, beforeEach } from "vitest";
import { applyGems, getGemBalance, InsufficientGemsError, resetShopMemory } from "../gems";

beforeEach(() => resetShopMemory());

describe("gem wallet", () => {
  it("starts at zero and credits gems", async () => {
    expect(await getGemBalance("p1")).toBe(0);
    expect(await applyGems({ playerId: "p1", delta: 110, reason: "pack", ref: "pack:sig1" })).toEqual({ balance: 110, applied: true });
    expect(await getGemBalance("p1")).toBe(110);
  });

  it("applies each ref only once", async () => {
    await applyGems({ playerId: "p1", delta: 50, reason: "pack", ref: "pack:sig1" });
    expect(await applyGems({ playerId: "p1", delta: 50, reason: "pack", ref: "pack:sig1" })).toEqual({ balance: 50, applied: false });
    expect(await getGemBalance("p1")).toBe(50);
  });

  it("refuses a spend that would go below zero and keeps the balance", async () => {
    await applyGems({ playerId: "p1", delta: 30, reason: "pack", ref: "pack:a" });
    await expect(applyGems({ playerId: "p1", delta: -40, reason: "buy", ref: "buy:x" })).rejects.toBeInstanceOf(InsufficientGemsError);
    expect(await getGemBalance("p1")).toBe(30);
  });

  it("never goes negative when spends race", async () => {
    await applyGems({ playerId: "p1", delta: 50, reason: "pack", ref: "pack:a" });
    const results = await Promise.allSettled([
      applyGems({ playerId: "p1", delta: -40, reason: "buy", ref: "buy:1" }),
      applyGems({ playerId: "p1", delta: -40, reason: "buy", ref: "buy:2" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await getGemBalance("p1")).toBe(10);
  });

  it("keeps balances per player", async () => {
    await applyGems({ playerId: "p1", delta: 50, reason: "pack", ref: "pack:a" });
    expect(await getGemBalance("p2")).toBe(0);
  });
});
