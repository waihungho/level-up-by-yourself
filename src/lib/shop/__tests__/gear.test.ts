import { describe, it, expect, beforeEach } from "vitest";
import { getOrCreatePlayer, getPlayerAgents } from "@/lib/db";
import { resetShopMemory } from "../shop-memory";
import { getGearForAgents, upgradeGearLevel, withGear } from "../gear-db";
import { upgradeGear } from "../gear-service";
import { applyGems, getGemBalance } from "../gems";
import { makeAgent } from "@/lib/tactical/__tests__/fixtures";

beforeEach(() => resetShopMemory());

describe("gear storage", () => {
  it("starts with no gear and raises a slot one level at a time with an expected level", async () => {
    expect(await getGearForAgents(["a1"])).toEqual({ a1: {} });
    expect(await upgradeGearLevel("a1", "weapon", 0)).toBe(true);
    expect(await upgradeGearLevel("a1", "weapon", 0)).toBe(false); // stale expectation
    expect(await upgradeGearLevel("a1", "weapon", 1)).toBe(true);
    expect(await getGearForAgents(["a1", "a2"])).toEqual({ a1: { weapon: 2 }, a2: {} });
  });

  it("attaches gear to agents for battle", async () => {
    await upgradeGearLevel("x1", "armor", 0);
    const [agent] = await withGear([makeAgent("x1", "modern")]);
    expect(agent.gear).toEqual({ armor: 1 });
  });
});

describe("upgradeGear", () => {
  let wallet: string;
  let playerId: string;
  let agentId: string;
  let n = 0;
  const pid = () => `gear-${Date.now()}-${n++}`;

  beforeEach(async () => {
    wallet = "gear-" + crypto.randomUUID();
    playerId = (await getOrCreatePlayer(wallet)).id;
    agentId = (await getPlayerAgents(playerId))[0].id;
  });

  it("charges 20 + 10·N gems for level N and raises the slot", async () => {
    await applyGems({ playerId, delta: 100, reason: "t", ref: "t:" + crypto.randomUUID() });
    const r1 = await upgradeGear({ walletAddress: wallet, agentId, slot: "weapon", purchaseId: pid() });
    expect(r1).toMatchObject({ status: 200, body: { level: 1, balance: 70 } });
    const r2 = await upgradeGear({ walletAddress: wallet, agentId, slot: "weapon", purchaseId: pid() });
    expect(r2).toMatchObject({ status: 200, body: { level: 2, balance: 30 } });
  });

  it("refuses when gems are short", async () => {
    await applyGems({ playerId, delta: 10, reason: "t", ref: "t:" + crypto.randomUUID() });
    const r = await upgradeGear({ walletAddress: wallet, agentId, slot: "relic", purchaseId: pid() });
    expect(r).toMatchObject({ status: 402, body: { error: "insufficient_gems" } });
    expect(await getGemBalance(playerId)).toBe(10);
  });

  it("gives exactly one level per paid upgrade when upgrades race, refunding the loser", async () => {
    await applyGems({ playerId, delta: 100, reason: "t", ref: "t:" + crypto.randomUUID() });
    const results = await Promise.all([
      upgradeGear({ walletAddress: wallet, agentId, slot: "armor", purchaseId: pid() }),
      upgradeGear({ walletAddress: wallet, agentId, slot: "armor", purchaseId: pid() }),
    ]);
    const ok = results.filter((r) => r.status === 200);
    const levels = (await getGearForAgents([agentId]))[agentId].armor ?? 0;
    const spent = 100 - (await getGemBalance(playerId));
    expect(levels).toBe(ok.length);
    expect(spent).toBe(ok.reduce((s, r) => s + (20 + 10 * (r.body.level as number)), 0));
  });

  it("rejects unknown slots, foreign agents and repeated purchase ids", async () => {
    await applyGems({ playerId, delta: 200, reason: "t", ref: "t:" + crypto.randomUUID() });
    expect((await upgradeGear({ walletAddress: wallet, agentId, slot: "boots", purchaseId: pid() })).body.error).toBe("invalid_item");
    const other = await getOrCreatePlayer("gear-o-" + crypto.randomUUID());
    const foreign = (await getPlayerAgents(other.id))[0].id;
    expect((await upgradeGear({ walletAddress: wallet, agentId: foreign, slot: "weapon", purchaseId: pid() })).status).toBe(403);
    const id = pid();
    await upgradeGear({ walletAddress: wallet, agentId, slot: "weapon", purchaseId: id });
    const again = await upgradeGear({ walletAddress: wallet, agentId, slot: "weapon", purchaseId: id });
    expect(again.body.duplicate).toBe(true);
    expect((await getGearForAgents([agentId]))[agentId].weapon).toBe(1);
  });
});
