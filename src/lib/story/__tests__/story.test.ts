import { describe, it, expect, beforeEach } from "vitest";
import { applyAgentGrowth, getAgentWithDimensions, getOrCreatePlayer, getPlayerAgents } from "@/lib/db";
import { DIMENSIONS } from "@/lib/constants";
import { activeEvents, activeEventStage, nextEvent } from "@/lib/events/calendar";
import { getGemBalance } from "@/lib/shop/gems";
import { resetShopMemory } from "@/lib/shop/shop-memory";
import { startBattle, takeTurn } from "@/lib/tactical/battle-service";
import { mulberry32 } from "@/lib/tactical/rng";
import { MemorySessionStore } from "@/lib/tactical/session-store";
import type { ServiceDeps } from "@/lib/tactical/service-common";
import { CHAPTERS, enemyAgent, STORY_STAGES, unlockedStoryStages } from "../catalog";
import { resetStoryMemory, storyMem } from "../story-db";
import { getStoryView } from "../story-service";

describe("catalog", () => {
  it("unlocks stages one at a time, in order across chapters", () => {
    expect([...unlockedStoryStages(new Set())]).toEqual(["c1s1"]);
    expect([...unlockedStoryStages(new Set(["c1s1", "c1s2"]))]).toEqual(["c1s1", "c1s2", "c1s3"]);
    const allOfC1 = new Set(CHAPTERS[0].stages.map((s) => s.id));
    expect(unlockedStoryStages(allOfC1).has("c2s1")).toBe(true);
  });

  it("gets harder stage by stage", () => {
    const powers = STORY_STAGES.map((s) => s.enemy.power);
    expect([...powers].sort((a, b) => a - b)).toEqual(powers);
  });

  it("builds a role-weighted enemy with a synthetic id", () => {
    const e = enemyAgent("c1s1", STORY_STAGES[0].enemy);
    expect(e.id).toBe("story:c1s1");
    expect(e.dimensions).toHaveLength(DIMENSIONS.length);
    const physical = e.dimensions.find((d) => d.dimensionId === 1)!.value;
    const technical = e.dimensions.find((d) => d.dimensionId === 41)!.value;
    expect(physical).toBeGreaterThan(technical); // medieval: Physical high, Technical low
  });
});

describe("seasonal calendar", () => {
  it("finds the running event, including one that spans New Year", () => {
    expect(activeEvents(new Date("2026-11-24T12:00:00Z")).map((e) => e.def.id)).toEqual(["harvest"]);
    const winter = activeEvents(new Date("2027-01-03T12:00:00Z"));
    expect(winter.map((e) => [e.def.id, e.year])).toEqual([["frostfall", 2026]]);
    expect(activeEvents(new Date("2026-09-01T00:00:00Z"))).toEqual([]);
  });

  it("names stages by year so each year's event is fresh, and closes them after the window", () => {
    const [harvest] = activeEvents(new Date("2026-11-24T00:00:00Z"));
    expect(harvest.stages.map((s) => s.id)).toEqual(["ev-harvest-2026-1", "ev-harvest-2026-2", "ev-harvest-2026-3"]);
    expect(activeEventStage("ev-harvest-2026-1", new Date("2026-11-30T23:59:00Z"))).not.toBeNull();
    expect(activeEventStage("ev-harvest-2026-1", new Date("2026-12-01T00:00:01Z"))).toBeNull();
  });

  it("knows the next event", () => {
    expect(nextEvent(new Date("2026-11-24T00:00:00Z")).def.id).toBe("frostfall");
  });
});

describe("story battles", () => {
  let wallet: string;
  let agentId: string;
  let deps: ServiceDeps;

  beforeEach(async () => {
    resetStoryMemory();
    resetShopMemory();
    wallet = "story-" + crypto.randomUUID();
    const player = await getOrCreatePlayer(wallet);
    agentId = (await getPlayerAgents(player.id))[0].id;
    deps = { store: new MemorySessionStore(), rng: mulberry32(3) };
  });

  /** Makes the agent strong enough to beat early stages on Auto. */
  async function buff(by = 200) {
    await applyAgentGrowth(agentId, Object.fromEntries(DIMENSIONS.map((d) => [d.id, by])));
  }

  async function fight(stageId: string) {
    const start = await startBattle({ mode: "story", walletAddress: wallet, agentId, stageId }, deps);
    if (start.status !== 200) return start;
    return takeTurn({ sessionId: start.body.sessionId as string, walletAddress: wallet, round: 0, action: { type: "auto" } }, deps);
  }

  it("refuses locked stages and other players' agents", async () => {
    expect(await startBattle({ mode: "story", walletAddress: wallet, agentId, stageId: "c1s2" }, deps)).toMatchObject({ status: 409, body: { error: "stage_locked" } });
    expect((await startBattle({ mode: "story", walletAddress: wallet, agentId, stageId: "nope" }, deps)).status).toBe(409);
    expect((await startBattle({ mode: "story", walletAddress: wallet, agentId }, deps)).status).toBe(400);
    const other = await getOrCreatePlayer("story-x-" + crypto.randomUUID());
    const foreign = (await getPlayerAgents(other.id))[0].id;
    expect((await startBattle({ mode: "story", walletAddress: wallet, agentId: foreign, stageId: "c1s1" }, deps)).status).toBe(403);
  });

  it("pays the first clear once, unlocks the next stage, and replays pay nothing", async () => {
    await buff();
    const before = (await getAgentWithDimensions(agentId))!.dimensions.reduce((s, d) => s + d.value, 0);
    const first = await fight("c1s1");
    expect(first.body.finished).toBe(true);
    expect(first.body.story).toMatchObject({ stageId: "c1s1", won: true, firstClear: true, gems: STORY_STAGES[0].reward.gems });
    expect((first.body.battleLog as { attackerGrowth: object }).attackerGrowth).toEqual({});
    const player = (await getOrCreatePlayer(wallet)).id;
    expect(await getGemBalance(player)).toBe(STORY_STAGES[0].reward.gems);
    const after = (await getAgentWithDimensions(agentId))!.dimensions.reduce((s, d) => s + d.value, 0);
    expect(after - before).toBeCloseTo(STORY_STAGES[0].reward.growth, 5);

    const replay = await fight("c1s1");
    expect(replay.body.story).toMatchObject({ won: true, firstClear: false, gems: 0 });
    expect(await getGemBalance(player)).toBe(STORY_STAGES[0].reward.gems);

    expect((await startBattle({ mode: "story", walletAddress: wallet, agentId, stageId: "c1s2" }, deps)).status).toBe(200);
  });

  it("a loss clears nothing", async () => {
    // Skip to the final boss with a fresh, weak agent.
    const player = (await getOrCreatePlayer(wallet)).id;
    storyMem.set(player, new Set(STORY_STAGES.slice(0, -1).map((s) => s.id)));
    const r = await fight("c3s4");
    expect(r.body.story).toMatchObject({ stageId: "c3s4", won: false, firstClear: false });
    expect(storyMem.get(player)!.has("c3s4")).toBe(false);
  });

  it("shows progress and running events in the view", async () => {
    await buff();
    await fight("c1s1");
    const view = await getStoryView({ walletAddress: wallet }, new Date("2026-11-24T12:00:00Z"));
    const stages = (view.body.chapters as { stages: { id: string; status: string }[] }[])[0].stages;
    expect(stages.slice(0, 3).map((s) => s.status)).toEqual(["cleared", "open", "locked"]);
    expect((view.body.events as { id: string }[]).map((e) => e.id)).toEqual(["harvest"]);
    expect(view.body.clearedCount).toBe(1);
  });
});
