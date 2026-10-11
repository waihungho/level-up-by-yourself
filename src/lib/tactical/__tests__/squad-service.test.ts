import { describe, it, expect, beforeEach, vi } from "vitest";
import { getOrCreatePlayer, getPlayerAgents } from "@/lib/db";
import { getSquadStats } from "@/lib/squads";
import { startBattle, takeTurn, type ServiceDeps } from "../battle-service";
import { getSquadView, putSquad } from "../squad-service";
import { MemorySessionStore } from "../session-store";
import { mulberry32 } from "../rng";
import type { SquadState } from "../squad";
import { addAttemptBonus } from "@/lib/shop/shop-db";

const noSquadPlayers = new Set<string>();
vi.mock("@/lib/squads", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/squads")>();
  return {
    ...mod,
    getOrBuildSquad: async (playerId: string) => (noSquadPlayers.has(playerId) ? null : mod.getOrBuildSquad(playerId)),
  };
});

let deps: ServiceDeps;
let wallet: string;
let playerId: string;
let agentIds: string[];

beforeEach(async () => {
  deps = { store: new MemorySessionStore(), rng: mulberry32(3) };
  wallet = "sqs-" + crypto.randomUUID();
  const p = await getOrCreatePlayer(wallet);
  playerId = p.id;
  agentIds = (await getPlayerAgents(p.id)).map((a) => a.id);
  await getOrCreatePlayer("sqs-opp-" + crypto.randomUUID());
});

const start = () => startBattle({ mode: "squad_pvp", walletAddress: wallet }, deps);

describe("squad_pvp start", () => {
  it("starts with the caller's squad against another player's squad", async () => {
    const r = await start();
    expect(r.status).toBe(200);
    const state = r.body.state as SquadState;
    expect(state.mode).toBe("squad_pvp");
    expect(state.teams.attacker.playerId).toBe(playerId);
    expect(state.teams.defender.playerId).not.toBe(playerId);
    expect(r.body.attackers).toHaveLength(3);
    expect(r.body.defenders).toHaveLength(3);
  });

  it("returns 409 no_squad for a player without 3 agents", async () => {
    noSquadPlayers.add(playerId);
    const r = await start();
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("no_squad");
    noSquadPlayers.delete(playerId);
  });

  it("allows 2 squad battles per day", async () => {
    for (let i = 0; i < 2; i++) {
      const r = await start();
      expect(r.status).toBe(200);
      await takeTurn({ sessionId: r.body.sessionId as string, walletAddress: wallet, round: 0, action: { type: "auto" } }, deps);
    }
    const third = await start();
    expect(third.status).toBe(429);
    expect(third.body.error).toBe("squad_limit_reached");
  });
});

describe("squad_pvp turns", () => {
  it("rejects swapping to a KO'd or active slot", async () => {
    const r = await start();
    const id = r.body.sessionId as string;
    const bad = await takeTurn({ sessionId: id, walletAddress: wallet, round: 0, action: { type: "swap", slot: 0 } }, deps);
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("invalid_swap");
  });

  it("accepts a valid swap", async () => {
    const r = await start();
    const ok = await takeTurn({ sessionId: r.body.sessionId as string, walletAddress: wallet, round: 0, action: { type: "swap", slot: 1 } }, deps);
    expect(ok.status).toBe(200);
    expect((ok.body.state as SquadState).teams.attacker.active).toBe(1);
  });

  it("auto finish records the battle and moves both ratings by the same amount", async () => {
    const r = await start();
    const opponentId = (r.body.state as SquadState).teams.defender.playerId;
    const before = await getSquadStats([playerId, opponentId]);
    const done = await takeTurn({ sessionId: r.body.sessionId as string, walletAddress: wallet, round: 0, action: { type: "auto" } }, deps);
    expect(done.body.finished).toBe(true);
    const delta = done.body.ratingDelta as number;
    expect(delta).toBeGreaterThan(0);
    const after = await getSquadStats([playerId, opponentId]);
    const myChange = after[playerId].rating - before[playerId].rating;
    const oppChange = after[opponentId].rating - before[opponentId].rating;
    expect(Math.abs(myChange)).toBe(delta);
    expect(myChange + oppChange).toBe(0);
    expect(done.body.growth).toBeTruthy();
  });
});

describe("squad API", () => {
  it("saves a squad and reads it back with synergy", async () => {
    const put = await putSquad({ walletAddress: wallet, agentIds: agentIds.slice(0, 3) });
    expect(put.status).toBe(200);
    const view = await getSquadView({ walletAddress: wallet });
    expect(view.status).toBe(200);
    expect((view.body.saved as string[])).toEqual(agentIds.slice(0, 3));
    expect(view.body.synergy).toBeTruthy();
    expect(view.body.battlesToday).toBe(0);
  });

  it("rejects a squad with a foreign agent", async () => {
    const other = await getOrCreatePlayer("sqs-x-" + crypto.randomUUID());
    const foreign = (await getPlayerAgents(other.id))[0].id;
    const put = await putSquad({ walletAddress: wallet, agentIds: [agentIds[0], agentIds[1], foreign] });
    expect(put.status).toBe(400);
    expect(put.body.error).toBe("invalid_squad");
  });

  it("rejects unknown wallets", async () => {
    expect((await getSquadView({ walletAddress: "nobody" })).status).toBe(403);
  });
});

describe("squad tickets", () => {
  it("a squad ticket allows one more squad battle today and shows in the view", async () => {
    for (let i = 0; i < 2; i++) {
      const r = await start();
      await takeTurn({ sessionId: r.body.sessionId as string, walletAddress: wallet, round: 0, action: { type: "auto" } }, deps);
    }
    expect((await start()).status).toBe(429);
    await addAttemptBonus({ playerId, agentId: null, mode: "squad_pvp", extra: 1 });
    expect((await getSquadView({ walletAddress: wallet })).body.maxBattles).toBe(3);
    expect((await start()).status).toBe(200);
  });
});
