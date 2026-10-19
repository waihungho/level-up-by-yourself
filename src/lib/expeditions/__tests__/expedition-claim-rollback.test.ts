import { describe, it, expect, beforeEach, vi } from "vitest";
import { getOrCreatePlayer, getPlayerAgents } from "@/lib/db";
import { resetPassXpMemory } from "@/lib/pass/xp";
import { getGemBalance } from "@/lib/shop/gems";
import { applyGrowthAtomic } from "@/lib/shop/shop-db";
import { resetShopMemory } from "@/lib/shop/shop-memory";
import { claimExpedition, startExpedition } from "../expedition-service";
import { expeditionMem, resetExpeditionMemory } from "../expedition-db";

vi.mock("@/lib/shop/shop-db", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/shop/shop-db")>();
  return { ...real, applyGrowthAtomic: vi.fn(real.applyGrowthAtomic) };
});

const t0 = new Date("2026-10-20T10:00:00Z");
const at = (h: number) => ({ now: () => new Date(t0.getTime() + h * 3_600_000) });

beforeEach(() => {
  resetExpeditionMemory();
  resetShopMemory();
  resetPassXpMemory();
});

describe("claimExpedition when a grant fails (demo-mode equivalent of the claim transaction)", () => {
  it("applies nothing, leaves the expedition unclaimed, and a retry grants everything exactly once", async () => {
    const wallet = "exp-rb-" + crypto.randomUUID();
    const playerId = (await getOrCreatePlayer(wallet)).id;
    const agentId = (await getPlayerAgents(playerId))[0].id;
    const started = await startExpedition({ walletAddress: wallet, agentId, duration: 8 }, at(0));
    const id = (started.body.expedition as { id: string }).id;

    vi.mocked(applyGrowthAtomic).mockRejectedValueOnce(new Error("db down"));
    await expect(claimExpedition({ walletAddress: wallet, expeditionId: id }, at(8))).rejects.toThrow("db down");
    expect(expeditionMem.rows[0].claimedAt).toBeNull();
    expect(await getGemBalance(playerId)).toBe(0);

    const retry = await claimExpedition({ walletAddress: wallet, expeditionId: id }, at(9));
    expect(retry.status).toBe(200);
    expect(await getGemBalance(playerId)).toBe(3);
    expect(vi.mocked(applyGrowthAtomic)).toHaveBeenCalledTimes(2);
  });
});
