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
import type { AgentWithDimensions, BattleLog, Player } from "@/lib/types";
import { CYCLE } from "./constants";
import { createBattle, resolveRound, runAuto, toBattleLog } from "./engine";
import type { Rng } from "./rng";
import type { BattleSession, SessionStore } from "./session-store";
import { InvalidActionError, type Action, type BattleMode, type Category, type TacticalState } from "./types";

export type ServiceResult = { status: number; body: Record<string, unknown> };
export interface ServiceDeps {
  store: SessionStore;
  rng: Rng;
}

export const MAX_TRAINING_FIGHTS = 3;
export const MAX_PVP_FIGHTS = 3;

const TACTICAL_MODES: BattleMode[] = ["training", "pvp"];

function fail(status: number, error: string): ServiceResult {
  return { status, body: { error } };
}

export function parseAction(raw: unknown): Action | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as { type?: unknown; category?: unknown };
  if (a.type === "guard" || a.type === "special" || a.type === "auto") return { type: a.type };
  if (a.type === "strike" && CYCLE.includes(a.category as Category)) {
    return { type: "strike", category: a.category as Category };
  }
  return null;
}

async function ownedAgent(player: Player, agentId: string): Promise<AgentWithDimensions | null> {
  const agent = await getAgentWithDimensions(agentId);
  return agent && agent.playerId === player.id ? agent : null;
}

async function fightsUsed(agentId: string, mode: BattleMode, store: SessionStore): Promise<number> {
  const logged = mode === "pvp" ? await getPvpFightsToday(agentId) : await getAgentFightsToday(agentId);
  return logged + (await store.countActiveToday({ agentId, mode }));
}

/** Persists the battle log (and PvP stats), then closes the session. Completes an unfinished state with Auto first. */
export async function finalizeSession(session: BattleSession<TacticalState>, deps: ServiceDeps): Promise<BattleLog | null> {
  let state = session.state;
  if (!state.finished) {
    const done = runAuto(state, deps.rng);
    if (!(await deps.store.updateState(session.id, state.round, done))) return null; // someone else is finishing it
    state = done;
  }
  const log = toBattleLog(state);
  if (state.mode === "pvp") {
    await savePvpBattleLog(log);
    const loserId = log.winnerId === log.attackerId ? log.defenderId : log.attackerId;
    await updatePvpStats(log.winnerId, loserId);
  } else {
    await saveBattleLog(log);
  }
  await deps.store.markFinished(session.id, log.id);
  return log;
}

/** Auto-resolves the caller's own open tactical sessions that involve this agent. */
export async function resolveStaleSessions(playerId: string, agentId: string, deps: ServiceDeps): Promise<void> {
  const open = await deps.store.findActive<TacticalState>({ agentId, playerId });
  for (const session of open) {
    if (TACTICAL_MODES.includes(session.mode as BattleMode)) await finalizeSession(session, deps);
  }
}

export async function startBattle(
  input: { mode?: string; agentId?: string; walletAddress?: string; opponentAgentId?: string },
  deps: ServiceDeps
): Promise<ServiceResult> {
  const { mode, agentId, walletAddress, opponentAgentId } = input;
  if (!mode || !agentId || !walletAddress) return fail(400, "missing_fields");
  if (!TACTICAL_MODES.includes(mode as BattleMode)) return fail(400, "invalid_mode");
  const battleMode = mode as BattleMode;

  const player = await getPlayerByWallet(walletAddress);
  if (!player) return fail(403, "not_owner");
  const attacker = await ownedAgent(player, agentId);
  if (!attacker) return fail(403, "not_owner");

  let defender: AgentWithDimensions | null;
  if (battleMode === "training") {
    if (!opponentAgentId) return fail(400, "missing_fields");
    if (opponentAgentId === agentId) return fail(400, "invalid_opponent");
    defender = await ownedAgent(player, opponentAgentId);
    if (!defender) return fail(403, "not_owner");
  } else {
    defender = null;
  }

  const ownAgents = defender ? [attacker.id, defender.id] : [attacker.id];
  for (const id of ownAgents) await resolveStaleSessions(player.id, id, deps);

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

async function loadOwnedSession(
  sessionId: string,
  walletAddress: string,
  deps: ServiceDeps
): Promise<{ session: BattleSession<TacticalState> } | ServiceResult> {
  const session = await deps.store.get<TacticalState>(sessionId);
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
  const action = parseAction(input.action);
  if (!action) return fail(400, "invalid_action");

  const loaded = await loadOwnedSession(sessionId, walletAddress, deps);
  if ("status" in loaded) return loaded;
  const { session } = loaded;
  if (session.status === "finished") return fail(410, "session_finished");
  if (session.state.round !== round) return fail(409, "stale_round");

  let next: TacticalState;
  try {
    next = action.type === "auto" ? runAuto(session.state, deps.rng) : resolveRound(session.state, action, deps.rng, { manual: true });
  } catch (e) {
    if (e instanceof InvalidActionError) return fail(400, "invalid_action");
    throw e;
  }

  if (!(await deps.store.updateState(session.id, round, next))) return fail(409, "stale_round");

  const body: Record<string, unknown> = { rounds: next.rounds.slice(round), state: next, finished: next.finished };
  if (next.finished) body.battleLog = await finalizeSession({ ...session, state: next }, deps);
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
