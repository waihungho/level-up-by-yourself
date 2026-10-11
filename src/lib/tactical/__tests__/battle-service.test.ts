import { describe, it, expect, beforeEach } from "vitest";
import { getOrCreatePlayer, getPlayerAgents, getBattleLogs, getPvpStatsForAgents } from "@/lib/db";
import { startBattle, takeTurn, getSessionView, finalizeSession, sweepStaleSessions, type ServiceDeps } from "../battle-service";
import { MemorySessionStore } from "../session-store";
import { mulberry32 } from "../rng";
import { runAuto } from "../engine";
import type { TacticalState } from "../types";

let deps: ServiceDeps;
let wallet: string;
let agentIds: string[];
let otherWallet: string;
let otherAgentIds: string[];

beforeEach(async () => {
  deps = { store: new MemorySessionStore(), rng: mulberry32(1) };
  wallet = "wallet-" + crypto.randomUUID();
  otherWallet = "wallet-" + crypto.randomUUID();
  const p = await getOrCreatePlayer(wallet); // demo mode seeds 10 agents
  const o = await getOrCreatePlayer(otherWallet);
  agentIds = (await getPlayerAgents(p.id)).map((a) => a.id);
  otherAgentIds = (await getPlayerAgents(o.id)).map((a) => a.id);
});

function training(agentIndex = 0, opponentIndex = 1) {
  return startBattle({ mode: "training", agentId: agentIds[agentIndex], opponentAgentId: agentIds[opponentIndex], walletAddress: wallet }, deps);
}

async function finish(sessionId: string, round: number) {
  return takeTurn({ sessionId, walletAddress: wallet, round, action: { type: "auto" } }, deps);
}

describe("startBattle", () => {
  it("starts a training battle between two owned agents", async () => {
    const r = await training();
    expect(r.status).toBe(200);
    expect(r.body.sessionId).toBeTruthy();
    expect((r.body.state as TacticalState).round).toBe(0);
  });

  it("rejects missing fields and unknown modes", async () => {
    expect((await startBattle({ mode: "training" }, deps)).status).toBe(400);
    expect((await startBattle({ mode: "nope", agentId: agentIds[0], walletAddress: wallet }, deps)).body.error).toBe("invalid_mode");
  });

  it("rejects an agent the wallet does not own", async () => {
    const r = await startBattle({ mode: "pvp", agentId: otherAgentIds[0], walletAddress: wallet }, deps);
    expect(r.status).toBe(403);
  });

  it("rejects a training opponent the wallet does not own", async () => {
    const r = await startBattle({ mode: "training", agentId: agentIds[0], opponentAgentId: otherAgentIds[0], walletAddress: wallet }, deps);
    expect(r.status).toBe(403);
  });

  it("rejects training an agent against itself", async () => {
    expect((await training(0, 0)).status).toBe(400);
  });

  it("enforces 3 training fights per agent, counting fights at start", async () => {
    for (const opp of [1, 2, 3]) {
      const r = await training(0, opp);
      expect(r.status).toBe(200);
      await finish(r.body.sessionId as string, 0);
    }
    const r = await training(0, 4);
    expect(r.status).toBe(429);
    expect(r.body.error).toBe("fight_limit_reached");
  });

  it("auto-resolves and logs an abandoned session when the agent starts a new fight", async () => {
    await training(0, 1);
    const before = (await getBattleLogs(agentIds[0], 50)).length;
    const r = await training(0, 2);
    expect(r.status).toBe(200);
    expect((await getBattleLogs(agentIds[0], 50)).length).toBe(before + 1);
    expect(await deps.store.findActive({ agentId: agentIds[0] })).toHaveLength(1);
  });

  it("starts a PvP battle against another player's agent", async () => {
    const r = await startBattle({ mode: "pvp", agentId: agentIds[0], walletAddress: wallet }, deps);
    expect(r.status).toBe(200);
    const defender = r.body.defender as { playerId: string };
    expect(defender.playerId).not.toBe((await getOrCreatePlayer(wallet)).id);
  });
});

describe("takeTurn", () => {
  it("applies one manual action and advances the round", async () => {
    const s = await training();
    const r = await takeTurn({ sessionId: s.body.sessionId as string, walletAddress: wallet, round: 0, action: { type: "guard" } }, deps);
    expect(r.status).toBe(200);
    expect((r.body.state as TacticalState).round).toBe(1);
    expect(r.body.rounds).toHaveLength(1);
  });

  it("rejects a stale round number", async () => {
    const s = await training();
    const id = s.body.sessionId as string;
    await takeTurn({ sessionId: id, walletAddress: wallet, round: 0, action: { type: "guard" } }, deps);
    const r = await takeTurn({ sessionId: id, walletAddress: wallet, round: 0, action: { type: "guard" } }, deps);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("stale_round");
  });

  it("applies concurrent duplicate turns exactly once", async () => {
    const s = await training();
    const id = s.body.sessionId as string;
    const turn = () => takeTurn({ sessionId: id, walletAddress: wallet, round: 0, action: { type: "guard" } }, deps);
    const results = await Promise.all([turn(), turn()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("rejects a special without enough focus", async () => {
    const s = await training();
    const r = await takeTurn({ sessionId: s.body.sessionId as string, walletAddress: wallet, round: 0, action: { type: "special" } }, deps);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("invalid_action");
  });

  it("rejects malformed actions", async () => {
    const s = await training();
    const r = await takeTurn({ sessionId: s.body.sessionId as string, walletAddress: wallet, round: 0, action: { type: "strike", category: "Fire" } }, deps);
    expect(r.body.error).toBe("invalid_action");
  });

  it("rejects turns from another wallet", async () => {
    const s = await training();
    const r = await takeTurn({ sessionId: s.body.sessionId as string, walletAddress: otherWallet, round: 0, action: { type: "guard" } }, deps);
    expect(r.status).toBe(403);
  });

  it("returns 404 for an unknown session", async () => {
    expect((await takeTurn({ sessionId: "missing", walletAddress: wallet, round: 0, action: { type: "guard" } }, deps)).status).toBe(404);
  });

  it("Auto finishes the battle, logs it once, and rejects further turns", async () => {
    const s = await training();
    const id = s.body.sessionId as string;
    const before = (await getBattleLogs(agentIds[0], 50)).length;
    const r = await finish(id, 0);
    expect(r.status).toBe(200);
    expect(r.body.finished).toBe(true);
    expect((r.body.battleLog as { tactical: boolean }).tactical).toBe(true);
    expect((await getBattleLogs(agentIds[0], 50)).length).toBe(before + 1);
    const again = await finish(id, (r.body.state as TacticalState).round);
    expect(again.status).toBe(410);
  });

  it("updates PvP win/loss stats when a PvP battle finishes", async () => {
    const s = await startBattle({ mode: "pvp", agentId: agentIds[5], walletAddress: wallet }, deps);
    await finish(s.body.sessionId as string, 0);
    const stats = await getPvpStatsForAgents([agentIds[5]]);
    expect(stats[agentIds[5]].wins + stats[agentIds[5]].losses).toBe(1);
  });
});

describe("getSessionView", () => {
  it("returns the state to its owner only", async () => {
    const s = await training();
    const id = s.body.sessionId as string;
    expect((await getSessionView({ sessionId: id, walletAddress: wallet }, deps)).status).toBe(200);
    expect((await getSessionView({ sessionId: id, walletAddress: otherWallet }, deps)).status).toBe(403);
  });
});

describe("finalisation robustness", () => {
  it("persists a battle once even when two finalisations race on an already-finished state", async () => {
    const s = await training(0, 1);
    const session = (await deps.store.get<TacticalState>(s.body.sessionId as string))!;
    // The window between takeTurn storing the finished state and finalising it.
    const done = runAuto(session.state, mulberry32(4));
    await deps.store.updateState(session.id, 0, done);
    const finished = { ...session, state: done };
    const before = (await getBattleLogs(agentIds[0], 50)).length;
    await Promise.all([finalizeSession(finished, deps), finalizeSession(finished, deps)]);
    expect((await getBattleLogs(agentIds[0], 50)).length).toBe(before + 1);
  });

  it("returns the stored result to a client that lost the final response", async () => {
    const s = await training();
    const id = s.body.sessionId as string;
    await finish(id, 0);
    const view = await getSessionView({ sessionId: id, walletAddress: wallet }, deps);
    expect(view.body.status).toBe("finished");
    expect((view.body.result as { battleLog?: { tactical: boolean } }).battleLog?.tactical).toBe(true);
  });

  it("stamps a battle log with the session's start time, not the time it was resolved", async () => {
    const s = await training(0, 1);
    const session = (await deps.store.get<TacticalState>(s.body.sessionId as string))!;
    await new Promise((r) => setTimeout(r, 15));
    await training(0, 2); // resolves the abandoned session
    const logs = await getBattleLogs(agentIds[0], 50);
    expect(logs.some((l) => l.createdAt === session.createdAt)).toBe(true);
  });

  it("does not let concurrent starts exceed the daily limit", async () => {
    for (const opp of [1, 2]) {
      const r = await training(0, opp);
      await finish(r.body.sessionId as string, 0);
    }
    const results = await Promise.all([training(0, 3), training(0, 4)]);
    expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
  });

  it("sweeps abandoned sessions older than the cutoff", async () => {
    const s = await training(0, 1);
    const before = (await getBattleLogs(agentIds[0], 50)).length;
    const swept = await sweepStaleSessions(new Date(Date.now() + 1000).toISOString(), deps);
    expect(swept).toBe(1);
    expect((await deps.store.get(s.body.sessionId as string))?.status).toBe("finished");
    expect((await getBattleLogs(agentIds[0], 50)).length).toBe(before + 1);
  });
});
