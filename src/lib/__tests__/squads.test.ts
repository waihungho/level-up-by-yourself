import { describe, it, expect, beforeEach } from "vitest";
import { getOrCreatePlayer, getPlayerAgents, getAgentWithDimensions, applyAgentGrowth } from "../db";
import {
  countSquadBattlesToday,
  eloDelta,
  findSquadOpponent,
  getOrBuildSquad,
  getRecentSquadOpponents,
  getSquad,
  getSquadLeaderboard,
  getSquadStats,
  pickSquad,
  chooseOpponent,
  recordSquadBattle,
  saveSquad,
} from "../squads";
import { mulberry32 } from "../tactical/rng";
import { makeAgent } from "../tactical/__tests__/fixtures";

let playerId: string;
let agentIds: string[];

beforeEach(async () => {
  const p = await getOrCreatePlayer("sq-" + crypto.randomUUID());
  playerId = p.id;
  agentIds = (await getPlayerAgents(p.id)).map((a) => a.id);
});

describe("saveSquad / getSquad", () => {
  it("round-trips a squad of 3 owned agents in slot order", async () => {
    await saveSquad(playerId, [agentIds[2], agentIds[0], agentIds[1]]);
    expect(await getSquad(playerId)).toEqual([agentIds[2], agentIds[0], agentIds[1]]);
  });

  it("rejects fewer than 3, duplicates, or foreign agents", async () => {
    const other = await getOrCreatePlayer("sq-other-" + crypto.randomUUID());
    const foreign = (await getPlayerAgents(other.id))[0].id;
    await expect(saveSquad(playerId, agentIds.slice(0, 2))).rejects.toThrow("invalid_squad");
    await expect(saveSquad(playerId, [agentIds[0], agentIds[0], agentIds[1]])).rejects.toThrow("invalid_squad");
    await expect(saveSquad(playerId, [agentIds[0], agentIds[1], foreign])).rejects.toThrow("invalid_squad");
  });

  it("returns null when nothing is saved", async () => {
    expect(await getSquad(playerId)).toBeNull();
  });
});

describe("pickSquad", () => {
  const agents = [makeAgent("w", "modern", 100), makeAgent("x", "modern", 300), makeAgent("y", "future", 200), makeAgent("z", "medieval", 150)];

  it("uses the saved squad when all its agents are still owned", () => {
    expect(pickSquad(agents, ["w", "z", "y"])?.map((a) => a.id)).toEqual(["w", "z", "y"]);
  });

  it("falls back to the top 3 by total stats when a saved agent is missing", () => {
    expect(pickSquad(agents, ["w", "gone", "y"])?.map((a) => a.id)).toEqual(["x", "y", "z"]);
  });

  it("returns null with fewer than 3 agents", () => {
    expect(pickSquad(agents.slice(0, 2), null)).toBeNull();
  });
});

describe("getOrBuildSquad", () => {
  it("builds a top-3 squad when none is saved", async () => {
    const squad = await getOrBuildSquad(playerId);
    expect(squad).toHaveLength(3);
    expect(squad!.every((a) => a.playerId === playerId)).toBe(true);
  });
});

describe("eloDelta", () => {
  it("gives 16 for equal ratings and less for beating a weaker player", () => {
    expect(eloDelta(1000, 1000)).toBe(16);
    expect(eloDelta(1400, 1000)).toBeLessThan(16);
    expect(eloDelta(1000, 1400)).toBeGreaterThan(16);
    expect(eloDelta(3000, 0)).toBeGreaterThanOrEqual(1);
  });
});

describe("recordSquadBattle", () => {
  it("applies equal and opposite rating changes and counts today's battles", async () => {
    const other = await getOrCreatePlayer("sq-opp-" + crypto.randomUUID());
    const before = await countSquadBattlesToday(playerId);
    const { ratingDelta } = await recordSquadBattle({
      attackerPlayerId: playerId,
      defenderPlayerId: other.id,
      winnerPlayerId: playerId,
      attackerSquad: agentIds.slice(0, 3),
      defenderSquad: [],
      rounds: [],
      manualActions: 0,
    });
    expect(ratingDelta).toBe(16);
    const stats = await getSquadStats([playerId, other.id]);
    expect(stats[playerId]).toMatchObject({ wins: 1, losses: 0, rating: 1016 });
    expect(stats[other.id]).toMatchObject({ wins: 0, losses: 1, rating: 984 });
    expect(await countSquadBattlesToday(playerId)).toBe(before + 1);
    expect(await getRecentSquadOpponents(playerId, 3)).toEqual([other.id]);
    const board = await getSquadLeaderboard(50);
    expect(board.find((r) => r.playerId === playerId)?.rating).toBe(1016);
  });
});

describe("findSquadOpponent", () => {
  it("never returns the caller and still matches a repeat opponent when it is the only option", async () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 20; i++) {
      const opp = await findSquadOpponent(playerId, 1000, rng);
      expect(opp).not.toBeNull();
      expect(opp).not.toBe(playerId);
    }
  });
});

describe("applyAgentGrowth", () => {
  it("adds growth to the agent's dimensions", async () => {
    const before = (await getAgentWithDimensions(agentIds[0]))!.dimensions.find((d) => d.dimensionId === 1)!.value;
    await applyAgentGrowth(agentIds[0], { 1: 2.5 });
    const after = (await getAgentWithDimensions(agentIds[0]))!.dimensions.find((d) => d.dimensionId === 1)!.value;
    expect(after).toBeCloseTo(before + 2.5);
  });
});

describe("chooseOpponent", () => {
  const rng = () => 0;
  it("prefers candidates within ±150 rating", () => {
    const c = [{ playerId: "far", rating: 1500 }, { playerId: "near", rating: 1100 }];
    expect(chooseOpponent(c, 1000, [], rng)).toBe("near");
  });
  it("widens the band until someone is found", () => {
    expect(chooseOpponent([{ playerId: "far", rating: 1600 }], 1000, [], rng)).toBe("far");
  });
  it("avoids recent opponents when others are in band", () => {
    const c = [{ playerId: "recent", rating: 1000 }, { playerId: "fresh", rating: 1050 }];
    expect(chooseOpponent(c, 1000, ["recent"], rng)).toBe("fresh");
  });
  it("still returns a recent opponent if they are the only option", () => {
    expect(chooseOpponent([{ playerId: "recent", rating: 1000 }], 1000, ["recent"], rng)).toBe("recent");
  });
  it("returns null with no candidates", () => {
    expect(chooseOpponent([], 1000, [], rng)).toBeNull();
  });
});
