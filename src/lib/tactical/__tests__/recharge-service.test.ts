import { describe, it, expect, beforeEach } from "vitest";
import { getAgentFightsToday, getOrCreatePlayer, getPlayerAgents } from "@/lib/db";
import { startBattle, takeTurn, type ServiceDeps } from "../battle-service";
import { rechargeFights } from "../recharge-service";
import { MemorySessionStore } from "../session-store";
import { mulberry32 } from "../rng";

let deps: ServiceDeps;
let wallet: string;
let agentIds: string[];
const valid = async () => true;
const invalid = async () => false;

beforeEach(async () => {
  deps = { store: new MemorySessionStore(), rng: mulberry32(5) };
  wallet = "rc-" + crypto.randomUUID();
  agentIds = (await getPlayerAgents((await getOrCreatePlayer(wallet)).id)).map((a) => a.id);
});

async function useAllFights() {
  for (const opp of [1, 2, 3]) {
    const r = await startBattle({ mode: "training", agentId: agentIds[0], opponentAgentId: agentIds[opp], walletAddress: wallet }, deps);
    await takeTurn({ sessionId: r.body.sessionId as string, walletAddress: wallet, round: 0, action: { type: "auto" } }, deps);
  }
}

describe("rechargeFights", () => {
  it("a verified payment resets the agent's training fights for the server-side limit", async () => {
    await useAllFights();
    const blocked = await startBattle({ mode: "training", agentId: agentIds[0], opponentAgentId: agentIds[4], walletAddress: wallet }, deps);
    expect(blocked.status).toBe(429);
    const r = await rechargeFights({ walletAddress: wallet, agentId: agentIds[0], signature: "sig-" + crypto.randomUUID() }, { verify: valid });
    expect(r.status).toBe(200);
    expect(await getAgentFightsToday(agentIds[0])).toBe(0);
    const again = await startBattle({ mode: "training", agentId: agentIds[0], opponentAgentId: agentIds[4], walletAddress: wallet }, deps);
    expect(again.status).toBe(200);
  });

  it("rejects a payment that does not verify", async () => {
    const r = await rechargeFights({ walletAddress: wallet, agentId: agentIds[0], signature: "sig-x" }, { verify: invalid });
    expect(r.status).toBe(402);
    expect(r.body.error).toBe("payment_invalid");
  });

  it("rejects reusing a payment signature", async () => {
    const signature = "sig-" + crypto.randomUUID();
    expect((await rechargeFights({ walletAddress: wallet, agentId: agentIds[0], signature }, { verify: valid })).status).toBe(200);
    const reuse = await rechargeFights({ walletAddress: wallet, agentId: agentIds[1], signature }, { verify: valid });
    expect(reuse.status).toBe(409);
    expect(reuse.body.error).toBe("signature_used");
  });

  it("rejects agents the wallet does not own and missing fields", async () => {
    const other = await getOrCreatePlayer("rc-o-" + crypto.randomUUID());
    const foreign = (await getPlayerAgents(other.id))[0].id;
    expect((await rechargeFights({ walletAddress: wallet, agentId: foreign, signature: "s" }, { verify: valid })).status).toBe(403);
    expect((await rechargeFights({ walletAddress: wallet, agentId: agentIds[0] }, { verify: valid })).status).toBe(400);
  });

  it("asks for a recharge payment carrying this agent's purpose memo", async () => {
    const calls: unknown[] = [];
    await rechargeFights({ walletAddress: wallet, agentId: agentIds[0], signature: "sig-memo" }, { verify: async (x) => (calls.push(x), true) });
    expect(calls).toEqual([{ signature: "sig-memo", payer: wallet, minSol: 0.05, memo: `levelup:recharge:${agentIds[0]}` }]);
  });
});
