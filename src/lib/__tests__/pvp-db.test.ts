import { describe, it, expect } from "vitest";
import {
  getPvpFightsToday,
  savePvpBattleLog,
  updatePvpStats,
  getPvpStatsForAgents,
} from "../db";

// Helper: create a minimal battle log
function makePvpLog(attackerId: string, defenderId: string, winnerId: string) {
  return {
    id: crypto.randomUUID(),
    attackerId,
    defenderId,
    winnerId,
    rounds: [],
    attackerGrowth: {},
    defenderGrowth: {},
    createdAt: new Date().toISOString(),
    pvp: true as const,
  };
}

describe("PvP DB functions (demo mode)", () => {
  describe("getPvpFightsToday", () => {
    it("returns 0 when agent has no PvP fights today", async () => {
      const count = await getPvpFightsToday("agent-no-pvp");
      expect(count).toBe(0);
    });

    it("increments after a PvP battle is saved", async () => {
      const agentId = "pvp-attacker-" + crypto.randomUUID();
      const opponentId = "pvp-defender-" + crypto.randomUUID();
      const log = makePvpLog(agentId, opponentId, agentId);
      await savePvpBattleLog(log);
      const count = await getPvpFightsToday(agentId);
      expect(count).toBe(1);
    });

    it("does not count training (non-pvp) battles", async () => {
      const agentId = "training-only-" + crypto.randomUUID();
      const count = await getPvpFightsToday(agentId);
      expect(count).toBe(0);
    });
  });

  describe("updatePvpStats + getPvpStatsForAgents", () => {
    it("returns zeros for agents with no PvP history", async () => {
      const agentId = "fresh-agent-" + crypto.randomUUID();
      const stats = await getPvpStatsForAgents([agentId]);
      expect(stats[agentId]).toEqual({ agentId, wins: 0, losses: 0 });
    });

    it("records a win and a loss", async () => {
      const winnerId = "winner-" + crypto.randomUUID();
      const loserId = "loser-" + crypto.randomUUID();
      await updatePvpStats(winnerId, loserId);
      const stats = await getPvpStatsForAgents([winnerId, loserId]);
      expect(stats[winnerId].wins).toBe(1);
      expect(stats[winnerId].losses).toBe(0);
      expect(stats[loserId].wins).toBe(0);
      expect(stats[loserId].losses).toBe(1);
    });

    it("accumulates multiple wins", async () => {
      const winnerId = "multi-winner-" + crypto.randomUUID();
      const loserId1 = "loser1-" + crypto.randomUUID();
      const loserId2 = "loser2-" + crypto.randomUUID();
      await updatePvpStats(winnerId, loserId1);
      await updatePvpStats(winnerId, loserId2);
      const stats = await getPvpStatsForAgents([winnerId]);
      expect(stats[winnerId].wins).toBe(2);
    });

    it("returns stats for multiple agents in one call", async () => {
      const a = "bulk-a-" + crypto.randomUUID();
      const b = "bulk-b-" + crypto.randomUUID();
      await updatePvpStats(a, b);
      const stats = await getPvpStatsForAgents([a, b]);
      expect(Object.keys(stats)).toHaveLength(2);
    });
  });
});
