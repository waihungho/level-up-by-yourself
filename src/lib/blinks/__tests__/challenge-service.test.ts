// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Keypair, Transaction } from "@solana/web3.js";
import { getOrCreatePlayer, getPlayerAgents } from "@/lib/db";
import { getPassXp, resetPassXpMemory } from "@/lib/pass/xp";
import { seasonOf, XP } from "@/lib/pass/season";
import { mulberry32 } from "@/lib/tactical/rng";
import { MEMO_PROGRAM_ID } from "@/lib/sol-payment";
import { buildChallengeTx, getChallengeAction, resolveChallenge, type BlinkDeps } from "../challenge-service";
import { resetBlinkMemory, getAgentRecord, getRecentChallenges } from "../challenge-read";
import { BLINK_DAILY_LIMIT } from "../challenge-db";
import { blinkMemo } from "../actions";

const ORIGIN = "https://levelup.test";
const BLOCKHASH = Keypair.generate().publicKey.toBase58();

let ownerWallet: string;
let ownerId: string;
let agentId: string;
let otherAgentIds: string[];

const newWallet = () => Keypair.generate().publicKey.toBase58();

function deps(overrides: Partial<BlinkDeps> = {}): BlinkDeps & { verifyTx: ReturnType<typeof vi.fn> } {
  return {
    latestBlockhash: async () => BLOCKHASH,
    verifyTx: vi.fn(async () => true),
    rng: mulberry32(7),
    ...overrides,
  } as BlinkDeps & { verifyTx: ReturnType<typeof vi.fn> };
}

let sigN = 0;
const sig = () => `sig-${Date.now()}-${sigN++}`;

beforeEach(async () => {
  resetBlinkMemory();
  resetPassXpMemory();
  ownerWallet = newWallet();
  ownerId = (await getOrCreatePlayer(ownerWallet)).id;
  const agents = await getPlayerAgents(ownerId);
  agentId = agents[0].id;
  // A second owner's agents, for the 5-per-day wallet limit.
  const other = await getOrCreatePlayer(newWallet());
  otherAgentIds = (await getPlayerAgents(other.id)).map((a) => a.id);
});

describe("getChallengeAction", () => {
  it("returns an action with the avatar icon, fight title, role + power and one Fight link", async () => {
    const r = await getChallengeAction(agentId, ORIGIN);
    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown> & { links: { actions: { type: string; href: string; label: string }[] } };
    expect(body.type).toBe("action");
    expect(body.icon).toBe(`${ORIGIN}/api/agents/${agentId}/avatar`);
    expect(body.title).toMatch(/^Fight /);
    expect(body.description).toMatch(/Total Power \d+/);
    expect(body.label).toBe("Fight ⚔");
    expect(body.links.actions).toEqual([{ type: "transaction", href: `${ORIGIN}/api/actions/challenge/${agentId}`, label: "Fight ⚔" }]);
  });

  it("404s an unknown agent with an action error message", async () => {
    const r = await getChallengeAction(crypto.randomUUID(), ORIGIN);
    expect(r.status).toBe(404);
    expect(r.body.message).toBeTruthy();
  });
});

describe("buildChallengeTx", () => {
  it("rejects a missing or malformed account", async () => {
    expect((await buildChallengeTx({ agentId }, ORIGIN, deps())).status).toBe(400);
    const bad = await buildChallengeTx({ agentId, account: "not-a-key" }, ORIGIN, deps());
    expect(bad).toMatchObject({ status: 400, body: { error: "invalid_account" } });
  });

  it("rejects challenging your own agent", async () => {
    const r = await buildChallengeTx({ agentId, account: ownerWallet }, ORIGIN, deps());
    expect(r).toMatchObject({ status: 403, body: { error: "own_agent" } });
  });

  it("returns a memo-only transaction paid by the challenger, chained to /result", async () => {
    const account = newWallet();
    const r = await buildChallengeTx({ agentId, account }, ORIGIN, deps());
    expect(r.status).toBe(200);
    expect(r.body.type).toBe("transaction");
    expect(r.body.links).toEqual({ next: { type: "post", href: `${ORIGIN}/api/actions/challenge/${agentId}/result` } });
    const tx = Transaction.from(Buffer.from(String(r.body.transaction), "base64"));
    expect(tx.feePayer?.toBase58()).toBe(account);
    expect(tx.recentBlockhash).toBe(BLOCKHASH);
    expect(tx.instructions).toHaveLength(1);
    expect(tx.instructions[0].programId.equals(MEMO_PROGRAM_ID)).toBe(true);
    expect(tx.instructions[0].data.toString("utf8")).toBe(blinkMemo(agentId));
  });

  it("enforces one challenge per wallet and agent per day, and 5 per wallet per day", async () => {
    const account = newWallet();
    const d = deps();
    expect((await resolveChallenge({ agentId, account, signature: sig() }, ORIGIN, d)).status).toBe(200);
    const again = await buildChallengeTx({ agentId, account }, ORIGIN, d);
    expect(again).toMatchObject({ status: 429, body: { error: "agent_limit" } });

    const wallet2 = newWallet();
    for (let i = 0; i < BLINK_DAILY_LIMIT; i++) {
      expect((await resolveChallenge({ agentId: otherAgentIds[i], account: wallet2, signature: sig() }, ORIGIN, d)).status).toBe(200);
    }
    const sixth = await buildChallengeTx({ agentId, account: wallet2 }, ORIGIN, d);
    expect(sixth).toMatchObject({ status: 429, body: { error: "daily_limit" } });
  });
});

describe("resolveChallenge", () => {
  it("requires account and signature", async () => {
    expect((await resolveChallenge({ agentId, account: newWallet() }, ORIGIN, deps())).status).toBe(400);
  });

  it("402s when the transaction does not verify, and asks for the memo, signer and signature", async () => {
    const account = newWallet();
    const s = sig();
    const d = deps({ verifyTx: vi.fn(async () => false) });
    const r = await resolveChallenge({ agentId, account, signature: s }, ORIGIN, d);
    expect(r).toMatchObject({ status: 402, body: { error: "payment_invalid" } });
    expect(d.verifyTx).toHaveBeenCalledWith({ signature: s, account, memo: blinkMemo(agentId) });
    expect(await getRecentChallenges(agentId)).toHaveLength(0);
  });

  it("runs an exhibition battle with a guest fighter for unknown wallets and returns a completed action", async () => {
    const account = newWallet();
    const r = await resolveChallenge({ agentId, account, signature: sig() }, ORIGIN, deps());
    expect(r.status).toBe(200);
    expect(r.body.type).toBe("completed");
    expect(r.body.icon).toBe(`${ORIGIN}/api/agents/${agentId}/avatar`);
    expect(String(r.body.title)).toMatch(/Victory|Defeat/);
    expect(String(r.body.description)).toMatch(/\d+ damage/);
    expect(String(r.body.description)).toMatch(/\d+ rounds?/);
    expect(r.body.label).toBe("Play Level Up on Seeker");
    const recent = await getRecentChallenges(agentId);
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ challengerWallet: account, challengerPlayerId: null });
    expect(recent[0].summary.challengerName).toBe("Guest");
  });

  it("uses the challenger's strongest agent when the wallet belongs to a player, and awards pass XP to both players", async () => {
    const challengerWallet = newWallet();
    const challenger = await getOrCreatePlayer(challengerWallet);
    const r = await resolveChallenge({ agentId, account: challengerWallet, signature: sig() }, ORIGIN, deps());
    expect(r.status).toBe(200);
    const [rec] = await getRecentChallenges(agentId);
    expect(rec.challengerPlayerId).toBe(challenger.id);
    expect(rec.summary.challengerName).not.toBe("Guest");
    const season = seasonOf();
    expect(await getPassXp(challenger.id, season)).toBe(XP.blink_challenger);
    expect(await getPassXp(ownerId, season)).toBe(XP.blink_defender);
  });

  it("gives the defender's owner XP but no challenger XP for guests", async () => {
    await resolveChallenge({ agentId, account: newWallet(), signature: sig() }, ORIGIN, deps());
    expect(await getPassXp(ownerId, seasonOf())).toBe(XP.blink_defender);
  });

  it("replaying a signature returns the stored result without a second battle", async () => {
    const account = newWallet();
    const s = sig();
    const first = await resolveChallenge({ agentId, account, signature: s }, ORIGIN, deps({ rng: mulberry32(1) }));
    const second = await resolveChallenge({ agentId, account, signature: s }, ORIGIN, deps({ rng: mulberry32(999) }));
    expect(second).toEqual(first);
    expect(await getRecentChallenges(agentId)).toHaveLength(1);
    expect(await getPassXp(ownerId, seasonOf())).toBe(XP.blink_defender);
  });

  it("rejects a signature replayed against another agent", async () => {
    const account = newWallet();
    const s = sig();
    await resolveChallenge({ agentId, account, signature: s }, ORIGIN, deps());
    const r = await resolveChallenge({ agentId: otherAgentIds[0], account, signature: s }, ORIGIN, deps());
    expect(r).toMatchObject({ status: 409, body: { error: "signature_used" } });
  });

  it("enforces own-agent and daily limits again at result time", async () => {
    expect((await resolveChallenge({ agentId, account: ownerWallet, signature: sig() }, ORIGIN, deps())).status).toBe(403);
    const account = newWallet();
    await resolveChallenge({ agentId, account, signature: sig() }, ORIGIN, deps());
    const second = await resolveChallenge({ agentId, account, signature: sig() }, ORIGIN, deps());
    expect(second).toMatchObject({ status: 429, body: { error: "agent_limit" } });
    expect(await getRecentChallenges(agentId)).toHaveLength(1);
  });

  it("counts the defender's win/loss record", async () => {
    for (let i = 0; i < 3; i++) await resolveChallenge({ agentId, account: newWallet(), signature: sig() }, ORIGIN, deps({ rng: mulberry32(i) }));
    const rec = await getAgentRecord(agentId);
    expect(rec.wins + rec.losses).toBe(3);
  });
});
