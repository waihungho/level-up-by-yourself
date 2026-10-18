import { describe, it, expect, beforeEach, vi } from "vitest";
import { getOrCreatePlayer } from "@/lib/db";
import { applyGems, getGemBalance } from "@/lib/shop/gems";
import { resetShopMemory } from "@/lib/shop/shop-memory";
import { getAttemptBonusToday, getTitles, grantTitle } from "@/lib/shop/shop-db";
import { awardPassXp } from "../xp";
import { resetPassMemory } from "../pass-db";
import { buyPremium, checkIn, claimPass, getPassView } from "../pass-service";

vi.mock("@/lib/shop/gems", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/shop/gems")>();
  return { ...mod, applyGems: vi.fn(mod.applyGems) };
});

const DAY1 = new Date("2026-10-20T08:00:00Z");
const day = (n: number) => new Date(DAY1.getTime() + n * 86_400_000);
const verified = { verify: async () => true };
const rejected = { verify: async () => false };

let wallet: string;
let playerId: string;

beforeEach(async () => {
  resetPassMemory();
  resetShopMemory();
  wallet = "pass-" + crypto.randomUUID();
  playerId = (await getOrCreatePlayer(wallet)).id;
});

async function giveXp(xp: number, now = DAY1) {
  await awardPassXp({ playerId, source: "fight", ref: "test:" + crypto.randomUUID(), xp, now });
}

describe("checkIn", () => {
  it("awards login XP once per UTC day", async () => {
    const first = await checkIn({ walletAddress: wallet }, DAY1);
    expect(first).toMatchObject({ status: 200, body: { awarded: 50, xp: 50, streak: 1 } });
    const again = await checkIn({ walletAddress: wallet }, new Date("2026-10-20T23:00:00Z"));
    expect(again).toMatchObject({ status: 200, body: { awarded: 0, xp: 50, streak: 1 } });
  });

  it("grows the streak on consecutive days and resets it after a missed day", async () => {
    await checkIn({ walletAddress: wallet }, day(0));
    expect((await checkIn({ walletAddress: wallet }, day(1))).body).toMatchObject({ awarded: 60, streak: 2 });
    expect((await checkIn({ walletAddress: wallet }, day(2))).body).toMatchObject({ awarded: 70, streak: 3 });
    expect((await checkIn({ walletAddress: wallet }, day(4))).body).toMatchObject({ awarded: 50, streak: 1 });
  });

  it("keeps the streak across seasons (XP itself resets)", async () => {
    const lastDay = new Date("2026-11-01T12:00:00Z");
    await checkIn({ walletAddress: wallet }, lastDay);
    const next = await checkIn({ walletAddress: wallet }, new Date("2026-11-02T01:00:00Z"));
    expect(next.body).toMatchObject({ awarded: 60, streak: 2, xp: 60 });
  });

  it("rejects missing wallets and unknown players", async () => {
    expect((await checkIn({}, DAY1)).status).toBe(400);
    expect((await checkIn({ walletAddress: "nobody" }, DAY1)).status).toBe(403);
  });
});

describe("getPassView", () => {
  it("shows season, xp, tier, premium, claims, streak and today's check-in", async () => {
    await checkIn({ walletAddress: wallet }, DAY1);
    await giveXp(500);
    const r = await getPassView({ walletAddress: wallet }, DAY1);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      season: 1,
      endsAt: "2026-11-02T00:00:00.000Z",
      xp: 550,
      tier: 2,
      premium: false,
      claimed: [],
      streak: 1,
      checkedInToday: true,
    });
    expect((await getPassView({ walletAddress: wallet }, day(1))).body).toMatchObject({ streak: 1, checkedInToday: false });
    expect((await getPassView({ walletAddress: wallet }, day(2))).body).toMatchObject({ streak: 0 });
  });
});

describe("claimPass", () => {
  it("claims a reached free tier once", async () => {
    await giveXp(250);
    const r = await claimPass({ walletAddress: wallet, tier: 1, track: "free" }, DAY1);
    expect(r).toMatchObject({ status: 200, body: { balance: 3, claimed: [{ tier: 1, track: "free" }] } });
    const again = await claimPass({ walletAddress: wallet, tier: 1, track: "free" }, DAY1);
    expect(again).toMatchObject({ status: 409, body: { error: "already_claimed" } });
    expect(await getGemBalance(playerId)).toBe(3);
    expect((await getPassView({ walletAddress: wallet }, DAY1)).body.claimed).toEqual(["1:free"]);
  });

  it("refuses tiers not reached yet", async () => {
    await giveXp(250);
    expect(await claimPass({ walletAddress: wallet, tier: 2, track: "free" }, DAY1)).toMatchObject({ status: 409, body: { error: "tier_locked" } });
  });

  it("refuses the premium track without premium", async () => {
    await giveXp(250);
    expect(await claimPass({ walletAddress: wallet, tier: 1, track: "premium" }, DAY1)).toMatchObject({ status: 403, body: { error: "premium_required" } });
  });

  it("validates input", async () => {
    expect((await claimPass({ walletAddress: wallet }, DAY1)).status).toBe(400);
    expect(await claimPass({ walletAddress: wallet, tier: 0, track: "free" }, DAY1)).toMatchObject({ status: 400, body: { error: "invalid_tier" } });
    expect(await claimPass({ walletAddress: wallet, tier: 1.5, track: "free" }, DAY1)).toMatchObject({ status: 400, body: { error: "invalid_tier" } });
    expect(await claimPass({ walletAddress: wallet, tier: 1, track: "gold" as never }, DAY1)).toMatchObject({ status: 400, body: { error: "invalid_track" } });
    expect((await claimPass({ walletAddress: "nobody", all: true }, DAY1)).status).toBe(403);
  });

  it("a 5th tier gives 10 gems and a raid ticket", async () => {
    await giveXp(1250);
    await claimPass({ walletAddress: wallet, tier: 5, track: "free" }, DAY1);
    expect(await getGemBalance(playerId)).toBe(10);
    expect(await getAttemptBonusToday({ playerId, mode: "raid" })).toBe(1);
  });

  it("claim all takes every reachable unclaimed tier on owned tracks", async () => {
    await giveXp(1250);
    await claimPass({ walletAddress: wallet, tier: 2, track: "free" }, DAY1);
    const r = await claimPass({ walletAddress: wallet, all: true }, DAY1);
    expect(r.status).toBe(200);
    expect((r.body.claimed as unknown[]).length).toBe(4);
    expect(await getGemBalance(playerId)).toBe(3 * 4 + 10);
    expect((await claimPass({ walletAddress: wallet, all: true }, DAY1)).body).toMatchObject({ claimed: [] });

    // Premium unlocks premium rewards for tiers already reached.
    await buyPremium({ walletAddress: wallet, signature: "sig-all" }, verified, DAY1);
    const prem = await claimPass({ walletAddress: wallet, all: true }, DAY1);
    expect((prem.body.claimed as { track: string }[]).every((c) => c.track === "premium")).toBe(true);
    expect((prem.body.claimed as unknown[]).length).toBe(5);
    expect(await getGemBalance(playerId)).toBe(22 + 12 * 4 + 40);
  });

  it("tier 30 premium grants the season title, even if the player already holds it", async () => {
    await giveXp(7500);
    await buyPremium({ walletAddress: wallet, signature: "sig-title" }, verified, DAY1);
    await grantTitle(playerId, "pass_s1");
    expect((await claimPass({ walletAddress: wallet, tier: 30, track: "premium" }, DAY1)).status).toBe(200);
    expect((await getTitles([playerId]))[playerId]).toBe("pass_s1");
  });

  it("rolls the claim back when the grant fails, so the player can retry", async () => {
    await giveXp(250);
    vi.mocked(applyGems).mockRejectedValueOnce(new Error("db down"));
    const failed = await claimPass({ walletAddress: wallet, tier: 1, track: "free" }, DAY1);
    expect(failed).toMatchObject({ status: 500, body: { error: "grant_failed" } });
    expect((await getPassView({ walletAddress: wallet }, DAY1)).body.claimed).toEqual([]);
    expect((await claimPass({ walletAddress: wallet, tier: 1, track: "free" }, DAY1)).status).toBe(200);
    expect(await getGemBalance(playerId)).toBe(3);
  });
});

describe("buyPremium", () => {
  it("verifies 0.15 SOL with the season memo and unlocks premium", async () => {
    const calls: unknown[] = [];
    const r = await buyPremium({ walletAddress: wallet, signature: "s1" }, { verify: async (x) => (calls.push(x), true) }, DAY1);
    expect(r).toMatchObject({ status: 200, body: { premium: true, season: 1 } });
    expect(calls).toEqual([{ signature: "s1", payer: wallet, minSol: 0.15, memo: "levelup:pass:1" }]);
    expect((await getPassView({ walletAddress: wallet }, DAY1)).body.premium).toBe(true);
    // Premium is per season.
    expect((await getPassView({ walletAddress: wallet }, new Date("2026-11-03T00:00:00Z"))).body.premium).toBe(false);
  });

  it("rejects an invalid payment with 402", async () => {
    expect(await buyPremium({ walletAddress: wallet, signature: "bad" }, rejected, DAY1)).toMatchObject({ status: 402, body: { error: "payment_invalid" } });
    expect((await getPassView({ walletAddress: wallet }, DAY1)).body.premium).toBe(false);
  });

  it("rejects a replayed signature with 409, also from another player", async () => {
    await buyPremium({ walletAddress: wallet, signature: "dup" }, verified, DAY1);
    expect(await buyPremium({ walletAddress: wallet, signature: "dup" }, verified, DAY1)).toMatchObject({ status: 409, body: { error: "signature_used" } });
    const other = "pass-" + crypto.randomUUID();
    await getOrCreatePlayer(other);
    expect(await buyPremium({ walletAddress: other, signature: "dup" }, verified, DAY1)).toMatchObject({ status: 409, body: { error: "signature_used" } });
    expect((await getPassView({ walletAddress: other }, DAY1)).body.premium).toBe(false);
  });

  it("rejects missing fields and unknown wallets", async () => {
    expect((await buyPremium({ walletAddress: wallet }, verified, DAY1)).status).toBe(400);
    expect((await buyPremium({ walletAddress: "nobody", signature: "x" }, verified, DAY1)).status).toBe(403);
  });
});
