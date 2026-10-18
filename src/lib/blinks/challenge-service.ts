import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { getAgentWithDimensions, getPlayerByWallet } from "@/lib/db";
import { awardPassXpSafe } from "@/lib/pass/xp";
import { XP } from "@/lib/pass/season";
import { withGear } from "@/lib/shop/gear-db";
import { MEMO_PROGRAM_ID } from "@/lib/sol-payment";
import { strongestAgent, totalStats } from "@/lib/squads";
import { createBattle, runAuto } from "@/lib/tactical/engine";
import { defaultRng, type Rng } from "@/lib/tactical/rng";
import type { ServiceResult } from "@/lib/tactical/service-common";
import { utcToday } from "@/lib/time";
import type { AgentWithDimensions } from "@/lib/types";
import { blinkMemo, type ActionGetResponse, type ActionTransactionResponse } from "./actions";
import {
  BLINK_DAILY_LIMIT,
  BLINK_PER_AGENT_LIMIT,
  challengesOnDay,
  deleteChallenge,
  getChallengeBySignature,
  insertChallenge,
  type BlinkChallenge,
  type ChallengeSummary,
} from "./challenge-db";
import { guestFighter } from "./guest";
import { agentAvatarUrl, challengeActionUrl, challengeResultUrl } from "./links";
import { latestBlockhash, verifyMemoTx } from "./verify-memo";

/*
 * Blink challenges: anyone with a Solana wallet fights a shared agent from a Blink.
 * GET describes the action, POST returns a memo-only transaction (the challenger pays only the
 * network fee, the game never moves SOL), and the chained /result call verifies it on-chain and
 * runs an exhibition auto battle (no growth, rating or gems). Chain access is injected.
 */

export interface BlinkDeps {
  latestBlockhash: () => Promise<string>;
  verifyTx: (input: { signature: string; account: string; memo: string }) => Promise<boolean>;
  rng: Rng;
  now?: () => Date;
}

export function blinkDeps(): BlinkDeps {
  return { latestBlockhash, verifyTx: verifyMemoTx, rng: defaultRng };
}

const FIGHT_LABEL = "Fight ⚔";
const PLAY_LABEL = "Play Level Up on Seeker";

/** Actions error body: `message` is what Blink clients show, `error` is our usual code. */
function actionFail(status: number, error: string, message: string): ServiceResult {
  return { status, body: { error, message } };
}

const isPublicKey = (s: unknown): s is string => {
  if (typeof s !== "string" || !s) return false;
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
};

async function loadDefender(agentId: string): Promise<AgentWithDimensions | null> {
  if (!agentId) return null;
  const agent = await getAgentWithDimensions(agentId);
  if (!agent || agent.dimensions.length === 0) return null;
  return (await withGear([agent]))[0];
}

const notFound = () => actionFail(404, "agent_not_found", "This agent doesn't exist (anymore).");

// ---------------------------------------------------------------------------
// GET: the action card
// ---------------------------------------------------------------------------

export async function getChallengeAction(agentId: string, origin: string): Promise<ServiceResult> {
  const agent = await getAgentWithDimensions(agentId);
  if (!agent) return notFound();
  const body: ActionGetResponse = {
    type: "action",
    icon: agentAvatarUrl(origin, agent.id),
    title: `Fight ${agent.name}`,
    description: `${agent.roleTitle} · ${agent.role} · Total Power ${Math.round(totalStats(agent))}. Your strongest agent (or a guest fighter) battles it in Level Up. Exhibition fight: you only pay the network fee.`,
    label: FIGHT_LABEL,
    links: { actions: [{ type: "transaction", href: challengeActionUrl(origin, agent.id), label: FIGHT_LABEL }] },
  };
  return { status: 200, body: body as unknown as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Shared checks
// ---------------------------------------------------------------------------

/** Own-agent and daily-limit checks; null when the challenge may go ahead. */
async function checkChallenger(account: string, defender: AgentWithDimensions, day: string): Promise<{ fail: ServiceResult | null; playerId: string | null }> {
  const player = await getPlayerByWallet(account);
  if (player && player.id === defender.playerId) {
    return { fail: actionFail(403, "own_agent", "You can't challenge your own agent. Share it so others can!"), playerId: player.id };
  }
  const today = await challengesOnDay(account, day);
  if (today.filter((c) => c.agentId === defender.id).length >= BLINK_PER_AGENT_LIMIT) {
    return { fail: actionFail(429, "agent_limit", `You already fought ${defender.name} today. Come back tomorrow (00:00 UTC).`), playerId: player?.id ?? null };
  }
  if (today.length >= BLINK_DAILY_LIMIT) {
    return { fail: actionFail(429, "daily_limit", `You've used all ${BLINK_DAILY_LIMIT} Blink challenges today. Come back tomorrow (00:00 UTC).`), playerId: player?.id ?? null };
  }
  return { fail: null, playerId: player?.id ?? null };
}

// ---------------------------------------------------------------------------
// POST: the memo transaction
// ---------------------------------------------------------------------------

export async function buildChallengeTx(input: { agentId: string; account?: unknown }, origin: string, deps: BlinkDeps): Promise<ServiceResult> {
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
  const body: ActionTransactionResponse = {
    type: "transaction",
    transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    message: `Challenge ${defender.name}. Only the network fee is charged.`,
    links: { next: { type: "post", href: challengeResultUrl(origin, defender.id) } },
  };
  return { status: 200, body: body as unknown as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// POST /result: verify, fight, record
// ---------------------------------------------------------------------------

function completedAction(record: BlinkChallenge, origin: string): ServiceResult {
  const s = record.summary;
  const won = record.winner === "challenger";
  const rounds = `${s.rounds} round${s.rounds === 1 ? "" : "s"}`;
  const body: ActionGetResponse = {
    type: "completed",
    icon: agentAvatarUrl(origin, record.agentId),
    title: won ? `Victory! ${s.challengerName} beat ${s.defenderName}` : `Defeat. ${s.defenderName} beat ${s.challengerName}`,
    description: `${s.challengerName} dealt ${s.damageDealt} damage and took ${s.damageTaken} in ${rounds}. Play Level Up on Seeker to raise your own agents: ${origin}`,
    label: PLAY_LABEL,
  };
  return { status: 200, body: body as unknown as Record<string, unknown> };
}

async function challengerFighter(playerId: string | null, account: string): Promise<AgentWithDimensions> {
  const best = playerId ? await strongestAgent(playerId) : null;
  return best ? (await withGear([best]))[0] : guestFighter(account);
}

export async function resolveChallenge(
  input: { agentId: string; account?: unknown; signature?: unknown },
  origin: string,
  deps: BlinkDeps
): Promise<ServiceResult> {
  if (!input.account || !input.signature || typeof input.signature !== "string") {
    return actionFail(400, "missing_fields", "Missing wallet or transaction signature.");
  }
  if (!isPublicKey(input.account)) return actionFail(400, "invalid_account", "That wallet address isn't valid.");
  const account = input.account;
  const signature = input.signature;

  // A replayed signature returns the stored result (no second battle) if it is for this fight.
  const stored = await getChallengeBySignature(signature);
  if (stored) {
    if (stored.agentId !== input.agentId || stored.challengerWallet !== account) {
      return actionFail(409, "signature_used", "This transaction was already used for another challenge.");
    }
    return completedAction(stored, origin);
  }

  const defender = await loadDefender(input.agentId);
  if (!defender) return notFound();
  if (!(await deps.verifyTx({ signature, account, memo: blinkMemo(defender.id) }))) {
    return actionFail(402, "payment_invalid", "Couldn't verify your challenge transaction on-chain. It must be confirmed, signed by your wallet and less than 15 minutes old.");
  }
  // Limits are enforced here too: anyone can send a memo transaction without asking us first.
  const day = utcToday(deps.now?.());
  const { fail, playerId } = await checkChallenger(account, defender, day);
  if (fail) return fail;

  const challenger = await challengerFighter(playerId, account);
  const state = runAuto(createBattle(challenger, defender, "pvp", deps.rng), deps.rng);
  const { attacker, defender: def } = state.sides;
  const summary: ChallengeSummary = {
    challengerName: challenger.name,
    challengerRole: challenger.role,
    challengerAgentId: playerId ? challenger.id : null,
    defenderName: defender.name,
    rounds: state.rounds.length,
    damageDealt: Math.round(def.maxHp - Math.max(0, def.hp)),
    damageTaken: Math.round(attacker.maxHp - Math.max(0, attacker.hp)),
  };

  const inserted = await insertChallenge({
    agentId: defender.id,
    challengerWallet: account,
    challengerPlayerId: playerId,
    txSignature: signature,
    winner: state.winner === "attacker" ? "challenger" : "defender",
    summary,
    day,
  });
  if ("conflict" in inserted) {
    // Lost a race: either the same signature (return its result) or a second fight vs this agent today.
    const winnerOfRace = await getChallengeBySignature(signature);
    if (winnerOfRace) return completedAction(winnerOfRace, origin);
    return actionFail(429, "agent_limit", `You already fought ${defender.name} today. Come back tomorrow (00:00 UTC).`);
  }
  const record = inserted.record;

  // Concurrent results for different agents can both pass the daily pre-check; keep the oldest 5.
  const rank = (await challengesOnDay(account, day)).findIndex((c) => c.id === record.id);
  if (rank >= BLINK_DAILY_LIMIT) {
    await deleteChallenge(record.id);
    return actionFail(429, "daily_limit", `You've used all ${BLINK_DAILY_LIMIT} Blink challenges today. Come back tomorrow (00:00 UTC).`);
  }

  await Promise.all([
    playerId ? awardPassXpSafe({ playerId, source: "blink_challenger", ref: `blink:${signature}:challenger`, xp: XP.blink_challenger }) : null,
    awardPassXpSafe({ playerId: defender.playerId, source: "blink_defender", ref: `blink:${signature}:defender`, xp: XP.blink_defender }),
  ]);
  return completedAction(record, origin);
}
