import { applyAgentGrowth, getPlayerByWallet } from "@/lib/db";
import {
  countSquadBattlesToday,
  findSquadOpponent,
  getOrBuildSquad,
  getSquad,
  getSquadStats,
  MAX_SQUAD_BATTLES,
  recordSquadBattle,
  saveSquad,
} from "@/lib/squads";
import type { Player } from "@/lib/types";
import { parseAction } from "./battle-service-actions";
import { createSquadBattle, resolveSquadRound, runSquadAuto, squadGrowth, synergyFor, type SquadAction, type SquadState } from "./squad";
import type { BattleSession } from "./session-store";
import { getAttemptBonusToday } from "@/lib/shop/shop-db";
import { withGear } from "@/lib/shop/gear-db";
import { fail, usedToday, withinLimitAfterCreate, type ModeHandler, type ServiceDeps, type ServiceResult } from "./service-common";

const OPPONENT_ATTEMPTS = 5;

/** Base daily squad battles plus any Squad Tickets bought today. */
async function squadLimitToday(playerId: string): Promise<number> {
  return MAX_SQUAD_BATTLES + (await getAttemptBonusToday({ playerId, mode: "squad_pvp" }));
}

export function parseSquadAction(raw: unknown): SquadAction | { type: "auto" } | null {
  if (raw && typeof raw === "object" && (raw as { type?: unknown }).type === "swap") {
    const slot = (raw as { slot?: unknown }).slot;
    return typeof slot === "number" && Number.isInteger(slot) ? { type: "swap", slot } : null;
  }
  return parseAction(raw);
}

export const squadInvalidCode = (action: { type: string }) => (action.type === "swap" ? "invalid_swap" : "invalid_action");

export const squadHandler: ModeHandler<SquadState> = {
  parseAction: (raw) => parseSquadAction(raw) as ReturnType<ModeHandler<SquadState>["parseAction"]>,
  resolve: (state, action, rng) => resolveSquadRound(state, action as unknown as SquadAction, rng, { manual: true }),
  auto: (state, rng) => runSquadAuto(state, rng),
  invalidCode: squadInvalidCode,
  async finalize(session: BattleSession<SquadState>, state: SquadState) {
    const growth = squadGrowth(state);
    await Promise.all(
      (["attacker", "defender"] as const).flatMap((side) => Object.entries(growth[side]).map(([agentId, g]) => applyAgentGrowth(agentId, g)))
    );
    const A = state.teams.attacker;
    const D = state.teams.defender;
    const { ratingDelta } = await recordSquadBattle({
      attackerPlayerId: A.playerId,
      defenderPlayerId: D.playerId,
      winnerPlayerId: state.winner === "attacker" ? A.playerId : D.playerId,
      attackerSquad: A.members.map((m) => m.agentId),
      defenderSquad: D.members.map((m) => m.agentId),
      rounds: state.rounds,
      manualActions: state.manualActions,
      createdAt: session.createdAt,
    });
    return { growth, ratingDelta, winner: state.winner };
  },
};

/** Validates limits, finds an opponent squad and creates the session. Stale sessions must be resolved by the caller first. */
export async function startSquadBattle(player: Player, deps: ServiceDeps): Promise<ServiceResult> {
  const attackers = await getOrBuildSquad(player.id);
  if (!attackers) return fail(409, "no_squad");

  const used = () => usedToday(countSquadBattlesToday(player.id), deps.store, { playerId: player.id, mode: "squad_pvp" });
  const limit = await squadLimitToday(player.id);
  if ((await used()) >= limit) return fail(429, "squad_limit_reached");

  const rating = (await getSquadStats([player.id]))[player.id].rating;
  // A candidate may no longer field 3 agents; try a few others before giving up.
  const tried: string[] = [];
  let opponentId: string | null = null;
  let defenders: Awaited<ReturnType<typeof getOrBuildSquad>> = null;
  for (let i = 0; i < OPPONENT_ATTEMPTS && !defenders; i++) {
    opponentId = await findSquadOpponent(player.id, rating, deps.rng, tried);
    if (!opponentId) break;
    tried.push(opponentId);
    defenders = await getOrBuildSquad(opponentId);
  }
  if (!opponentId || !defenders) return fail(409, "no_opponent");

  const [gearedAttackers, gearedDefenders] = await Promise.all([withGear(attackers), withGear(defenders)]);
  const state = createSquadBattle({ playerId: player.id, agents: gearedAttackers }, { playerId: opponentId, agents: gearedDefenders }, deps.rng);
  const session = await deps.store.create({ mode: "squad_pvp", playerId: player.id, attackerId: null, defenderId: null, state });
  if (!(await withinLimitAfterCreate(session, used, limit, deps))) return fail(429, "squad_limit_reached");
  return { status: 200, body: { sessionId: session.id, state, attackers: gearedAttackers, defenders: gearedDefenders } };
}

export async function getSquadView(input: { walletAddress?: string }): Promise<ServiceResult> {
  if (!input.walletAddress) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(input.walletAddress);
  if (!player) return fail(403, "not_owner");
  const [saved, squad, stats, battlesToday, maxBattles] = await Promise.all([
    getSquad(player.id),
    getOrBuildSquad(player.id),
    getSquadStats([player.id]),
    countSquadBattlesToday(player.id),
    squadLimitToday(player.id),
  ]);
  return {
    status: 200,
    body: {
      saved,
      squad,
      synergy: squad ? synergyFor(squad.map((a) => a.role)) : null,
      stats: stats[player.id],
      battlesToday,
      maxBattles,
    },
  };
}

export async function putSquad(input: { walletAddress?: string; agentIds?: unknown }): Promise<ServiceResult> {
  if (!input.walletAddress || !Array.isArray(input.agentIds)) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(input.walletAddress);
  if (!player) return fail(403, "not_owner");
  try {
    await saveSquad(player.id, input.agentIds.map(String));
  } catch (e) {
    if (e instanceof Error && e.message === "invalid_squad") return fail(400, "invalid_squad");
    throw e;
  }
  return { status: 200, body: { saved: input.agentIds } };
}
