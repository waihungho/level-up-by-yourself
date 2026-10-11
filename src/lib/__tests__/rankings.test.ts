import { describe, it, expect } from "vitest";
import { applyAgentGrowth, getAgentsWithDimensions, getOrCreatePlayer, getPlayerAgents } from "../db";
import { buildRankings } from "../rankings";
import { DIMENSIONS } from "../constants";

describe("buildRankings", () => {
  it("ranks agents by total ability with owner wallet, top category and PvP record", async () => {
    const wallet = "rank-" + crypto.randomUUID();
    const player = await getOrCreatePlayer(wallet);
    const [agent] = await getPlayerAgents(player.id);
    const technical = DIMENSIONS.filter((d) => d.category === "Technical");
    await applyAgentGrowth(agent.id, Object.fromEntries(technical.map((d) => [d.id, 10_000])));

    const rankings = await buildRankings();
    expect(rankings.top[0]).toMatchObject({
      id: agent.id,
      playerId: player.id,
      wallet,
      topCategory: "Technical",
      pvp: { agentId: agent.id, wins: 0, losses: 0 },
    });
    const totals = rankings.top.map((a) => a.totalAbility);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
    expect(rankings.totalAgents).toBeGreaterThanOrEqual(rankings.top.length);
  });
});

describe("getAgentsWithDimensions", () => {
  it("returns the requested agents in order with their dimensions, skipping unknown ids", async () => {
    const player = await getOrCreatePlayer("batch-" + crypto.randomUUID());
    const ids = (await getPlayerAgents(player.id)).map((a) => a.id).reverse();
    const fulls = await getAgentsWithDimensions([...ids, "missing"]);
    expect(fulls.map((a) => a.id)).toEqual(ids);
    expect(fulls.every((a) => a.dimensions.length === DIMENSIONS.length)).toBe(true);
  });
});
