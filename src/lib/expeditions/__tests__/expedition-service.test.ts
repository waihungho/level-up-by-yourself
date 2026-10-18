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
const claim = (expeditionId: unknown, h: number, walletAddress: unknown = wallet) =>
  claimExpedition({ walletAddress, expeditionId } as Parameters<typeof claimExpedition>[0], at(h));

async function dimValues(agentId: string): Promise<Record<number, number>> {
  const a = await getAgentWithDimensions(agentId);
  return Object.fromEntries(a!.dimensions.map((d) => [d.dimensionId, d.value]));
}

describe("startExpedition", () => {
  it("starts an expedition that ends after its duration, keeping the rolled reward secret", async () => {
    const r = await start(agentIds[0], 8);
    expect(r.status).toBe(200);
    const exp = r.body.expedition as Record<string, unknown>;
    expect(exp).toMatchObject({ agentId: agentIds[0], durationH: 8, startedAt: t0.toISOString() });
    expect(Date.parse(exp.endsAt as string) - t0.getTime()).toBe(8 * HOUR);
    expect(exp).not.toHaveProperty("reward");
    expect(expeditionMem.rows[0].reward.gems).toBe(3);
  });

  it("rejects missing or non-string fields and invalid durations with 400", async () => {
    expect((await startExpedition({ walletAddress: wallet, agentId: agentIds[0] }, at(0))).body.error).toBe("missing_fields");
    const bad = { walletAddress: 123, agentId: agentIds[0], duration: 4 } as unknown as Parameters<typeof startExpedition>[0];
    expect((await startExpedition(bad, at(0))).body.error).toBe("missing_fields");
    expect((await start({ id: 1 } as unknown as string)).body.error).toBe("missing_fields");
    for (const d of [6, 0, "12", 24]) {
      expect(await start(agentIds[0], d)).toMatchObject({ status: 400, body: { error: "invalid_duration" } });
    }
  });

  it("rejects an unknown wallet, an unknown agent or someone else's agent with 403", async () => {
    const other = await getOrCreatePlayer("exp-other-" + crypto.randomUUID());
    const theirAgent = (await getPlayerAgents(other.id))[0].id;
    expect((await start(theirAgent)).status).toBe(403);
    expect((await start("not-a-uuid")).status).toBe(403);
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
    expect((await claim(ids[0], 4)).status).toBe(200);
    expect((await start(agentIds[3], 4, at(4))).status).toBe(200);
    expect((await start(agentIds[0], 4, at(4))).status).toBe(429);
  });

  it("lets exactly one of several concurrent starts take the last slot", async () => {
    await start(agentIds[0]);
    await start(agentIds[1]);
    const results = await Promise.all(agentIds.slice(2, 6).map((id) => start(id)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 429)).toHaveLength(3);
    expect(expeditionMem.rows.filter((e) => !e.claimedAt)).toHaveLength(3);
  });
});

describe("claimExpedition", () => {
  it("refuses to claim before the expedition ends (409)", async () => {
    const id = idOf(await start(agentIds[0], 8));
    expect(await claim(id, 7.9)).toMatchObject({ status: 409, body: { error: "not_ready" } });
  });

  it("refuses someone else's expedition (403), unknown or malformed ids (404) and bad fields (400)", async () => {
    const id = idOf(await start(agentIds[0]));
    const other = await getOrCreatePlayer("exp-other-" + crypto.randomUUID());
    expect((await claim(id, 5, other.walletAddress)).status).toBe(403);
    expect((await claim(id, 5, "nobody")).status).toBe(403);
    expect(await claim(crypto.randomUUID(), 5)).toMatchObject({ status: 404, body: { error: "not_found" } });
    expect(await claim("'; drop table", 5)).toMatchObject({ status: 404, body: { error: "not_found" } });
    expect(await claim({ id }, 5)).toMatchObject({ status: 404, body: { error: "not_found" } });
    expect((await claim(undefined, 5)).status).toBe(400);
    expect((await claim(id, 5, 42)).status).toBe(400);
  });

  it("grants growth, gems, a ticket and Pass XP exactly once and reports what was granted", async () => {
    const before = await dimValues(agentIds[0]);
    const id = idOf(await startExpedition({ walletAddress: wallet, agentId: agentIds[0], duration: 12 }, lucky));
    const stored = expeditionMem.rows[0].reward;
    expect(stored.ticket).toBe(true);

    const r = await claim(id, 12);
    expect(r).toMatchObject({ status: 200, body: { reward: stored, balance: 5, granted: { gems: 5, growth: stored.growth, ticket: true, xp: true } } });

    const after = await dimValues(agentIds[0]);
    for (const [dim, delta] of Object.entries(stored.growth)) expect(after[Number(dim)] - before[Number(dim)]).toBeCloseTo(delta);
    expect(await getGemBalance(playerId)).toBe(5);
    expect(await getAttemptBonusToday({ playerId, mode: "raid" })).toBe(1);
    expect(passXpMem.events.get(`exp:${id}`)).toMatchObject({ playerId, source: "expedition", xp: XP.expedition });

    expect(await claim(id, 13)).toMatchObject({ status: 409, body: { error: "already_claimed" } });
    expect(await dimValues(agentIds[0])).toEqual(after);
    expect(await getGemBalance(playerId)).toBe(5);
    expect(await getAttemptBonusToday({ playerId, mode: "raid" })).toBe(1);
  });

  it("a repeated claim by the owner re-grants missing Pass XP, never twice", async () => {
    const id = idOf(await start(agentIds[0], 4));
    await claim(id, 4);
    resetPassXpMemory(); // as if the XP grant had failed
    expect((await claim(id, 5)).status).toBe(409);
    expect(passXpMem.events.has(`exp:${id}`)).toBe(true);
    await claim(id, 6);
    expect(passXpMem.events.size).toBe(1);
  });

  it("concurrent claims grant once", async () => {
    const id = idOf(await start(agentIds[0], 8));
    const results = await Promise.all([1, 2, 3].map(() => claim(id, 8)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.body.error === "already_claimed")).toHaveLength(2);
    expect(await getGemBalance(playerId)).toBe(3);
  });

  it("no ticket when the 12h roll misses", async () => {
    const id = idOf(await startExpedition({ walletAddress: wallet, agentId: agentIds[0], duration: 12 }, { ...at(0), rng: () => 0.9 }));
    const r = await claim(id, 12);
    expect(r.body.granted).toMatchObject({ ticket: false });
    expect(await getAttemptBonusToday({ playerId, mode: "raid" })).toBe(0);
  });
});

describe("getExpeditionsView", () => {
  it("lists open expeditions (without rewards) and the player's agents", async () => {
    await start(agentIds[0], 4);
    const claimed = idOf(await start(agentIds[1], 4));
    await claim(claimed, 4);
    const r = await getExpeditionsView({ walletAddress: wallet });
    expect(r.status).toBe(200);
    const exps = r.body.expeditions as Record<string, unknown>[];
    expect(exps.map((e) => e.agentId)).toEqual([agentIds[0]]);
    expect(exps[0]).not.toHaveProperty("reward");
    const agents = r.body.agents as { id: string; spriteSeed: Record<string, number> }[];
    expect(agents.map((a) => a.id).sort()).toEqual([...agentIds].sort());
    for (const v of Object.values(agents[0].spriteSeed)) expect(typeof v).toBe("number");
    expect(r.body.maxActive).toBe(3);
    expect(r.body).not.toHaveProperty("rewards");
  });

  it("requires a known wallet", async () => {
    expect((await getExpeditionsView({})).status).toBe(400);
    expect((await getExpeditionsView({ walletAddress: "nobody" })).status).toBe(403);
  });
});
