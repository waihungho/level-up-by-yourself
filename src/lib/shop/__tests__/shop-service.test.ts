import { describe, it, expect, beforeEach } from "vitest";
import { getAgentFightsToday, getAgentWithDimensions, getGrowthLogs, getOrCreatePlayer, getPlayerAgents, saveBattleLog } from "@/lib/db";
import { DIMENSIONS } from "@/lib/constants";
import { buyGemPack, buyItem, getShopView } from "../shop-service";
import { applyGems, getGemBalance } from "../gems";
import { resetShopMemory } from "../shop-memory";
import { getActiveGrowthBuffs, getAttemptBonusToday, getCosmetics, getTitles } from "../shop-db";

let wallet: string;
let playerId: string;
let agentIds: string[];
const verified = { verify: async () => true };
const rejected = { verify: async () => false };
let n = 0;
const pid = () => `purchase-${Date.now()}-${n++}`;

beforeEach(async () => {
  resetShopMemory();
  wallet = "shop-" + crypto.randomUUID();
  playerId = (await getOrCreatePlayer(wallet)).id;
  agentIds = (await getPlayerAgents(playerId)).map((a) => a.id);
});

async function fund(gems: number) {
  await applyGems({ playerId, delta: gems, reason: "test", ref: "test:" + crypto.randomUUID() });
}

describe("buyGemPack", () => {
  it("credits a verified pack once", async () => {
    const sig = "sig-" + crypto.randomUUID();
    const r = await buyGemPack({ walletAddress: wallet, packId: "standard", signature: sig }, verified);
    expect(r).toMatchObject({ status: 200, body: { balance: 110, gems: 110 } });
    const again = await buyGemPack({ walletAddress: wallet, packId: "standard", signature: sig }, verified);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("signature_used");
    expect(await getGemBalance(playerId)).toBe(110);
  });

  it("asks the verifier for the pack's SOL price from the buyer's wallet", async () => {
    const calls: unknown[] = [];
    await buyGemPack({ walletAddress: wallet, packId: "whale", signature: "s" }, { verify: async (x) => (calls.push(x), true) });
    expect(calls).toEqual([{ signature: "s", payer: wallet, minSol: 0.5, memo: "levelup:gems:whale" }]);
  });

  it("rejects unverified payments, unknown packs, unknown wallets and missing fields", async () => {
    expect((await buyGemPack({ walletAddress: wallet, packId: "big", signature: "x" }, rejected)).body.error).toBe("payment_invalid");
    expect((await buyGemPack({ walletAddress: wallet, packId: "mega", signature: "x" }, verified)).body.error).toBe("invalid_item");
    expect((await buyGemPack({ walletAddress: "nobody", packId: "big", signature: "x" }, verified)).status).toBe(403);
    expect((await buyGemPack({ walletAddress: wallet, packId: "big" }, verified)).status).toBe(400);
  });
});

describe("buyItem", () => {
  it("an Elixir adds +3 to each stat of its category and charges 30 gems, without touching the daily growth log", async () => {
    await fund(100);
    const dim = DIMENSIONS.find((d) => d.category === "Mental")!.id;
    const before = (await getAgentWithDimensions(agentIds[0]))!.dimensions.find((d) => d.dimensionId === dim)!.value;
    const r = await buyItem({ walletAddress: wallet, itemId: "elixir_mental", agentId: agentIds[0], purchaseId: pid() });
    expect(r).toMatchObject({ status: 200, body: { balance: 70 } });
    const after = (await getAgentWithDimensions(agentIds[0]))!.dimensions.find((d) => d.dimensionId === dim)!.value;
    expect(after - before).toBeCloseTo(3);
    // growth logs are one-per-agent-per-day (daily growth job); elixirs must not use them
    expect(await getGrowthLogs(agentIds[0])).toHaveLength(0);
  });

  it("a second Elixir on the same agent the same day also works", async () => {
    await fund(100);
    const dim = DIMENSIONS.find((d) => d.category === "Social")!.id;
    const before = (await getAgentWithDimensions(agentIds[5]))!.dimensions.find((d) => d.dimensionId === dim)!.value;
    expect((await buyItem({ walletAddress: wallet, itemId: "elixir_social", agentId: agentIds[5], purchaseId: pid() })).status).toBe(200);
    expect((await buyItem({ walletAddress: wallet, itemId: "elixir_social", agentId: agentIds[5], purchaseId: pid() })).status).toBe(200);
    const after = (await getAgentWithDimensions(agentIds[5]))!.dimensions.find((d) => d.dimensionId === dim)!.value;
    expect(after - before).toBeCloseTo(6);
  });

  it("a Training Refill is refused (and not charged) when no training fights were used today", async () => {
    await fund(40);
    const r = await buyItem({ walletAddress: wallet, itemId: "refill_training", agentId: agentIds[6], purchaseId: pid() });
    expect(r).toMatchObject({ status: 409, body: { error: "nothing_to_refill" } });
    expect(await getGemBalance(playerId)).toBe(40);
  });

  it("charges once and applies once for a repeated purchaseId", async () => {
    await fund(100);
    const id = pid();
    await buyItem({ walletAddress: wallet, itemId: "scroll_growth", agentId: agentIds[0], purchaseId: id });
    const again = await buyItem({ walletAddress: wallet, itemId: "scroll_growth", agentId: agentIds[0], purchaseId: id });
    expect(again).toMatchObject({ status: 200, body: { balance: 40, duplicate: true } });
  });

  it("refuses when gems are short and charges nothing", async () => {
    await fund(20);
    const r = await buyItem({ walletAddress: wallet, itemId: "elixir_grand", agentId: agentIds[0], purchaseId: pid() });
    expect(r).toMatchObject({ status: 402, body: { error: "insufficient_gems" } });
    expect(await getGemBalance(playerId)).toBe(20);
  });

  it("requires an owned agent for agent items", async () => {
    await fund(100);
    const other = await getOrCreatePlayer("shop-other-" + crypto.randomUUID());
    const foreign = (await getPlayerAgents(other.id))[0].id;
    expect((await buyItem({ walletAddress: wallet, itemId: "aura_ember", agentId: foreign, purchaseId: pid() })).status).toBe(403);
    expect((await buyItem({ walletAddress: wallet, itemId: "aura_ember", purchaseId: pid() })).status).toBe(400);
    expect((await buyItem({ walletAddress: wallet, itemId: "unknown", agentId: agentIds[0], purchaseId: pid() })).body.error).toBe("invalid_item");
    expect(await getGemBalance(playerId)).toBe(100);
  });

  it("a Training Scroll starts a growth buff", async () => {
    await fund(60);
    await buyItem({ walletAddress: wallet, itemId: "scroll_growth", agentId: agentIds[1], purchaseId: pid() });
    expect(await getActiveGrowthBuffs([agentIds[1]])).toEqual(new Set([agentIds[1]]));
  });

  it("a Training Refill resets today's training fights", async () => {
    await fund(40);
    const log = { id: crypto.randomUUID(), attackerId: agentIds[2], defenderId: agentIds[3], winnerId: agentIds[2], rounds: [], attackerGrowth: {}, defenderGrowth: {}, createdAt: new Date(Date.now() - 1000).toISOString() };
    await saveBattleLog(log);
    expect(await getAgentFightsToday(agentIds[2])).toBe(1);
    await buyItem({ walletAddress: wallet, itemId: "refill_training", agentId: agentIds[2], purchaseId: pid() });
    expect(await getAgentFightsToday(agentIds[2])).toBe(0);
  });

  it("PvP refills and tickets add today's bonus attempts", async () => {
    await fund(200);
    await buyItem({ walletAddress: wallet, itemId: "refill_pvp", agentId: agentIds[4], purchaseId: pid() });
    await buyItem({ walletAddress: wallet, itemId: "ticket_raid", purchaseId: pid() });
    await buyItem({ walletAddress: wallet, itemId: "ticket_squad", purchaseId: pid() });
    expect(await getAttemptBonusToday({ agentId: agentIds[4], mode: "pvp" })).toBe(3);
    expect(await getAttemptBonusToday({ playerId, mode: "raid" })).toBe(1);
    expect(await getAttemptBonusToday({ playerId, mode: "squad_pvp" })).toBe(1);
  });

  it("cosmetics and titles are applied; re-buying the current title is refused without charge", async () => {
    await fund(500);
    await buyItem({ walletAddress: wallet, itemId: "aura_void", agentId: agentIds[0], purchaseId: pid() });
    await buyItem({ walletAddress: wallet, itemId: "namecolor_rainbow", agentId: agentIds[0], purchaseId: pid() });
    await buyItem({ walletAddress: wallet, itemId: "title_whale", purchaseId: pid() });
    expect(await getCosmetics([agentIds[0]])).toEqual({ [agentIds[0]]: { aura: "void", namecolor: "rainbow" } });
    expect(await getTitles([playerId])).toEqual({ [playerId]: "whale" });
    const balance = await getGemBalance(playerId);
    const again = await buyItem({ walletAddress: wallet, itemId: "title_whale", purchaseId: pid() });
    expect(again).toMatchObject({ status: 409, body: { error: "already_owned" } });
    expect(await getGemBalance(playerId)).toBe(balance);
  });
});

describe("getShopView", () => {
  it("returns the balance, title, packs and items", async () => {
    await fund(42);
    const v = await getShopView({ walletAddress: wallet });
    expect(v.status).toBe(200);
    expect(v.body.balance).toBe(42);
    expect((v.body.items as unknown[]).length).toBeGreaterThan(20);
    expect(v.body.packs).toBeTruthy();
  });
});
