import {
  getAgentFightsToday,
  getAgentWithDimensions,
  getPlayerByWallet,
  getPvpFightsToday,
  getRandomOpponentAgentId,
  saveBattleLog,
  savePvpBattleLog,
  updatePvpStats,
} from "@/lib/db";
import type { AgentWithDimensions, Player } from "@/lib/types";
import { parseAction } from "./battle-service-actions";
import { getAttemptBonusToday } from "@/lib/shop/shop-db";
import { withGear } from "@/lib/shop/gear-db";
import { createBattle, resolveRound, runAuto, toBattleLog } from "./engine";
import { fail, runDeferred, usedToday, withinLimitAfterCreate, type BattleStateBase, type ModeHandler, type ServiceDeps, type ServiceResult } from "./service-common";
import type { BattleSession, SessionMode, SessionStore } from "./session-store";
import { XP, type XpSource } from "@/lib/pass/season";
import { awardPassXp } from "@/lib/pass/xp";
import { squadHandler, startSquadBattle } from "./squad-service";
import { raidHandler, startRaidAttempt } from "@/lib/raid/raid-service";
import { InvalidActionError, type BattleMode, type PlayerAction, type TacticalState } from "./types";

export { parseAction } from "./battle-service-actions";
export type { ServiceDeps, ServiceResult } from "./service-common";

export const MAX_TRAINING_FIGHTS = 3;
export const MAX_PVP_FIGHTS = 3;

const TACTICAL_MODES: BattleMode[] = ["training", "pvp"];

const tacticalHandler: ModeHandler<TacticalState> = {
  parseAction: (raw) => parseAction(raw) as ReturnType<ModeHandler<TacticalState>["parseAction"]>,
  resolve: (state, action, rng) => resolveRound(state, action as unknown as PlayerAction, rng, { manual: true }),
  auto: (state, rng) => runAuto(state, rng),
  invalidCode: () => "invalid_action",
  async finalize(session, state) {
    // Session id as log id + session start time: a resolved abandoned fight counts on the day it was fought.
    const log = toBattleLog(state, session.id, session.createdAt);
    if (state.mode === "pvp") {
      await savePvpBattleLog(log);
      const loserId = log.winnerId === log.attackerId ? log.defenderId : log.attackerId;
      await updatePvpStats(log.winnerId, loserId);
    } else {
      await saveBattleLog(log);
    }
    return { battleLog: log };
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: Partial<Record<SessionMode, ModeHandler<any>>> = {
  training: tacticalHandler,
  pvp: tacticalHandler,
  squad_pvp: squadHandler,
  raid: raidHandler,
};

function handlerFor(mode: SessionMode): ModeHandler<BattleStateBase> {
  const h = handlers[mode];
  if (!h) throw new Error(`no handler for mode ${mode}`);
  return h;
}

/**
 * Completes an unfinished state with Auto, persists results, and closes the session.
 * Returns the extra response fields, or null if another request is already finishing it.
 */
export async function finalizeSession(session: BattleSession<BattleStateBase>, deps: ServiceDeps): Promise<Record<string, unknown> | null> {
  const handler = handlerFor(session.mode);
  let state = session.state;
  if (!state.finished) {
    const done = handler.auto(state, deps.rng);
    if (!(await deps.store.updateState(session.id, state.round, done))) return null;
    state = done;
  }
  // Only one caller persists results; a failure releases the claim so the next start or sweep retries.
  if (!(await deps.store.claimFinalize(session.id))) return null;
  let extra: Record<string, unknown>;
  try {
    extra = await handler.finalize(session, state, deps);
  } catch (e) {
    await deps.store.releaseFinalize(session.id);
    throw e;
  }
  const log = extra.battleLog as { id?: string } | undefined;
  await deps.store.markFinished(session.id, log?.id ?? null, extra);
  const xp = SESSION_XP[session.mode];
  if (xp) {
    const award = { playerId: session.playerId, source: xp, ref: `session:${session.id}`, xp: XP[xp] };
    await runDeferred(deps, "pass xp", async () => void (await awardPassXp(award)));
  }
  return extra;
}

/** Season Pass XP source for each finished session mode. */
const SESSION_XP: Partial<Record<SessionMode, Exclude<XpSource, "login">>> = { training: "fight", pvp: "fight", squad_pvp: "squad", raid: "raid" };

/** Finalises abandoned sessions created before the cutoff (run from the daily cron). Returns how many were closed. */
export async function sweepStaleSessions(beforeISO: string, deps: ServiceDeps): Promise<number> {
  let closed = 0;
  for (const session of await deps.store.findStale<BattleStateBase>(beforeISO)) {
    try {
      if (await finalizeSession(session, deps)) closed++;
    } catch (e) {
      console.error("[sweepStaleSessions]", session.id, e);
    }
  }
  return closed;
}

/** Auto-resolves the caller's own open sessions matching the filter. */
export async function resolveStaleSessions(filter: { playerId: string; agentId?: string; modes: SessionMode[] }, deps: ServiceDeps): Promise<void> {
  const open = await deps.store.findActive<BattleStateBase>({ playerId: filter.playerId, agentId: filter.agentId });
  for (const session of open) {
    if (filter.modes.includes(session.mode)) await finalizeSession(session, deps);
  }
}

async function ownedAgent(player: Player, agentId: string): Promise<AgentWithDimensions | null> {
  const agent = await getAgentWithDimensions(agentId);
  return agent && agent.playerId === player.id ? agent : null;
}

function fightsUsed(agentId: string, mode: BattleMode, store: SessionStore): Promise<number> {
  return usedToday(mode === "pvp" ? getPvpFightsToday(agentId) : getAgentFightsToday(agentId), store, { agentId, mode });
}

async function startTacticalBattle(
  player: Player,
  battleMode: BattleMode,
  agentId: string | undefined,
  opponentAgentId: string | undefined,
  deps: ServiceDeps
): Promise<ServiceResult> {
  if (!agentId) return fail(400, "missing_fields");
  const attacker = await ownedAgent(player, agentId);
  if (!attacker) return fail(403, "not_owner");

  let defender: AgentWithDimensions | null = null;
  if (battleMode === "training") {
    if (!opponentAgentId) return fail(400, "missing_fields");
    if (opponentAgentId === agentId) return fail(400, "invalid_opponent");
    defender = await ownedAgent(player, opponentAgentId);
    if (!defender) return fail(403, "not_owner");
  }

  const ownAgents = defender ? [attacker.id, defender.id] : [attacker.id];
  for (const id of ownAgents) await resolveStaleSessions({ playerId: player.id, agentId: id, modes: TACTICAL_MODES }, deps);

  // PvP refills add bought fights per agent; training refills reset via the recharge table instead.
  const baseLimit = battleMode === "pvp" ? MAX_PVP_FIGHTS : MAX_TRAINING_FIGHTS;
  const limits = new Map<string, number>();
  for (const id of ownAgents) {
    const limit = baseLimit + (battleMode === "pvp" ? await getAttemptBonusToday({ agentId: id, mode: "pvp" }) : 0);
    if ((await fightsUsed(id, battleMode, deps.store)) >= limit) return fail(429, "fight_limit_reached");
    limits.set(id, limit);
  }

  if (battleMode === "pvp") {
    const opponentId = await getRandomOpponentAgentId(player.id, deps.rng);
    if (!opponentId) return fail(409, "no_opponent");
    defender = await getAgentWithDimensions(opponentId);
    if (!defender) return fail(500, "internal");
  }
  if (!defender || !attacker.dimensions.length || !defender.dimensions.length) return fail(500, "internal");

  const [gearedAttacker, gearedDefender] = await withGear([attacker, defender]);
  const state = createBattle(gearedAttacker, gearedDefender, battleMode, deps.rng);
  const session = await deps.store.create({
    mode: battleMode,
    playerId: player.id,
    attackerId: attacker.id,
    defenderId: defender.id,
    state,
  });
  for (const id of ownAgents) {
    if (!(await withinLimitAfterCreate(session, () => fightsUsed(id, battleMode, deps.store), limits.get(id)!, deps))) return fail(429, "fight_limit_reached");
  }
  return { status: 200, body: { sessionId: session.id, state, attacker: gearedAttacker, defender: gearedDefender } };
}

type ExtraStarter = (player: Player, deps: ServiceDeps) => Promise<ServiceResult>;
/** Player-level modes (no agentId); they resolve stale sessions of the same mode before starting. */
const extraStarters: Partial<Record<SessionMode, ExtraStarter>> = {
  squad_pvp: startSquadBattle,
  raid: startRaidAttempt,
};

export async function startBattle(
  input: { mode?: string; agentId?: string; walletAddress?: string; opponentAgentId?: string },
  deps: ServiceDeps
): Promise<ServiceResult> {
  const { mode, agentId, walletAddress, opponentAgentId } = input;
  if (!mode || !walletAddress) return fail(400, "missing_fields");
  const isTactical = TACTICAL_MODES.includes(mode as BattleMode);
  const starter = extraStarters[mode as SessionMode];
  if (!isTactical && !starter) return fail(400, "invalid_mode");
  if (isTactical && !agentId) return fail(400, "missing_fields");

  const player = await getPlayerByWallet(walletAddress);
  if (!player) return fail(403, "not_owner");

  if (isTactical) return startTacticalBattle(player, mode as BattleMode, agentId, opponentAgentId, deps);
  await resolveStaleSessions({ playerId: player.id, modes: [mode as SessionMode] }, deps);
  return starter!(player, deps);
}

async function loadOwnedSession(
  sessionId: string,
  walletAddress: string,
  deps: ServiceDeps
): Promise<{ session: BattleSession<BattleStateBase> } | ServiceResult> {
  const [session, player] = await Promise.all([deps.store.get<BattleStateBase>(sessionId), getPlayerByWallet(walletAddress)]);
  if (!session) return fail(404, "no_session");
  if (!player || player.id !== session.playerId) return fail(403, "not_owner");
  return { session };
}

export async function takeTurn(
  input: { sessionId?: string; walletAddress?: string; round?: number; action?: unknown },
  deps: ServiceDeps
): Promise<ServiceResult> {
  const { sessionId, walletAddress, round } = input;
  if (!sessionId || !walletAddress || typeof round !== "number") return fail(400, "missing_fields");

  const loaded = await loadOwnedSession(sessionId, walletAddress, deps);
  if ("status" in loaded) return loaded;
  const { session } = loaded;
  const handler = handlerFor(session.mode);

  const action = handler.parseAction(input.action);
  if (!action) return fail(400, "invalid_action");
  if (session.status === "finished") return fail(410, "session_finished");
  if (session.state.round !== round) return fail(409, "stale_round");

  let next: BattleStateBase;
  try {
    next = action.type === "auto" ? handler.auto(session.state, deps.rng) : handler.resolve(session.state, action, deps.rng);
  } catch (e) {
    if (e instanceof InvalidActionError) return fail(400, handler.invalidCode(action));
    throw e;
  }

  if (!(await deps.store.updateState(session.id, round, next))) return fail(409, "stale_round");

  const rounds = (next as unknown as { rounds: unknown[] }).rounds.slice(round);
  let body: Record<string, unknown> = { rounds, state: next, finished: next.finished };
  if (next.finished) body = { ...body, ...((await finalizeSession({ ...session, state: next }, deps)) ?? {}) };
  return { status: 200, body };
}

export async function getSessionView(
  input: { sessionId: string; walletAddress: string },
  deps: ServiceDeps
): Promise<ServiceResult> {
  const loaded = await loadOwnedSession(input.sessionId, input.walletAddress, deps);
  if ("status" in loaded) return loaded;
  const { session } = loaded;
  return { status: 200, body: { state: session.state, status: session.status, result: session.result ?? null } };
}
