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
import { createBattle, resolveRound, runAuto, toBattleLog } from "./engine";
import { fail, type BattleStateBase, type ModeHandler, type ServiceDeps, type ServiceResult } from "./service-common";
import type { BattleSession, SessionMode, SessionStore } from "./session-store";
import { squadHandler, startSquadBattle } from "./squad-service";
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
  async finalize(_session, state) {
    const log = toBattleLog(state);
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
};

/** Lets later modes (raids) plug in without this module importing them. */
export function registerModeHandler<S extends BattleStateBase>(mode: SessionMode, handler: ModeHandler<S>): void {
  handlers[mode] = handler;
}

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
  const extra = await handler.finalize(session, state, deps);
  const log = extra.battleLog as { id?: string } | undefined;
  await deps.store.markFinished(session.id, log?.id ?? null);
  return extra;
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

async function fightsUsed(agentId: string, mode: BattleMode, store: SessionStore): Promise<number> {
  const logged = mode === "pvp" ? await getPvpFightsToday(agentId) : await getAgentFightsToday(agentId);
  return logged + (await store.countActiveToday({ agentId, mode }));
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

  const limit = battleMode === "pvp" ? MAX_PVP_FIGHTS : MAX_TRAINING_FIGHTS;
  for (const id of ownAgents) {
    if ((await fightsUsed(id, battleMode, deps.store)) >= limit) return fail(429, "fight_limit_reached");
  }

  if (battleMode === "pvp") {
    const opponentId = await getRandomOpponentAgentId(player.id, deps.rng);
    if (!opponentId) return fail(409, "no_opponent");
    defender = await getAgentWithDimensions(opponentId);
    if (!defender) return fail(500, "internal");
  }
  if (!defender || !attacker.dimensions.length || !defender.dimensions.length) return fail(500, "internal");

  const state = createBattle(attacker, defender, battleMode, deps.rng);
  const session = await deps.store.create({
    mode: battleMode,
    playerId: player.id,
    attackerId: attacker.id,
    defenderId: defender.id,
    state,
  });
  return { status: 200, body: { sessionId: session.id, state, attacker, defender } };
}

type ExtraStarter = (player: Player, deps: ServiceDeps) => Promise<ServiceResult>;
const extraStarters: Partial<Record<SessionMode, ExtraStarter>> = {
  squad_pvp: startSquadBattle,
};

/** Lets later modes (raids) add a start flow. Player-level modes resolve stale sessions of the same mode first. */
export function registerModeStarter(mode: SessionMode, starter: ExtraStarter): void {
  extraStarters[mode] = starter;
}

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
  const session = await deps.store.get<BattleStateBase>(sessionId);
  if (!session) return fail(404, "no_session");
  const player = await getPlayerByWallet(walletAddress);
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
  return { status: 200, body: { state: loaded.session.state, status: loaded.session.status } };
}
