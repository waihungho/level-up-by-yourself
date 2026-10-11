import { applyAgentGrowth, getPlayerByWallet } from "@/lib/db";
import { getAttemptBonusToday, getTitles } from "@/lib/shop/shop-db";
import { withGear } from "@/lib/shop/gear-db";
import { getOrBuildSquad, strongestAgent } from "@/lib/squads";
import { fail, runDeferred, usedToday, withinLimitAfterCreate, type ModeHandler, type ServiceDeps, type ServiceResult } from "@/lib/tactical/service-common";
import { squadGrowth, type SquadAction } from "@/lib/tactical/squad";
import { parseSquadAction, squadInvalidCode } from "@/lib/tactical/squad-service";
import type { Player } from "@/lib/types";
import { bossAgent, bossByKey } from "./bosses";
import { applyRaidDamage, countRaidAttemptsToday, getActiveBoss, getLatestBoss, getRaidStandings, getRecentHits, getUnpaidFinishedBoss, MAX_RAID_ATTEMPTS, payoutBoss } from "./raid-db";
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

/** Base daily raid attempts plus any Raid Tickets bought today. */
async function raidLimitToday(playerId: string): Promise<number> {
  return MAX_RAID_ATTEMPTS + (await getAttemptBonusToday({ playerId, mode: "raid" }));
}

export const raidHandler: ModeHandler<RaidSessionState> = {
  parseAction: (raw) => parseSquadAction(raw) as ReturnType<ModeHandler<RaidSessionState>["parseAction"]>,
  resolve: (state, action, rng) => resolveRaidRound(state, action as unknown as SquadAction, rng, { manual: true }) as RaidSessionState,
  auto: (state, rng) => runRaidAuto(state, rng) as RaidSessionState,
  invalidCode: squadInvalidCode,
  async finalize(session, state, deps) {
    const result = await applyRaidDamage({
      bossId: state.bossId,
      playerId: session.playerId,
      damage: attemptDamage(state),
      bestHit: bestHit(state),
      counters: state.counters,
      label: state.label,
      createdAt: session.createdAt,
    });
    const growth = squadGrowth(state).attacker;
    await Promise.all(Object.entries(growth).map(([agentId, g]) => applyAgentGrowth(agentId, g)));
    // Paying every raider is slow; never make the killing player's request wait for it.
    if (result.killed) await runDeferred(deps, "raid payout", async () => void (await payoutBoss(state.bossId)));
    return { damage: result.applied, hpRemaining: result.hpRemaining, killed: result.killed, growth };
  },
};

/** Validates the boss and daily limit, then creates the attempt session. Stale raid sessions are resolved by the caller first. */
export async function startRaidAttempt(player: Player, deps: ServiceDeps): Promise<ServiceResult> {
  const boss = await getActiveBoss();
  if (!boss) return fail(409, "no_active_boss");
  const def = bossByKey(boss.bossKey);
  if (!def) return fail(500, "internal");

  const used = () => usedToday(countRaidAttemptsToday(player.id), deps.store, { playerId: player.id, mode: "raid" });
  const limit = await raidLimitToday(player.id);
  if ((await used()) >= limit) return fail(429, "raid_limit_reached");

  let attackers = await getOrBuildSquad(player.id);
  let solo = false;
  if (!attackers) {
    const best = await strongestAgent(player.id);
    if (!best) return fail(409, "no_agents");
    attackers = [best];
    solo = true;
  }

  const ctx = { def, stats: boss.stats, maxHp: boss.maxHp, hpAtStart: boss.hpRemaining, solo };
  const fighters = await withGear(attackers);
  const state: RaidSessionState = { ...createRaidAttempt({ playerId: player.id, agents: fighters }, ctx, deps.rng), bossId: boss.id, label: fighters[0].name };
  const session = await deps.store.create({ mode: "raid", playerId: player.id, attackerId: null, defenderId: null, state });
  if (!(await withinLimitAfterCreate(session, used, limit, deps))) return fail(429, "raid_limit_reached");
  return { status: 200, body: { sessionId: session.id, state, attackers: fighters, defenders: [bossAgent(def)] } };
}

/** Resumes a payout that failed or was interrupted (cheap check; runs deferred when possible). */
export async function retryPendingPayout(deps: Pick<ServiceDeps, "defer"> = {}): Promise<void> {
  const unpaid = await getUnpaidFinishedBoss();
  if (unpaid) await runDeferred(deps as ServiceDeps, "raid payout retry", async () => void (await payoutBoss(unpaid.id)));
}

export async function getRaidView(input: { walletAddress?: string }, deps: Pick<ServiceDeps, "defer"> = {}): Promise<ServiceResult> {
  // The payout check doesn't affect this response; with `defer` it runs after the response is sent.
  if (deps.defer) deps.defer(() => retryPendingPayout().catch((e) => console.error("[raid payout retry]", e)));
  else await retryPendingPayout(deps);
  const [active, player] = await Promise.all([
    getActiveBoss(),
    input.walletAddress ? getPlayerByWallet(input.walletAddress) : Promise.resolve(null),
  ]);
  const boss = active ?? (await getLatestBoss());
  if (!boss) return { status: 200, body: { boss: null } };
  const def = bossByKey(boss.bossKey);
  const [standings, recentHits, attemptsUsed, maxAttempts] = await Promise.all([
    getRaidStandings(boss.id, player?.id ?? null, 20),
    getRecentHits(boss.id, 15),
    player ? countRaidAttemptsToday(player.id) : Promise.resolve(0),
    player ? raidLimitToday(player.id) : Promise.resolve(MAX_RAID_ATTEMPTS),
  ]);
  const phase = phaseFor(boss.hpRemaining, boss.maxHp);
  const titles = await getTitles(standings.top.map((c) => c.playerId));
  return {
    status: 200,
    body: {
      boss,
      def: def ?? null,
      phase,
      weakness: def ? currentWeakness(def, phase) : null,
      contributions: standings.top.map((c, i) => ({ ...c, rank: i + 1, isMe: c.playerId === player?.id })),
      participants: standings.participants,
      myRank: standings.me?.rank ?? null,
      myDamage: standings.me?.damage ?? 0,
      attemptsLeft: player ? Math.max(0, maxAttempts - attemptsUsed) : null,
      maxAttempts,
      recentHits,
      titles,
    },
  };
}
