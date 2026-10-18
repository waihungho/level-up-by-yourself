import { describe, it, expect, beforeEach } from "vitest";
import { getAgentWithDimensions, getOrCreatePlayer, getPlayerAgents } from "@/lib/db";
import { passXpMem, resetPassXpMemory } from "@/lib/pass/xp";
import { XP } from "@/lib/pass/season";
import { getGemBalance } from "@/lib/shop/gems";
import { getAttemptBonusToday } from "@/lib/shop/shop-db";
import { resetShopMemory } from "@/lib/shop/shop-memory";
import { claimExpedition, getExpeditionsView, startExpedition } from "../expedition-service";
import { expeditionMem, resetExpeditionMemory } from "../expedition-db";

const HOUR = 3_600_000;
let wallet: string;
let playerId: string;
let agentIds: string[];
const t0 = new Date("2026-10-20T10:00:00Z");
const at = (h: number) => ({ now: () => new Date(t0.getTime() + h * HOUR) });
/** rng that always wins the 12h ticket roll */
const lucky = { ...at(0), rng: () => 0.05 };

beforeEach(async () => {
  resetExpeditionMemory();
  resetShopMemory();
  resetPassXpMemory();
  wallet = "exp-" + crypto.randomUUID();
  playerId = (await getOrCreatePlayer(wallet)).id;
  agentIds = (await getPlayerAgents(playerId)).map((a) => a.id);
});

async function start(agentId: string, duration: unknown = 4, deps = at(0)) {
  return startExpedition({ walletAddress: wallet, agentId, duration: duration as number }, deps);
}
const idOf = (r: { body: Record<string, unknown> }) => (r.body.expedition as { id: string }).id;

async function dimValues(agentId: string): Promise<Record<number, number>> {
  const a = await getAgentWithDimensions(agentId);
  return Object.fromEntries(a!.dimensions.map((d) => [d.dimensionId, d.value]));
}

describe("startExpedition", () => {
  it("starts an expedition that ends after its duration with the reward stored", async () => {
    const r = await start(agentIds[0], 8);
    expect(r.status).toBe(200);
    const exp = r.body.expedition as { agentId: string; durationH: number; startedAt: string; endsAt: string; reward: { gems: number } };
    expect(exp).toMatchObject({ agentId: agentIds[0], durationH: 8, startedAt: t0.toISOString() });
    expect(Date.parse(exp.endsAt) - t0.getTime()).toBe(8 * HOUR);
    expect(exp.reward.gems).toBe(3);
  });

  it("rejects missing fields and invalid durations with 400", async () => {
    expect((await startExpedition({ walletAddress: wallet, agentId: agentIds[0] }, at(0))).body.error).toBe("missing_fields");
    for (const bad of [6, 0, "12", 24]) {
      const r = await start(agentIds[0], bad);
      expect(r).toMatchObject({ status: 400, body: { error: "invalid_duration" } });
    }
  });

  it("rejects an unknown wallet or someone else's agent with 403", async () => {
    const other = await getOrCreatePlayer("exp-other-" + crypto.randomUUID());
    const theirAgent = (await getPlayerAgents(other.id))[0].id;
    expect((await start(theirAgent)).status).toBe(403);
    expect((await startExpedition({ walletAddress: "nobody", agentId: agentIds[0], duration: 4 }, at(0))).status).toBe(403);
  });

  it("refuses an agent that is already away (409), even after its expedition ended but before claim", async () => {
    await start(agentIds[0], 4);
    expect(await start(agentIds[0], 8)).toMatchObject({ status: 409, body: { error: "agent_away" } });
    expect((await start(agentIds[0], 8, at(5))).status).toBe(409);
  });

  it("allows 3 expeditions at once and refuses a 4th with 429", async () => {
    for (const id of agentIds.slice(0, 3)) expect((await start(id)).status).toBe(200);
    expect(await start(agentIds[3])).toMatchObject({ status: 429, body: { error: "expedition_limit" } });
    expect(expeditionMem.rows).toHaveLength(3);
  });

  it("frees a slot (and the agent) once an expedition is claimed", async () => {
    const ids = [];
    for (const id of agentIds.slice(0, 3)) ids.push(idOf(await start(id)));
    expect((await claimExpedition({ walletAddress: wallet, expeditionId: ids[0] }, at(4))).status).toBe(200);
    expect((await start(agentIds[3], 4, at(4))).status).toBe(200);
    expect((await start(agentIds[0], 4, at(4))).status).toBe(429);
  });

  it("cancels the newest expedition when concurrent starts overshoot the limit", async () => {
    await start(agentIds[0]);
    await start(agentIds[1]);
    const results = await Promise.all(agentIds.slice(2, 5).map((id) => start(id)));
    expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    expect(expeditionMem.rows.filter((e) => !e.claimedAt).length).toBeLessThanOrEqual(3);
  });
});

describe("claimExpedition", () => {
  it("refuses to claim before the expedition ends (409)", async () => {
    const id = idOf(await start(agentIds[0], 8));
    expect(await claimExpedition({ walletAddress: wallet, expeditionId: id }, at(7.9))).toMatchObject({ status: 409, body: { error: "not_ready" } });
  });

  it("refuses someone else's expedition (403) and an unknown one (404)", async () => {
    const id = idOf(await start(agentIds[0]));
    const other = await getOrCreatePlayer("exp-other-" + crypto.randomUUID());
    expect((await claimExpedition({ walletAddress: other.walletAddress, expeditionId: id }, at(5))).status).toBe(403);
    expect((await claimExpedition({ walletAddress: "nobody", expeditionId: id }, at(5))).status).toBe(403);
    expect((await claimExpedition({ walletAddress: wallet, expeditionId: crypto.randomUUID() }, at(5))).status).toBe(404);
    expect((await claimExpedition({ walletAddress: wallet }, at(5))).status).toBe(400);
  });

  it("grants growth, gems, a ticket and Pass XP exactly once", async () => {
    const before = await dimValues(agentIds[0]);
    const started = await startExpedition({ walletAddress: wallet, agentId: agentIds[0], duration: 12 }, lucky);
    const id = idOf(started);
    const reward = (started.body.expedition as { reward: { growth: Record<number, number>; gems: number; ticket: boolean } }).reward;
    expect(reward.ticket).toBe(true);

    const r = await claimExpedition({ walletAddress: wallet, expeditionId: id }, at(12));
    expect(r).toMatchObject({ status: 200, body: { reward: { gems: 5, ticket: true }, balance: 5 } });

    const after = await dimValues(agentIds[0]);
    for (const [dim, delta] of Object.entries(reward.growth)) expect(after[Number(dim)] - before[Number(dim)]).toBeCloseTo(delta);
    expect(await getGemBalance(playerId)).toBe(5);
    expect(await getAttemptBonusToday({ playerId, mode: "raid" })).toBe(1);
    expect(passXpMem.events.get(`exp:${id}`)).toMatchObject({ playerId, source: "expedition", xp: XP.expedition });

    const again = await claimExpedition({ walletAddress: wallet, expeditionId: id }, at(13));
    expect(again).toMatchObject({ status: 409, body: { error: "already_claimed" } });
    const twice = await dimValues(agentIds[0]);
    expect(twice).toEqual(after);
    expect(await getGemBalance(playerId)).toBe(5);
    expect(await getAttemptBonusToday({ playerId, mode: "raid" })).toBe(1);
  });

  it("concurrent claims grant once", async () => {
    const id = idOf(await start(agentIds[0], 8));
    const results = await Promise.all([1, 2, 3].map(() => claimExpedition({ walletAddress: wallet, expeditionId: id }, at(8))));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await getGemBalance(playerId)).toBe(3);
  });

  it("no ticket when the 12h roll misses", async () => {
    const id = idOf(await startExpedition({ walletAddress: wallet, agentId: agentIds[0], duration: 12 }, { ...at(0), rng: () => 0.9 }));
    await claimExpedition({ walletAddress: wallet, expeditionId: id }, at(12));
    expect(await getAttemptBonusToday({ playerId, mode: "raid" })).toBe(0);
  });
});

describe("getExpeditionsView", () => {
  it("lists open expeditions and the player's agents", async () => {
    await start(agentIds[0], 4);
    const claimed = idOf(await start(agentIds[1], 4));
    await claimExpedition({ walletAddress: wallet, expeditionId: claimed }, at(4));
    const r = await getExpeditionsView({ walletAddress: wallet });
    expect(r.status).toBe(200);
    expect((r.body.expeditions as { agentId: string }[]).map((e) => e.agentId)).toEqual([agentIds[0]]);
    expect((r.body.agents as { id: string }[]).map((a) => a.id).sort()).toEqual([...agentIds].sort());
    expect(r.body.maxActive).toBe(3);
  });

  it("requires a known wallet", async () => {
    expect((await getExpeditionsView({})).status).toBe(400);
    expect((await getExpeditionsView({ walletAddress: "nobody" })).status).toBe(403);
  });
});
