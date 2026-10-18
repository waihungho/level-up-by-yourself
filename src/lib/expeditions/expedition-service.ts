import { getAgentWithDimensions, getPlayerAgents, getPlayerByWallet } from "@/lib/db";
import { XP } from "@/lib/pass/season";
import { awardPassXpSafe } from "@/lib/pass/xp";
import { applyGems } from "@/lib/shop/gems";
import { addAttemptBonus, applyGrowthAtomic } from "@/lib/shop/shop-db";
import { defaultRng, type Rng } from "@/lib/tactical/rng";
import { fail, type ServiceResult } from "@/lib/tactical/service-common";
import { EXPEDITION_REWARDS, isExpeditionDuration, MAX_ACTIVE, rollReward } from "./catalog";
import {
  claimExpeditionRow,
  countOpenExpeditions,
  deleteExpedition,
  getExpedition,
  getOpenExpeditions,
  insertExpedition,
  releaseClaim,
} from "./expedition-db";

const HOUR_MS = 3_600_000;

export interface ExpeditionDeps {
  rng?: Rng;
  now?: () => Date;
}

const clock = (deps: ExpeditionDeps) => (deps.now ?? (() => new Date()))();

/** Open expeditions, the player's agents and the reward table for the /expeditions page. */
export async function getExpeditionsView(input: { walletAddress?: string }, deps: ExpeditionDeps = {}): Promise<ServiceResult> {
  if (!input.walletAddress) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(input.walletAddress);
  if (!player) return fail(403, "not_owner");
  const [expeditions, agents] = await Promise.all([getOpenExpeditions(player.id), getPlayerAgents(player.id)]);
  return {
    status: 200,
    body: {
      expeditions,
      agents: agents.map(({ id, name, role, roleTitle, spriteSeed }) => ({ id, name, role, roleTitle, spriteSeed })),
      maxActive: MAX_ACTIVE,
      rewards: EXPEDITION_REWARDS,
      serverNow: clock(deps).toISOString(),
    },
  };
}

/** Sends an agent away; the reward is rolled now and stored with the expedition. */
export async function startExpedition(
  input: { walletAddress?: string; agentId?: string; duration?: number },
  deps: ExpeditionDeps = {}
): Promise<ServiceResult> {
  const { walletAddress, agentId, duration } = input;
  if (!walletAddress || !agentId || duration === undefined || duration === null) return fail(400, "missing_fields");
  if (!isExpeditionDuration(duration)) return fail(400, "invalid_duration");
  const player = await getPlayerByWallet(walletAddress);
  if (!player) return fail(403, "not_owner");
  const agent = await getAgentWithDimensions(agentId);
  if (!agent || agent.playerId !== player.id) return fail(403, "not_owner");
  if ((await countOpenExpeditions(player.id)) >= MAX_ACTIVE) return fail(429, "expedition_limit");

  const startedAt = clock(deps);
  const expedition = await insertExpedition({
    playerId: player.id,
    agentId,
    durationH: duration,
    startedAt: startedAt.toISOString(),
    endsAt: new Date(startedAt.getTime() + duration * HOUR_MS).toISOString(),
    reward: rollReward(duration, agent.role, deps.rng ?? defaultRng),
  });
  if (!expedition) return fail(409, "agent_away");

  // Two concurrent starts can both pass the pre-check; whichever pushes the player over the limit is cancelled.
  if ((await countOpenExpeditions(player.id)) > MAX_ACTIVE) {
    await deleteExpedition(expedition.id);
    return fail(429, "expedition_limit");
  }
  return { status: 200, body: { expedition } };
}

/**
 * Claims a finished expedition: the row is marked claimed atomically (so only one call wins), then
 * the rewards are granted. Gems (idempotent by ref) go first and stat growth (one atomic call) second;
 * if either fails the claim is released so the player can retry without double rewards.
 */
export async function claimExpedition(input: { walletAddress?: string; expeditionId?: string }, deps: ExpeditionDeps = {}): Promise<ServiceResult> {
  const { walletAddress, expeditionId } = input;
  if (!walletAddress || !expeditionId) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(walletAddress);
  if (!player) return fail(403, "not_owner");

  const now = clock(deps);
  const expedition = await claimExpeditionRow(expeditionId, player.id, now);
  if (!expedition) {
    const row = await getExpedition(expeditionId);
    if (!row) return fail(404, "not_found");
    if (row.playerId !== player.id) return fail(403, "not_owner");
    if (row.claimedAt) return fail(409, "already_claimed");
    return { status: 409, body: { error: "not_ready", endsAt: row.endsAt } };
  }

  const { reward } = expedition;
  const ref = `exp:${expedition.id}`;
  let balance: number;
  try {
    balance = (await applyGems({ playerId: player.id, delta: reward.gems, reason: "expedition", ref })).balance;
    await applyGrowthAtomic(expedition.agentId, reward.growth);
  } catch (e) {
    await releaseClaim(expedition.id);
    throw e;
  }

  // Growth is already applied, so a failed ticket must not reopen the claim.
  if (reward.ticket) {
    try {
      await addAttemptBonus({ playerId: player.id, agentId: null, mode: "raid", extra: 1 });
    } catch (e) {
      console.error("[expeditions] RAID TICKET FAILED — grant manually", { playerId: player.id, expeditionId: expedition.id }, e);
    }
  }
  await awardPassXpSafe({ playerId: player.id, source: "expedition", ref, xp: XP.expedition, now });

  return { status: 200, body: { expedition, reward, balance } };
}
