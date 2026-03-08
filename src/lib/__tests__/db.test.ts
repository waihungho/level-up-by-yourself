import { describe, it, expect } from "vitest";
import {
  getOrCreatePlayer,
  getPlayerAgents,
} from "../db";

describe("db (demo mode — no Supabase)", () => {
  it("creates a player from wallet address", async () => {
    const player = await getOrCreatePlayer("TestWalletAddress123");
    expect(player).toBeDefined();
    expect(player.walletAddress).toBe("TestWalletAddress123");
    expect(player.abilityScore).toBe(0);
  });

  it("returns same player for same wallet", async () => {
    const a = await getOrCreatePlayer("SameWallet");
    const b = await getOrCreatePlayer("SameWallet");
    expect(a.id).toBe(b.id);
  });

  it("returns empty agents for new player", async () => {
    const player = await getOrCreatePlayer("TestWallet2");
    const agents = await getPlayerAgents(player.id);
    expect(agents).toEqual([]);
  });
});
