// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import bs58 from "bs58";
import { Keypair, Transaction } from "@solana/web3.js";
import { getOrCreatePlayer, getPlayerAgents } from "@/lib/db";
import { getPassXp, resetPassXpMemory } from "@/lib/pass/xp";
import { seasonOf, XP } from "@/lib/pass/season";
import { blinkMemo } from "@/lib/payment-memos";
import { mulberry32 } from "@/lib/tactical/rng";
import { MEMO_PROGRAM_ID } from "@/lib/sol-payment";
import { utcToday } from "@/lib/time";
import { buildChallengeTx, DEFENDER_XP_DAILY_CAP, getChallengeAction, resolveChallenge, type BlinkDeps } from "../challenge-service";
import { BLINK_DAILY_LIMIT, blinkMem, getAgentRecord, getRecentChallenges, recordChallenge, resetBlinkMemory, type NewChallenge } from "../challenge-db";
import type { MemoTxStatus } from "../verify-memo";
import { strongestAgent } from "@/lib/squads";

vi.mock("@/lib/squads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/squads")>();
  return { ...actual, strongestAgent: vi.fn(actual.strongestAgent) };
});

const ORIGIN = "https://levelup.test";
const BLOCKHASH = Keypair.generate().publicKey.toBase58();

let ownerWallet: string;
let ownerId: string;
let agentId: string;
let otherAgentIds: string[];

const newWallet = () => Keypair.generate().publicKey.toBase58();
const sig = () => bs58.encode(crypto.getRandomValues(new Uint8Array(64)));
/** A wallet that belongs to a registered player with agents. */
const newPlayer = async () => {
  const wallet = newWallet();
  return { wallet, id: (await getOrCreatePlayer(wallet)).id };
};

type TestDeps = BlinkDeps & { verifyTx: ReturnType<typeof vi.fn> };
function deps(status: MemoTxStatus = "ok", overrides: Partial<BlinkDeps> = {}): TestDeps {
  return { latestBlockhash: async () => BLOCKHASH, verifyTx: vi.fn(async () => status), rng: mulberry32(7), ...overrides } as TestDeps;
}

/** Body fields, untyped, for assertions. */
const body = (r: { body: object }) => r.body as Record<string, unknown>;
const records = () => blinkMem.challenges;

beforeEach(async () => {
  resetBlinkMemory();
  resetPassXpMemory();
  const owner = await newPlayer();
  ownerWallet = owner.wallet;
  ownerId = owner.id;
  agentId = (await getPlayerAgents(ownerId))[0].id;
  // A second owner's agents, for the 5-per-day wallet limit.
  const other = await getOrCreatePlayer(newWallet());
  otherAgentIds = (await getPlayerAgents(other.id)).map((a) => a.id);
});

describe("getChallengeAction", () => {
  it("returns an action with the avatar icon, fight title, role + power and one Fight link", async () => {
    const r = await getChallengeAction(agentId, ORIGIN);
    expect(r.status).toBe(200);
    expect(body(r)).toMatchObject({ type: "action", icon: `${ORIGIN}/api/agents/${agentId}/avatar`, label: "Fight ⚔" });
    expect(body(r).title).toMatch(/^Fight /);
    expect(body(r).description).toMatch(/Total Power \d+/);
    expect(body(r).links).toEqual({ actions: [{ type: "transaction", href: `${ORIGIN}/api/actions/challenge/${agentId}`, label: "Fight ⚔" }] });
  });

  it("404s an unknown agent with an action error message", async () => {
    const r = await getChallengeAction(crypto.randomUUID(), ORIGIN);
    expect(r.status).toBe(404);
    expect(body(r).message).toBeTruthy();
  });
});

describe("buildChallengeTx", () => {
  it("rejects a missing or malformed account", async () => {
    expect((await buildChallengeTx({ agentId }, ORIGIN, deps())).status).toBe(400);
    expect(await buildChallengeTx({ agentId, account: "not-a-key" }, ORIGIN, deps())).toMatchObject({ status: 400, body: { error: "invalid_account" } });
  });

  it("rejects challenging your own agent", async () => {
    expect(await buildChallengeTx({ agentId, account: ownerWallet }, ORIGIN, deps())).toMatchObject({ status: 403, body: { error: "own_agent" } });
  });

  it("returns a memo-only transaction paid by the challenger, chained to /result", async () => {
    const account = newWallet();
    const r = await buildChallengeTx({ agentId, account }, ORIGIN, deps());
    expect(r.status).toBe(200);
    expect(body(r).type).toBe("transaction");
    expect(body(r).links).toEqual({ next: { type: "post", href: `${ORIGIN}/api/actions/challenge/${agentId}/result` } });
    const tx = Transaction.from(Buffer.from(String(body(r).transaction), "base64"));
    expect(tx.feePayer?.toBase58()).toBe(account);
    expect(tx.recentBlockhash).toBe(BLOCKHASH);
    expect(tx.instructions).toHaveLength(1);
    expect(tx.instructions[0].programId.equals(MEMO_PROGRAM_ID)).toBe(true);
    expect(tx.instructions[0].data.toString("utf8")).toBe(blinkMemo(agentId));
  });

  it("enforces one challenge per wallet and agent per day, and 5 per wallet per day", async () => {
    const account = newWallet();
    expect((await resolveChallenge({ agentId, account, signature: sig() }, ORIGIN, deps())).status).toBe(200);
    expect(await buildChallengeTx({ agentId, account }, ORIGIN, deps())).toMatchObject({ status: 429, body: { error: "agent_limit" } });

    const wallet2 = newWallet();
    for (let i = 0; i < BLINK_DAILY_LIMIT; i++) {
      expect((await resolveChallenge({ agentId: otherAgentIds[i], account: wallet2, signature: sig() }, ORIGIN, deps())).status).toBe(200);
    }
    expect(await buildChallengeTx({ agentId, account: wallet2 }, ORIGIN, deps())).toMatchObject({ status: 429, body: { error: "daily_limit" } });
  });
});

describe("resolveChallenge validation (before any RPC call)", () => {
  it("requires account and signature", async () => {
    const d = deps();
    expect((await resolveChallenge({ agentId, account: newWallet() }, ORIGIN, d)).status).toBe(400);
    expect(d.verifyTx).not.toHaveBeenCalled();
  });

  it("rejects malformed signatures with invalid_signature", async () => {
    const d = deps();
    for (const bad of ["short", "x".repeat(88), bs58.encode(new Uint8Array(32)), 42]) {
      expect(await resolveChallenge({ agentId, account: newWallet(), signature: bad }, ORIGIN, d)).toMatchObject({ status: 400, body: { error: "invalid_signature" } });
    }
    expect(d.verifyTx).not.toHaveBeenCalled();
  });

  it("checks own agent and daily limits before touching the chain", async () => {
    const d = deps();
    expect((await resolveChallenge({ agentId, account: ownerWallet, signature: sig() }, ORIGIN, d)).status).toBe(403);
    const account = newWallet();
    await resolveChallenge({ agentId, account, signature: sig() }, ORIGIN, deps());
    expect(await resolveChallenge({ agentId, account, signature: sig() }, ORIGIN, d)).toMatchObject({ status: 429, body: { error: "agent_limit" } });
    expect(d.verifyTx).not.toHaveBeenCalled();
    expect(await getRecentChallenges(agentId)).toHaveLength(1);
  });
});

describe("resolveChallenge verification", () => {
  it("402s a transaction that was found but is invalid, asking for the memo and signer", async () => {
    const account = newWallet();
    const s = sig();
    const d = deps("invalid");
    expect(await resolveChallenge({ agentId, account, signature: s }, ORIGIN, d)).toMatchObject({ status: 402, body: { error: "payment_invalid" } });
    expect(d.verifyTx).toHaveBeenCalledWith({ signature: s, account, memo: blinkMemo(agentId) });
    expect(records()).toHaveLength(0);
  });

  it("returns a 'still confirming' completed action linking to the result page when the tx isn't found yet", async () => {
    const account = newWallet();
    const s = sig();
    const r = await resolveChallenge({ agentId, account, signature: s }, ORIGIN, deps("not_found"));
    expect(r.status).toBe(200);
    expect(body(r).type).toBe("completed");
    expect(body(r).title).toMatch(/still confirming/i);
    expect(String(body(r).description)).toContain(`${ORIGIN}/challenge/${agentId}?sig=${s}&account=${account}`);
    expect(records()).toHaveLength(0);
    // Later (e.g. from the result page) the same call resolves the fight.
    expect(body(await resolveChallenge({ agentId, account, signature: s }, ORIGIN, deps())).title).toMatch(/Victory|Defeat/);
  });

  it("503s when the RPC fails", async () => {
    expect(await resolveChallenge({ agentId, account: newWallet(), signature: sig() }, ORIGIN, deps("rpc_error"))).toMatchObject({
      status: 503,
      body: { error: "rpc_unavailable" },
    });
  });
});

describe("resolveChallenge battle and records", () => {
  it("runs an exhibition battle with a guest fighter for unknown wallets and returns a completed action", async () => {
    const account = newWallet();
    const r = await resolveChallenge({ agentId, account, signature: sig() }, ORIGIN, deps());
    expect(r.status).toBe(200);
    expect(body(r)).toMatchObject({ type: "completed", icon: `${ORIGIN}/api/agents/${agentId}/avatar`, label: "Play Level Up on Seeker" });
    expect(String(body(r).title)).toMatch(/Victory|Defeat/);
    expect(String(body(r).description)).toMatch(/\d+ damage/);
    expect(String(body(r).description)).toMatch(/\d+ rounds?/);
    expect(records()[0]).toMatchObject({ challengerWallet: account, challengerPlayerId: null, defenderPlayerId: ownerId });
    expect(records()[0].summary).toMatchObject({ challengerName: "Guest", challengerAgentId: null });
  });

  it("uses the challenger's strongest agent when the wallet belongs to a player", async () => {
    const challenger = await newPlayer();
    expect((await resolveChallenge({ agentId, account: challenger.wallet, signature: sig() }, ORIGIN, deps())).status).toBe(200);
    expect(records()[0].challengerPlayerId).toBe(challenger.id);
    expect(records()[0].summary.challengerName).not.toBe("Guest");
    expect(records()[0].summary.challengerAgentId).toBeTruthy();
  });

  it("uses the guest fighter (and no agent id) for a player without agents", async () => {
    const wallet = newWallet();
    const player = await getOrCreatePlayer(wallet);
    vi.mocked(strongestAgent).mockResolvedValueOnce(null);
    expect((await resolveChallenge({ agentId, account: wallet, signature: sig() }, ORIGIN, deps())).status).toBe(200);
    expect(records()[0].challengerPlayerId).toBe(player.id);
    expect(records()[0].summary).toMatchObject({ challengerName: "Guest", challengerAgentId: null });
  });

  it("replaying a signature returns the stored result without a second battle", async () => {
    const account = newWallet();
    const s = sig();
    const first = await resolveChallenge({ agentId, account, signature: s }, ORIGIN, deps("ok", { rng: mulberry32(1) }));
    const d = deps("ok", { rng: mulberry32(999) });
    expect(await resolveChallenge({ agentId, account, signature: s }, ORIGIN, d)).toEqual(first);
    expect(d.verifyTx).not.toHaveBeenCalled();
    expect(records()).toHaveLength(1);
  });

  it("rejects a signature replayed against another agent", async () => {
    const account = newWallet();
    const s = sig();
    await resolveChallenge({ agentId, account, signature: s }, ORIGIN, deps());
    expect(await resolveChallenge({ agentId: otherAgentIds[0], account, signature: s }, ORIGIN, deps())).toMatchObject({
      status: 409,
      body: { error: "signature_used" },
    });
  });

  it("counts the defender's win/loss record and lists recent challenges without ids or full wallets", async () => {
    const wallets = [newWallet(), newWallet(), newWallet()];
    for (const [i, w] of wallets.entries()) await resolveChallenge({ agentId, account: w, signature: sig() }, ORIGIN, deps("ok", { rng: mulberry32(i) }));
    const rec = await getAgentRecord(agentId);
    expect(rec.wins + rec.losses).toBe(3);
    const recent = await getRecentChallenges(agentId);
    expect(recent).toHaveLength(3);
    expect(recent[0].challengerLabel).toBe(`${wallets[2].slice(0, 4)}…${wallets[2].slice(-4)}`);
    expect(Object.keys(recent[0])).not.toEqual(expect.arrayContaining(["challengerPlayerId"]));
    expect(JSON.stringify(recent)).not.toContain(wallets[2]);
  });
});

describe("recordChallenge (atomic limits, memory equivalent of levelup_blink_record_challenge)", () => {
  const base = (over: Partial<NewChallenge>): NewChallenge => ({
    agentId: "a",
    defenderPlayerId: "owner",
    challengerWallet: "w",
    challengerPlayerId: null,
    txSignature: crypto.randomUUID(),
    winner: "defender",
    summary: { challengerName: "Guest", challengerRole: "modern", challengerAgentId: null, defenderName: "D", rounds: 1, damageDealt: 0, damageTaken: 0 },
    day: utcToday(),
    ...over,
  });

  it("keeps exactly 5 of many concurrent results for one wallet and day", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => recordChallenge(base({ agentId: `agent-${i}` }))));
    expect(results.filter((r) => r.status === "ok")).toHaveLength(BLINK_DAILY_LIMIT);
    expect(results.filter((r) => r.status === "daily_limit")).toHaveLength(3);
    expect(records()).toHaveLength(BLINK_DAILY_LIMIT);
  });

  it("allows one per wallet and agent per day, and rejects duplicate signatures", async () => {
    const s = crypto.randomUUID();
    const results = await Promise.all([recordChallenge(base({ txSignature: s })), recordChallenge(base({}))]);
    expect(results.map((r) => r.status).sort()).toEqual(["agent_limit", "ok"]);
    expect((await recordChallenge(base({ agentId: "b", txSignature: s }))).status).toBe("duplicate_signature");
  });

  it("a race past the pre-check still returns 429 from resolveChallenge", async () => {
    const account = newWallet();
    const day = utcToday();
    // Five records land between this request's pre-check and its insert.
    const d = deps("ok", {
      verifyTx: vi.fn(async () => {
        for (let i = 0; i < BLINK_DAILY_LIMIT; i++) await recordChallenge(base({ challengerWallet: account, agentId: otherAgentIds[i], day }));
        return "ok" as const;
      }),
    });
    expect(await resolveChallenge({ agentId, account, signature: sig() }, ORIGIN, d)).toMatchObject({ status: 429, body: { error: "daily_limit" } });
    expect(records().filter((c) => c.challengerWallet === account)).toHaveLength(BLINK_DAILY_LIMIT);
  });
});

describe("pass XP", () => {
  it("awards the challenger (a player) and the defender's owner", async () => {
    const challenger = await newPlayer();
    await resolveChallenge({ agentId, account: challenger.wallet, signature: sig() }, ORIGIN, deps());
    const season = seasonOf();
    expect(await getPassXp(challenger.id, season)).toBe(XP.blink_challenger);
    expect(await getPassXp(ownerId, season)).toBe(XP.blink_defender);
  });

  it("gives no defender XP for guest challengers (no farming with fresh wallets)", async () => {
    await resolveChallenge({ agentId, account: newWallet(), signature: sig() }, ORIGIN, deps());
    expect(await getPassXp(ownerId, seasonOf())).toBe(0);
  });

  it("caps defender XP at 3 challenges per owner per day", async () => {
    const owned = await getPlayerAgents(ownerId);
    for (let i = 0; i < DEFENDER_XP_DAILY_CAP + 2; i++) {
      const challenger = await newPlayer();
      expect((await resolveChallenge({ agentId: owned[i].id, account: challenger.wallet, signature: sig() }, ORIGIN, deps())).status).toBe(200);
    }
    expect(await getPassXp(ownerId, seasonOf())).toBe(DEFENDER_XP_DAILY_CAP * XP.blink_defender);
  });

  it("re-runs the idempotent grants on replay, healing a failed grant without double-counting", async () => {
    const challenger = await newPlayer();
    const s = sig();
    await resolveChallenge({ agentId, account: challenger.wallet, signature: s }, ORIGIN, deps());
    resetPassXpMemory(); // as if both grants had failed
    await resolveChallenge({ agentId, account: challenger.wallet, signature: s }, ORIGIN, deps());
    await resolveChallenge({ agentId, account: challenger.wallet, signature: s }, ORIGIN, deps());
    expect(await getPassXp(challenger.id, seasonOf())).toBe(XP.blink_challenger);
    expect(await getPassXp(ownerId, seasonOf())).toBe(XP.blink_defender);
  });
});
