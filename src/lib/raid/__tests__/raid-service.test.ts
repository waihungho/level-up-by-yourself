import { describe, it, expect, beforeEach, vi } from "vitest";
import { getAllAgentsWithDimensions, getOrCreatePlayer } from "@/lib/db";
import { startBattle, takeTurn, type ServiceDeps } from "@/lib/tactical/battle-service";
import { MemorySessionStore } from "@/lib/tactical/session-store";
import { mulberry32 } from "@/lib/tactical/rng";
import { createBoss, getActiveBoss, getTrophies, resetRaidMemory, getBossById, applyRaidDamage, setBossStatus } from "../raid-db";
import { BOSSES, computeBossStats } from "../bosses";
import { getRaidView } from "../raid-service";
import type { RaidState } from "../raid-engine";
import { addAttemptBonus } from "@/lib/shop/shop-db";

const soloPlayers = new Set<string>();
vi.mock("@/lib/squads", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/squads")>();
  return { ...mod, getOrBuildSquad: async (id: string) => (soloPlayers.has(id) ? null : mod.getOrBuildSquad(id)) };
});

let deps: ServiceDeps;
let wallet: string;
let playerId: string;

async function spawn(maxHp = 10_000_000) {
  // Boss stats come from the playerbase, as the weekly cron does.
  return createBoss({ bossKey: BOSSES[0].key, weekStart: "2031-01-06", stats: computeBossStats(await getAllAgentsWithDimensions(), BOSSES[0]), maxHp });
}

beforeEach(async () => {
  resetRaidMemory();
  deps = { store: new MemorySessionStore(), rng: mulberry32(8) };
  wallet = "rs-" + crypto.randomUUID();
  playerId = (await getOrCreatePlayer(wallet)).id;
});

const start = () => startBattle({ mode: "raid", walletAddress: wallet }, deps);
const auto = (sessionId: string) => takeTurn({ sessionId, walletAddress: wallet, round: 0, action: { type: "auto" } }, deps);

describe("raid start", () => {
  it("returns 409 when no boss is active", async () => {
    const r = await start();
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("no_active_boss");
  });

  it("starts an attempt with the player's squad against the boss", async () => {
    await spawn();
    const r = await start();
    expect(r.status).toBe(200);
    const state = r.body.state as RaidState;
    expect(state.mode).toBe("raid");
    expect(state.raid.solo).toBe(false);
    expect((r.body.defenders as { name: string }[])[0].name).toBe(BOSSES[0].name);
  });

  it("allows 3 attempts per day", async () => {
    await spawn();
    for (let i = 0; i < 3; i++) {
      const r = await start();
      expect(r.status).toBe(200);
      await auto(r.body.sessionId as string);
    }
    const fourth = await start();
    expect(fourth.status).toBe(429);
    expect(fourth.body.error).toBe("raid_limit_reached");
  });

  it("sends players without a squad in solo", async () => {
    await spawn();
    soloPlayers.add(playerId);
    const r = await start();
    expect((r.body.state as RaidState).raid.solo).toBe(true);
    expect((r.body.state as RaidState).teams.attacker.members).toHaveLength(1);
    soloPlayers.delete(playerId);
  });
});

describe("raid finish", () => {
  it("subtracts the attempt's damage from the global HP", async () => {
    const boss = await spawn();
    const r = await start();
    const done = await auto(r.body.sessionId as string);
    expect(done.body.finished).toBe(true);
    const damage = done.body.damage as number;
    expect(damage).toBeGreaterThan(0);
    expect((await getActiveBoss())!.hpRemaining).toBe(boss.maxHp - damage);
    expect(done.body.killed).toBe(false);
  });

  it("a killing attempt defeats the boss and pays out", async () => {
    const boss = await spawn(50);
    const r = await start();
    const done = await auto(r.body.sessionId as string);
    expect(done.body.killed).toBe(true);
    expect((await getBossById(boss.id))!.status).toBe("defeated");
    const trophies = await getTrophies([playerId]);
    expect(trophies[playerId].map((t) => t.tier).sort()).toEqual(["champion", "slayer"]);
  });
});

describe("deferred payout", () => {
  it("runs the payout through deps.defer instead of inside the killing turn", async () => {
    const boss = await spawn(50);
    const deferred: (() => Promise<void>)[] = [];
    deps = { ...deps, defer: (task) => deferred.push(task) };
    const r = await start();
    const done = await auto(r.body.sessionId as string);
    expect(done.body.killed).toBe(true);
    expect((await getBossById(boss.id))!.paidOutAt).toBeNull();
    expect(deferred).toHaveLength(2); // payout + Season Pass XP, both after the response
    await Promise.all(deferred.map((task) => task()));
    expect((await getBossById(boss.id))!.paidOutAt).not.toBeNull();
  });

  it("retries an unfinished payout when the raid is viewed", async () => {
    const boss = await spawn(1_000_000);
    await applyRaidDamage({ bossId: boss.id, playerId, damage: 10, bestHit: 10, counters: 0, label: "A" });
    await setBossStatus(boss.id, "expired");
    await getRaidView({ walletAddress: wallet });
    expect((await getBossById(boss.id))!.paidOutAt).not.toBeNull();
  });
});

describe("getRaidView", () => {
  it("shows the boss, my rank and attempts left", async () => {
    await spawn();
    const r = await start();
    await auto(r.body.sessionId as string);
    const view = await getRaidView({ walletAddress: wallet });
    expect(view.status).toBe(200);
    expect((view.body.boss as { status: string }).status).toBe("active");
    expect(view.body.myRank).toBe(1);
    expect(view.body.attemptsLeft).toBe(2);
    expect((view.body.recentHits as unknown[]).length).toBe(1);
    expect(view.body.phase).toBe(1);
  });

  it("reports no boss when none exists", async () => {
    const view = await getRaidView({});
    expect(view.status).toBe(200);
    expect(view.body.boss).toBeNull();
  });
});

describe("raid tickets", () => {
  it("a raid ticket allows one more attempt today", async () => {
    await spawn();
    for (let i = 0; i < 3; i++) {
      const r = await start();
      await auto(r.body.sessionId as string);
    }
    expect((await start()).status).toBe(429);
    await addAttemptBonus({ playerId, agentId: null, mode: "raid", extra: 1 });
    expect((await getRaidView({ walletAddress: wallet })).body.attemptsLeft).toBe(1);
    expect((await start()).status).toBe(200);
  });
});

describe("raid board titles", () => {
  it("includes contributors' titles in the raid view", async () => {
    const { grantTitle } = await import("@/lib/shop/shop-db");
    await spawn();
    const r = await start();
    await auto(r.body.sessionId as string);
    await grantTitle(playerId, "dragon_slayer");
    const view = await getRaidView({ walletAddress: wallet });
    expect(view.body.titles).toEqual({ [playerId]: "dragon_slayer" });
  });
});

