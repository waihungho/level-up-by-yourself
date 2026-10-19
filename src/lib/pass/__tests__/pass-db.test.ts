import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWriteClient } from "@/lib/supabase-admin";
import { claimRewards, resetPassMemory } from "../pass-db";
import { shopMem, resetShopMemory } from "@/lib/shop/shop-memory";

vi.mock("@/lib/supabase-admin", () => ({ getWriteClient: vi.fn(() => null) }));

beforeEach(() => {
  resetPassMemory();
  resetShopMemory();
  vi.mocked(getWriteClient).mockReturnValue(null);
});

const items = [
  { tier: 1, track: "free" as const, gems: 3, tickets: 0, title: null },
  { tier: 5, track: "free" as const, gems: 10, tickets: 1, title: null },
  { tier: 30, track: "premium" as const, gems: 40, tickets: 0, title: "pass_s1" },
];

describe("claimRewards", () => {
  it("claims and grants everything in one RPC call", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ claimed: [{ tier: 1, track: "free" }], balance: 3 }], error: null });
    vi.mocked(getWriteClient).mockReturnValue({ rpc } as never);
    expect(await claimRewards("p1", 1, items)).toEqual({ claimed: [{ tier: 1, track: "free" }], balance: 3 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("levelup_pass_claim", { p_player: "p1", p_season: 1, p_items: items });
  });

  it("throws when the RPC fails", async () => {
    vi.mocked(getWriteClient).mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("boom") }) } as never);
    await expect(claimRewards("p1", 1, items)).rejects.toThrow("boom");
  });

  it("memory mode: grants each new claim once, with gems, ticket and title", async () => {
    expect(await claimRewards("p1", 1, items)).toEqual({
      claimed: [
        { tier: 1, track: "free" },
        { tier: 5, track: "free" },
        { tier: 30, track: "premium" },
      ],
      balance: 53,
    });
    expect(await claimRewards("p1", 1, items)).toEqual({ claimed: [], balance: 53 });
    expect(shopMem.bonuses).toHaveLength(1);
    expect(shopMem.bonuses[0]).toMatchObject({ playerId: "p1", agentId: null, mode: "raid", extra: 1 });
    expect(shopMem.titles.get("p1")).toBe("pass_s1");
    expect(shopMem.refs.has("pass:1:5:free:p1")).toBe(true);
  });
});
