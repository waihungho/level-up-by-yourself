import { getAgentsByIds, getPlayerAgents, getPlayerByWallet } from "@/lib/db";
import { XP } from "@/lib/pass/season";
import { awardPassXp } from "@/lib/pass/xp";
import { defaultRng, type Rng } from "@/lib/tactical/rng";
import { fail, type ServiceResult } from "@/lib/tactical/service-common";
import type { Agent } from "@/lib/types";
import { isExpeditionDuration, MAX_ACTIVE, rollReward } from "./catalog";
import { claimExpeditionTx, getOpenExpeditions, startExpeditionTx, type Expedition, type ExpeditionSummary } from "./expedition-db";

export interface ExpeditionDeps {
  rng?: Rng;
  now?: () => Date;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (x: unknown): x is string => typeof x === "string" && UUID_RE.test(x);
const isNonEmptyString = (x: unknown): x is string => typeof x === "string" && x.length > 0;

function summarize({ id, agentId, durationH, startedAt, endsAt }: Expedition): ExpeditionSummary {
  return { id, agentId, durationH, startedAt, endsAt };
}

/** The numeric sprite genes (what PixelSprite needs) from an agent's stored seed. */
function spriteSeedOf(agent: Agent): Record<string, number> {
  return Object.fromEntries(Object.entries(agent.spriteSeed).filter((e): e is [string, number] => typeof e[1] === "number"));
}

/** Idempotent per expedition (ref `exp:<id>`); never fails the claim. Returns whether the XP is recorded. */
async function grantPassXp(playerId: string, expeditionId: string, now: Date): Promise<boolean> {
  try {
    await awardPassXp({ playerId, source: "expedition", ref: `exp:${expeditionId}`, xp: XP.expedition, now });
    return true;
  } catch (e) {
    console.error("[pass xp]", `exp:${expeditionId}`, e);
    return false;
  }
}

/** Open expeditions (rewards hidden) and the player's agents for the /expeditions page. */
export async function getExpeditionsView(input: { walletAddress?: unknown }, deps: ExpeditionDeps = {}): Promise<ServiceResult> {
  if (!isNonEmptyString(input.walletAddress)) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(input.walletAddress);
  if (!player) return fail(403, "not_owner");
  const [expeditions, agents] = await Promise.all([getOpenExpeditions(player.id), getPlayerAgents(player.id)]);
  return {
    status: 200,
    body: {
      expeditions: expeditions.map(summarize),
      agents: agents.map((a) => ({ id: a.id, name: a.name, role: a.role, roleTitle: a.roleTitle, spriteSeed: spriteSeedOf(a) })),
      maxActive: MAX_ACTIVE,
      serverNow: (deps.now?.() ?? new Date()).toISOString(),
    },
  };
}

/** Sends an agent away; the reward is rolled now and stored (not shown until the claim). */
export async function startExpedition(
  input: { walletAddress?: unknown; agentId?: unknown; duration?: unknown },
  deps: ExpeditionDeps = {}
): Promise<ServiceResult> {
  const { walletAddress, agentId, duration } = input;
  if (!isNonEmptyString(walletAddress) || !isNonEmptyString(agentId) || duration === undefined || duration === null) return fail(400, "missing_fields");
  if (!isExpeditionDuration(duration)) return fail(400, "invalid_duration");
  if (!isUuid(agentId)) return fail(403, "not_owner");
  const player = await getPlayerByWallet(walletAddress);
  if (!player) return fail(403, "not_owner");
  const [agent] = await getAgentsByIds([agentId]);
  if (!agent || agent.playerId !== player.id) return fail(403, "not_owner");

  const started = await startExpeditionTx(
    {
      playerId: player.id,
      agentId,
      durationH: duration,
      startedAt: (deps.now?.() ?? new Date()).toISOString(),
      reward: rollReward(duration, agent.role, deps.rng ?? defaultRng),
    },
    MAX_ACTIVE
  );
  if (started.result !== "ok") return started.result === "limit" ? fail(429, "expedition_limit") : fail(409, "agent_away");
  return { status: 200, body: { expedition: summarize(started.expedition) } };
}

/**
 * Claims a finished expedition. The claim and its growth, gems and raid ticket are one transaction;
 * Pass XP follows separately (idempotent), and a repeated claim by the owner re-grants XP that failed.
 */
export async function claimExpedition(input: { walletAddress?: unknown; expeditionId?: unknown }, deps: ExpeditionDeps = {}): Promise<ServiceResult> {
  const { walletAddress, expeditionId } = input;
  if (!isNonEmptyString(walletAddress) || expeditionId === undefined || expeditionId === null || expeditionId === "") return fail(400, "missing_fields");
  if (!isUuid(expeditionId)) return fail(404, "not_found");
  const player = await getPlayerByWallet(walletAddress);
  if (!player) return fail(403, "not_owner");

  const now = deps.now?.() ?? new Date();
  const claimed = await claimExpeditionTx(expeditionId, player.id, now);
  switch (claimed.result) {
    case "not_found":
      return fail(404, "not_found");
    case "not_owner":
      return fail(403, "not_owner");
    case "not_ready":
      return { status: 409, body: { error: "not_ready", endsAt: claimed.expedition.endsAt } };
    case "already_claimed":
      await grantPassXp(player.id, expeditionId, now);
      return fail(409, "already_claimed");
  }

  const { expedition, balance, gemsGranted } = claimed;
  const xp = await grantPassXp(player.id, expedition.id, now);
  return {
    status: 200,
    body: {
      expedition: summarize(expedition),
      reward: expedition.reward,
      granted: { gems: gemsGranted, growth: expedition.reward.growth, ticket: expedition.reward.ticket, xp },
      balance,
    },
  };
}
