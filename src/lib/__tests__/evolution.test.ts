import { describe, it, expect, beforeEach } from "vitest";
import { getOrCreatePlayer, getPlayerAgents, getAgentWithDimensions, applyAgentGrowth } from "@/lib/db";
import { EVOLUTION_BONUS, EVOLVE_AT, evolutionProgress, SIGNATURE_AT, signatureMove } from "@/lib/evolution";
import { resetEvolutionMemory } from "@/lib/evolution-db";
import { evolveAgent, getEvolution } from "@/lib/evolution-service";
import { aiAction, createBattle, resolveRound, toSide } from "@/lib/tactical/engine";
import { mulberry32 } from "@/lib/tactical/rng";
import { ROLE_CATEGORY } from "@/lib/tactical/constants";
import { DIMENSIONS } from "@/lib/constants";
import { makeAgent, makeRoleAgent } from "@/lib/tactical/__tests__/fixtures";
import type { AgentWithDimensions } from "@/lib/types";

describe("signature move", () => {
  it("comes from the highest dimension at the threshold, named by its category", () => {
    const a = makeAgent("a", "future", 50);
    expect(signatureMove(a)).toBeNull();
    a.dimensions.find((d) => d.dimensionId === 42)!.value = SIGNATURE_AT; // Hacking
    a.dimensions.find((d) => d.dimensionId === 1)!.value = SIGNATURE_AT + 5; // Strength
    expect(signatureMove(a)).toEqual({ dimensionId: 1, name: "Strength Breaker", category: "Physical" });
  });

  it("renames the special in battle", () => {
    const a = makeAgent("a", "future", 50);
    a.dimensions.find((d) => d.dimensionId === 42)!.value = SIGNATURE_AT;
    expect(toSide(a).signature).toBe("Hacking Protocol");
    expect(toSide(makeAgent("b", "future", 50)).signature).toBeUndefined();
  });
});

describe("evolution in battle", () => {
  it("boosts the path's two categories by the bonus", () => {
    const base = makeAgent("a", "medieval", 100);
    const plain = toSide(base);
    const paladin = toSide({ ...base, evolution: "paladin" });
    expect(paladin.catAvg.Physical).toBeCloseTo(plain.catAvg.Physical * (1 + EVOLUTION_BONUS), 6);
    expect(paladin.catAvg.Spiritual).toBeCloseTo(plain.catAvg.Spiritual * (1 + EVOLUTION_BONUS), 6);
    expect(paladin.catAvg.Mental).toBe(plain.catAvg.Mental);
    // A path from another role does nothing.
    expect(toSide({ ...base, evolution: "archon" }).catAvg).toEqual(plain.catAvg);
  });

  it("an evolved agent with a signature move wins more, but stays beatable (52-68% on Auto)", () => {
    const rng = mulberry32(7);
    const boosted = (a: AgentWithDimensions, path: string): AgentWithDimensions => ({
      ...a,
      evolution: path,
      dimensions: a.dimensions.map((d) => (d.dimensionId === DIMENSIONS.find((x) => x.category === ROLE_CATEGORY[a.role])!.id ? { ...d, value: Math.max(d.value, SIGNATURE_AT) } : d)),
    });
    const paths = { medieval: "paladin", future: "archon", modern: "mastermind" } as const;
    let wins = 0;
    let n = 0;
    for (const role of ["medieval", "future", "modern"] as const) {
      for (let i = 0; i < 400; i++) {
        // Signature threshold reached by the boosted agent only; equal base stats otherwise.
        let s = createBattle(boosted(makeRoleAgent("a", role, 150), paths[role]), makeRoleAgent("d", role, 150), "pvp", rng);
        while (!s.finished) s = resolveRound(s, aiAction(s, rng), rng, { manual: false });
        if (s.winner === "attacker") wins++;
        n++;
      }
    }
    const rate = wins / n;
    expect(rate).toBeGreaterThanOrEqual(0.52);
    expect(rate).toBeLessThanOrEqual(0.68);
  });
});

describe("evolveAgent", () => {
  let wallet: string;
  let agentId: string;

  beforeEach(async () => {
    resetEvolutionMemory();
    wallet = "evo-" + crypto.randomUUID();
    const player = await getOrCreatePlayer(wallet);
    agentId = (await getPlayerAgents(player.id))[0].id;
  });

  async function makeReady() {
    const agent = (await getAgentWithDimensions(agentId))!;
    const cat = ROLE_CATEGORY[agent.role];
    const growth = Object.fromEntries(DIMENSIONS.filter((d) => d.category === cat).map((d) => [d.id, EVOLVE_AT]));
    await applyAgentGrowth(agentId, growth);
    expect(evolutionProgress((await getAgentWithDimensions(agentId))!).ready).toBe(true);
    return agent.role;
  }

  it("refuses until the role category averages the threshold", async () => {
    const agent = (await getAgentWithDimensions(agentId))!;
    const { EVOLUTIONS } = await import("@/lib/evolution");
    const r = await evolveAgent({ walletAddress: wallet, agentId, path: EVOLUTIONS[agent.role][0].id });
    expect(r).toMatchObject({ status: 409, body: { error: "not_ready" } });
  });

  it("evolves once along one of the role's paths", async () => {
    const role = await makeReady();
    const { EVOLUTIONS } = await import("@/lib/evolution");
    const otherRole = role === "future" ? "modern" : "future";
    expect((await evolveAgent({ walletAddress: wallet, agentId, path: EVOLUTIONS[otherRole][0].id })).body.error).toBe("invalid_path");
    const path = EVOLUTIONS[role][1].id;
    expect(await evolveAgent({ walletAddress: wallet, agentId, path })).toMatchObject({ status: 200, body: { path } });
    expect((await getEvolution(agentId)).body.path).toBe(path);
    expect((await evolveAgent({ walletAddress: wallet, agentId, path: EVOLUTIONS[role][0].id })).body.error).toBe("already_evolved");
  });

  it("rejects other players and unknown agents", async () => {
    await makeReady();
    const stranger = "evo-x-" + crypto.randomUUID();
    await getOrCreatePlayer(stranger);
    expect((await evolveAgent({ walletAddress: stranger, agentId, path: "paladin" })).status).toBe(403);
    expect((await evolveAgent({ walletAddress: wallet, agentId: "nope", path: "paladin" })).status).toBe(404);
    expect((await evolveAgent({ walletAddress: wallet, agentId })).status).toBe(400);
  });
});

describe("getEvolutions before migration 015", () => {
  it("returns no evolutions instead of failing when the table is missing", async () => {
    const { vi } = await import("vitest");
    const admin = await import("@/lib/supabase-admin");
    const missing = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { code: "PGRST205", message: "missing" } }) }) }) };
    const spy = vi.spyOn(admin, "getWriteClient").mockReturnValue(missing as never);
    const { getEvolutions } = await import("@/lib/evolution-db");
    await expect(getEvolutions(["00000000-0000-0000-0000-000000000001"])).resolves.toEqual({});
    expect(spy).toHaveBeenCalled();
    // Any other error still fails loudly.
    const broken = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { code: "57014", message: "timeout" } }) }) }) };
    spy.mockReturnValue(broken as never);
    await expect(getEvolutions(["00000000-0000-0000-0000-000000000001"])).rejects.toMatchObject({ code: "57014" });
    spy.mockRestore();
  });
});
