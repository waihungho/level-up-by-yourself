import { applyAgentGrowth, getAgentWithDimensions, getPlayerAgents, getPlayerByWallet } from "@/lib/db";
import { getOrBuildSquad } from "@/lib/squads";
import { fail, type ModeHandler, type ServiceDeps, type ServiceResult } from "@/lib/tactical/service-common";
import { squadGrowth, type SquadAction } from "@/lib/tactical/squad";
import { parseSquadAction } from "@/lib/tactical/squad-service";
import type { AgentWithDimensions, Player } from "@/lib/types";
import { bossAgent, bossByKey } from "./bosses";
import { applyRaidDamage, countRaidAttemptsToday, getActiveBoss, getContributions, getLatestBoss, getRecentHits, MAX_RAID_ATTEMPTS, payoutBoss } from "./raid-db";
import { attemptDamage, createRaidAttempt, currentWeakness, phaseFor, resolveRaidRound, runRaidAuto, type RaidState } from "./raid-engine";

/** Raid session state also remembers which boss it is fighting and the feed label. */
export interface RaidSessionState extends RaidState {
  bossId: string;
  label: string;
}

function bestHit(state: RaidState): number {
  const ids = new Set(state.teams.attacker.members.map((m) => m.agentId));
  return state.rounds.reduce((best, r) => {
    const attackerFirst = ids.has(r.firstAttacker);
    return Math.max(best, attackerFirst ? r.firstDamage : r.secondDamage);
  }, 0);
}

export const raidHandler: ModeHandler<RaidSessionState> = {
  parseAction: (raw) => parseSquadAction(raw) as ReturnType<ModeHandler<RaidSessionState>["parseAction"]>,
  resolve: (state, action, rng) => resolveRaidRound(state, action as unknown as SquadAction, rng, { manual: true }) as RaidSessionState,
  auto: (state, rng) => runRaidAuto(state, rng) as RaidSessionState,
  invalidCode: (action) => (action.type === "swap" ? "invalid_swap" : "invalid_action"),
  async finalize(session, state) {
    const damage = attemptDamage(state);
    const result = await applyRaidDamage({
      bossId: state.bossId,
      playerId: session.playerId,
      damage,
      bestHit: bestHit(state),
      counters: state.counters,
      label: state.label,
    });
    const growth = squadGrowth(state).attacker;
    for (const [agentId, g] of Object.entries(growth)) await applyAgentGrowth(agentId, g);
    if (result.killed) await payoutBoss(state.bossId);
    return { damage, hpRemaining: result.hpRemaining, killed: result.killed, growth };
  },
};

async function bestSingleAgent(playerId: string): Promise<AgentWithDimensions | null> {
  const agents = await getPlayerAgents(playerId);
  const full = (await Promise.all(agents.map((a) => getAgentWithDimensions(a.id)))).filter(
    (a): a is AgentWithDimensions => !!a && a.dimensions.length > 0
  );
  const total = (a: AgentWithDimensions) => a.dimensions.reduce((s, d) => s + d.value, 0);
  return full.sort((a, b) => total(b) - total(a))[0] ?? null;
}

/** Validates the boss and daily limit, then creates the attempt session. Stale raid sessions are resolved by the caller first. */
export async function startRaidAttempt(player: Player, deps: ServiceDeps): Promise<ServiceResult> {
  const boss = await getActiveBoss();
  if (!boss) return fail(409, "no_active_boss");
  const def = bossByKey(boss.bossKey);
  if (!def) return fail(500, "internal");

  const used = (await countRaidAttemptsToday(player.id)) + (await deps.store.countActiveToday({ playerId: player.id, mode: "raid" }));
  if (used >= MAX_RAID_ATTEMPTS) return fail(429, "raid_limit_reached");

  let attackers = await getOrBuildSquad(player.id);
  let solo = false;
  if (!attackers) {
    const best = await bestSingleAgent(player.id);
    if (!best) return fail(409, "no_agents");
    attackers = [best];
    solo = true;
  }

  const ctx = { def, stats: boss.stats, maxHp: boss.maxHp, hpAtStart: boss.hpRemaining, solo };
  const state: RaidSessionState = { ...createRaidAttempt({ playerId: player.id, agents: attackers }, ctx, deps.rng), bossId: boss.id, label: attackers[0].name };
  const session = await deps.store.create({ mode: "raid", playerId: player.id, attackerId: null, defenderId: null, state });
  return { status: 200, body: { sessionId: session.id, state, attackers, defenders: [bossAgent(def)] } };
}

export async function getRaidView(input: { walletAddress?: string }): Promise<ServiceResult> {
  const boss = (await getActiveBoss()) ?? (await getLatestBoss());
  if (!boss) return { status: 200, body: { boss: null } };
  const def = bossByKey(boss.bossKey);
  const player = input.walletAddress ? await getPlayerByWallet(input.walletAddress) : null;
  const [contributions, recentHits, attemptsUsed] = await Promise.all([
    getContributions(boss.id),
    getRecentHits(boss.id, 15),
    player ? countRaidAttemptsToday(player.id) : Promise.resolve(0),
  ]);
  const phase = phaseFor(boss.hpRemaining, boss.maxHp);
  const myIndex = player ? contributions.findIndex((c) => c.playerId === player.id) : -1;
  return {
    status: 200,
    body: {
      boss,
      def: def ?? null,
      phase,
      weakness: def ? currentWeakness(def, phase) : null,
      contributions: contributions.slice(0, 20).map((c, i) => ({ ...c, rank: i + 1, isMe: c.playerId === player?.id })),
      participants: contributions.length,
      myRank: myIndex >= 0 ? myIndex + 1 : null,
      myDamage: myIndex >= 0 ? contributions[myIndex].damage : 0,
      attemptsLeft: player ? Math.max(0, MAX_RAID_ATTEMPTS - attemptsUsed) : null,
      maxAttempts: MAX_RAID_ATTEMPTS,
      recentHits,
    },
  };
}
