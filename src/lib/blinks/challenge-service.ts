import bs58 from "bs58";
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { getAgentWithDimensions, getPlayerByWallet } from "@/lib/db";
import { awardPassXpSafe } from "@/lib/pass/xp";
import { XP } from "@/lib/pass/season";
import { blinkMemo } from "@/lib/payment-memos";
import { withGear } from "@/lib/shop/gear-db";
import { MEMO_PROGRAM_ID } from "@/lib/sol-payment";
import { strongestAgent, totalStats } from "@/lib/squads";
import { createBattle, runAuto } from "@/lib/tactical/engine";
import { defaultRng, type Rng } from "@/lib/tactical/rng";
import { utcToday } from "@/lib/time";
import type { AgentWithDimensions } from "@/lib/types";
import { actionFail, actionOk, type ActionResult } from "./actions";
import {
  BLINK_DAILY_LIMIT,
  agentsChallengedOnDay,
  defenderAwardSlot,
  getChallengeBySignature,
  recordChallenge,
  type BlinkChallenge,
  type ChallengeSummary,
} from "./challenge-db";
import { guestFighter } from "./guest";
import { agentAvatarUrl, challengeActionUrl, challengeResultPageUrl, challengeResultUrl } from "./links";
import { latestBlockhash, verifyMemoTx, type MemoTxStatus } from "./verify-memo";

/*
 * Blink challenges: anyone with a Solana wallet fights a shared agent from a Blink.
 * GET describes the action, POST returns a fee-only memo transaction (the game never moves SOL),
 * and the chained /result call verifies it on-chain and runs an exhibition auto battle (no growth,
 * rating or gems). Chain access is injected so the service is testable.
 */

export interface BlinkDeps {
  latestBlockhash: () => Promise<string>;
  verifyTx: (input: { signature: string; account: string; memo: string }) => Promise<MemoTxStatus>;
  rng: Rng;
  now?: () => Date;
}

export function blinkDeps(): BlinkDeps {
  return { latestBlockhash, verifyTx: (input) => verifyMemoTx(input), rng: defaultRng };
}

/** Defender owners earn Blink XP for at most this many challenges per UTC day. */
export const DEFENDER_XP_DAILY_CAP = 3;

const FIGHT_LABEL = "Fight ⚔";
const PLAY_LABEL = "Play Level Up on Seeker";

const notFound = () => actionFail(404, "agent_not_found", "This agent doesn't exist (anymore).");
const agentLimit = (name: string) => actionFail(429, "agent_limit", `You already fought ${name} today. Come back tomorrow (00:00 UTC).`);
const dailyLimit = () => actionFail(429, "daily_limit", `You've used all ${BLINK_DAILY_LIMIT} Blink challenges today. Come back tomorrow (00:00 UTC).`);
const signatureUsed = () => actionFail(409, "signature_used", "This transaction was already used for another challenge.");

const isPublicKey = (s: unknown): s is string => {
  if (typeof s !== "string" || !s) return false;
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
};

/** A base58 transaction signature: 64 bytes, 80–90 characters. */
const isSignature = (s: unknown): s is string => {
  if (typeof s !== "string" || s.length < 80 || s.length > 90) return false;
  try {
    return bs58.decode(s).length === 64;
  } catch {
    return false;
  }
};

/** The shared agent with gear; null for unknown agents or agents without stats. */
async function loadDefender(agentId: string): Promise<AgentWithDimensions | null> {
  if (!agentId) return null;
  const agent = await getAgentWithDimensions(agentId);
  if (!agent || agent.dimensions.length === 0) return null;
  return (await withGear([agent]))[0];
}

// ---------------------------------------------------------------------------
// GET: the action card
// ---------------------------------------------------------------------------

export async function getChallengeAction(agentId: string, origin: string): Promise<ActionResult> {
  const agent = await loadDefender(agentId);
  if (!agent) return notFound();
  return actionOk({
    type: "action",
    icon: agentAvatarUrl(origin, agent.id),
    title: `Fight ${agent.name}`,
    description: `${agent.roleTitle} · ${agent.role} · Total Power ${Math.round(totalStats(agent))}. Your strongest agent (or a guest fighter) battles it in Level Up. Exhibition fight: you only pay the network fee.`,
    label: FIGHT_LABEL,
    links: { actions: [{ type: "transaction", href: challengeActionUrl(origin, agent.id), label: FIGHT_LABEL }] },
  });
}

// ---------------------------------------------------------------------------
// Shared checks
// ---------------------------------------------------------------------------

/** Own-agent check and the cheap daily-limit pre-check (recordChallenge re-checks atomically). */
async function checkChallenger(account: string, defender: AgentWithDimensions, day: string): Promise<{ fail: ActionResult | null; playerId: string | null }> {
  const player = await getPlayerByWallet(account);
  const playerId = player?.id ?? null;
  if (playerId && playerId === defender.playerId) {
    return { fail: actionFail(403, "own_agent", "You can't challenge your own agent. Share it so others can!"), playerId };
  }
  const today = await agentsChallengedOnDay(account, day);
  if (today.includes(defender.id)) return { fail: agentLimit(defender.name), playerId };
  if (today.length >= BLINK_DAILY_LIMIT) return { fail: dailyLimit(), playerId };
  return { fail: null, playerId };
}

// ---------------------------------------------------------------------------
// POST: the memo transaction
// ---------------------------------------------------------------------------

export async function buildChallengeTx(input: { agentId: string; account?: unknown }, origin: string, deps: BlinkDeps): Promise<ActionResult> {
  if (!input.account) return actionFail(400, "missing_fields", "Connect a wallet to fight.");
  if (!isPublicKey(input.account)) return actionFail(400, "invalid_account", "That wallet address isn't valid.");
  const account = input.account;
  const defender = await loadDefender(input.agentId);
  if (!defender) return notFound();
  const { fail } = await checkChallenger(account, defender, utcToday(deps.now?.()));
  if (fail) return fail;

  const payer = new PublicKey(account);
  const tx = new Transaction({ feePayer: payer, recentBlockhash: await deps.latestBlockhash() }).add(
    new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [{ pubkey: payer, isSigner: true, isWritable: false }], data: Buffer.from(blinkMemo(defender.id), "utf8") })
  );
  return actionOk({
    type: "transaction",
    transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    message: `Challenge ${defender.name}. A memo-only transaction: you pay just the network fee.`,
    links: { next: { type: "post", href: challengeResultUrl(origin, defender.id) } },
  });
}

// ---------------------------------------------------------------------------
// POST /result: verify, fight, record
// ---------------------------------------------------------------------------

function completedAction(record: BlinkChallenge, origin: string): ActionResult {
  const s = record.summary;
  const won = record.winner === "challenger";
  const rounds = `${s.rounds} round${s.rounds === 1 ? "" : "s"}`;
  return actionOk({
    type: "completed",
    icon: agentAvatarUrl(origin, record.agentId),
    title: won ? `Victory! ${s.challengerName} beat ${s.defenderName}` : `Defeat. ${s.defenderName} beat ${s.challengerName}`,
    description: `${s.challengerName} dealt ${s.damageDealt} damage and took ${s.damageTaken} in ${rounds}. Play Level Up on Seeker to raise your own agents: ${origin}`,
    label: PLAY_LABEL,
  });
}

/** The RPC hasn't seen the transaction yet: point to the page that resolves it later. */
function stillConfirming(agentId: string, signature: string, account: string, origin: string): ActionResult {
  const url = challengeResultPageUrl(origin, agentId, signature, account);
  return actionOk({
    type: "completed",
    icon: agentAvatarUrl(origin, agentId),
    title: "Still confirming — open your result",
    description: `Solana hasn't confirmed your challenge transaction yet. Open your result in a minute: ${url}`,
    label: "Open your result",
  });
}

/**
 * Pass XP for a recorded challenge. Idempotent (fixed refs), so the replay path re-runs it to heal
 * a failed grant. The defender's owner earns XP only from registered players, at most
 * DEFENDER_XP_DAILY_CAP times a day: the slot ref makes concurrent grants race-safe.
 */
async function grantXp(record: BlinkChallenge): Promise<void> {
  if (!record.challengerPlayerId) return;
  try {
    const slot = await defenderAwardSlot(record.defenderPlayerId, record.day, record.id);
    await Promise.all([
      awardPassXpSafe({ playerId: record.challengerPlayerId, source: "blink_challenger", ref: `blink:${record.txSignature}:challenger`, xp: XP.blink_challenger }),
      slot >= 0 && slot < DEFENDER_XP_DAILY_CAP
        ? awardPassXpSafe({ playerId: record.defenderPlayerId, source: "blink_defender", ref: `blink-def:${record.defenderPlayerId}:${record.day}:${slot}`, xp: XP.blink_defender })
        : null,
    ]);
  } catch (e) {
    console.error("[blink xp]", record.txSignature, e);
  }
}

/** Stored result for a replayed signature, if it belongs to this fight (and heals its XP). */
async function replay(stored: BlinkChallenge, agentId: string, account: string, origin: string): Promise<ActionResult> {
  if (stored.agentId !== agentId || stored.challengerWallet !== account) return signatureUsed();
  await grantXp(stored);
  return completedAction(stored, origin);
}

async function challengerFighter(playerId: string | null, account: string): Promise<{ fighter: AgentWithDimensions; isAgent: boolean }> {
  const best = playerId ? await strongestAgent(playerId) : null;
  return best ? { fighter: (await withGear([best]))[0], isAgent: true } : { fighter: guestFighter(account), isAgent: false };
}

export async function resolveChallenge(
  input: { agentId: string; account?: unknown; signature?: unknown },
  origin: string,
  deps: BlinkDeps
): Promise<ActionResult> {
  if (!input.account || !input.signature) return actionFail(400, "missing_fields", "Missing wallet or transaction signature.");
  if (!isPublicKey(input.account)) return actionFail(400, "invalid_account", "That wallet address isn't valid.");
  if (!isSignature(input.signature)) return actionFail(400, "invalid_signature", "That transaction signature isn't valid.");
  const account = input.account;
  const signature = input.signature;

  // A replayed signature returns the stored result (no second battle).
  const stored = await getChallengeBySignature(signature);
  if (stored) return replay(stored, input.agentId, account, origin);

  const defender = await loadDefender(input.agentId);
  if (!defender) return notFound();
  // Cheap DB checks before the RPC; recordChallenge re-checks the limits atomically afterwards.
  const day = utcToday(deps.now?.());
  const { fail, playerId } = await checkChallenger(account, defender, day);
  if (fail) return fail;

  const verified = await deps.verifyTx({ signature, account, memo: blinkMemo(defender.id) });
  if (verified === "not_found") return stillConfirming(defender.id, signature, account, origin);
  if (verified === "rpc_error") return actionFail(503, "rpc_unavailable", "Couldn't reach Solana to check your challenge. Try again in a moment.");
  if (verified === "invalid") {
    return actionFail(402, "payment_invalid", "That isn't a valid challenge transaction: it must be confirmed, signed by your wallet, carry this agent's memo and be less than 15 minutes old.");
  }

  const { fighter: challenger, isAgent } = await challengerFighter(playerId, account);
  const state = runAuto(createBattle(challenger, defender, "pvp", deps.rng), deps.rng);
  const { attacker, defender: def } = state.sides;
  const summary: ChallengeSummary = {
    challengerName: challenger.name,
    challengerRole: challenger.role,
    challengerAgentId: isAgent ? challenger.id : null,
    defenderName: defender.name,
    rounds: state.rounds.length,
    damageDealt: Math.round(def.maxHp - Math.max(0, def.hp)),
    damageTaken: Math.round(attacker.maxHp - Math.max(0, attacker.hp)),
  };

  const recorded = await recordChallenge({
    agentId: defender.id,
    defenderPlayerId: defender.playerId,
    challengerWallet: account,
    challengerPlayerId: playerId,
    txSignature: signature,
    winner: state.winner === "attacker" ? "challenger" : "defender",
    summary,
    day,
  });
  switch (recorded.status) {
    case "ok":
      await grantXp(recorded.record);
      return completedAction(recorded.record, origin);
    case "duplicate_signature": {
      // Lost a race to the same signature: return whatever was stored.
      const winner = await getChallengeBySignature(signature);
      return winner ? replay(winner, input.agentId, account, origin) : signatureUsed();
    }
    case "agent_limit":
      return agentLimit(defender.name);
    case "daily_limit":
      return dailyLimit();
  }
}
