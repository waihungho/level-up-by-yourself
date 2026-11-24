import { describe, it, expect, beforeEach, vi } from "vitest";
import { getAgentWithDimensions, getOrCreatePlayer, getPlayerByWallet } from "@/lib/db";
import { DAILY_TASKS, SUMMON_COST_SOL } from "@/lib/constants";
import { summonMemo } from "@/lib/payment-memos";
import { completeDailyTask, summon } from "@/lib/summon-service";

let wallet: string;
const form = { name: "Nova", role: "future", roleTitle: "AI Robot", character: "Calm.", objective: "Learn." };

beforeEach(async () => {
  wallet = "summon-" + crypto.randomUUID();
  await getOrCreatePlayer(wallet);
});

const noPayment = { verify: vi.fn(async () => false) };

describe("summon", () => {
  it("rolls starting stats on the server, within what a summon can produce", async () => {
    // Fields the browser might try to slip in are ignored.
    const r = await summon({ walletAddress: wallet, ...form, initialDimensions: [{ dimensionId: 1, value: 999 }] } as never, noPayment);
    expect(r.status).toBe(200);
    const agent = await getAgentWithDimensions((r.body.agent as { id: string }).id);
    expect(agent!.dimensions).toHaveLength(50);
    expect(Math.max(...agent!.dimensions.map((d) => d.value))).toBeLessThanOrEqual(32.5);
    expect(agent!.name).toBe("Nova");
  });

  it("enforces the free-summon cooldown", async () => {
    expect((await summon({ walletAddress: wallet, ...form }, noPayment)).status).toBe(200);
    expect(await summon({ walletAddress: wallet, ...form }, noPayment)).toMatchObject({ status: 429, body: { error: "cooldown" } });
  });

  it("a paid summon needs a verified payment with the wallet's summon memo", async () => {
    await summon({ walletAddress: wallet, ...form }, noPayment); // use the free one
    expect(await summon({ walletAddress: wallet, ...form, signature: "sig1" }, noPayment)).toMatchObject({ status: 402, body: { error: "payment_invalid" } });
    const verify = vi.fn(async () => true);
    expect((await summon({ walletAddress: wallet, ...form, signature: "sig2" }, { verify })).status).toBe(200);
    expect(verify).toHaveBeenCalledWith({ signature: "sig2", payer: wallet, minSol: SUMMON_COST_SOL, memo: summonMemo(wallet) });
  });

  it("validates fields before any payment check", async () => {
    const verify = vi.fn(async () => true);
    expect((await summon({ walletAddress: wallet, ...form, name: "x".repeat(31), signature: "s" }, { verify })).body.error).toBe("invalid_fields");
    expect((await summon({ walletAddress: wallet, ...form, role: "pirate" }, { verify })).body.error).toBe("invalid_role");
    expect((await summon({ walletAddress: wallet, ...form, signature: 42 }, { verify })).body.error).toBe("invalid_fields");
    expect(verify).not.toHaveBeenCalled();
    expect((await summon({ walletAddress: "nobody-" + crypto.randomUUID(), ...form }, { verify })).status).toBe(403);
  });
});

describe("completeDailyTask", () => {
  it("grants a task's points once per day and rejects unknown tasks", async () => {
    const task = DAILY_TASKS[0];
    const before = (await getPlayerByWallet(wallet))!.abilityScore;
    expect(await completeDailyTask({ walletAddress: wallet, taskName: task.name })).toMatchObject({ status: 200, body: { points: task.abilityPoints } });
    expect((await completeDailyTask({ walletAddress: wallet, taskName: task.name })).body.error).toBe("already_done");
    expect((await getPlayerByWallet(wallet))!.abilityScore).toBe(before + task.abilityPoints);
    expect((await completeDailyTask({ walletAddress: wallet, taskName: "Free Points" })).body.error).toBe("invalid_task");
  });
});
