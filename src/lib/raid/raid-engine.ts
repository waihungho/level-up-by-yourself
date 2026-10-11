import type { AgentWithDimensions } from "@/lib/types";
import { CYCLE } from "@/lib/tactical/constants";
import { strongestCategory, weightedCategory, type ExchangeMods } from "@/lib/tactical/engine";
import type { Rng } from "@/lib/tactical/rng";
import { buildTeam, resolveSquadRound, squadAiAction, type SquadAction, type SquadState, type TeamState } from "@/lib/tactical/squad";
import type { Category, Intent, SideState } from "@/lib/tactical/types";
import type { BossDef, BossStats } from "./bosses";

export const RAID_MAX_ROUNDS = 10;
export const SOLO_DAMAGE_MULT = 1.5;
export const WEAKNESS_MULT = 1.5;
export const RESIST_MULT = 0.5;
export const ENRAGE_MULT = 1.3;
export const ENRAGE_COUNTER_MULT = 1.75;
/** Median total damage of a 150-stat squad attempt vs a 150-stat boss (from raid-engine simulation). */
export const MEDIAN_ATTEMPT_DAMAGE = 14_000;

export type RaidPhase = 1 | 2 | 3;

export interface RaidContext {
  def: BossDef;
  stats: BossStats;
  maxHp: number;
  hpAtStart: number;
  solo: boolean;
}

export interface RaidState extends SquadState {
  raid: RaidContext;
}

export function phaseFor(hpRemaining: number, maxHp: number): RaidPhase {
  const pct = maxHp > 0 ? hpRemaining / maxHp : 0;
  if (pct > 0.66) return 1;
  if (pct > 0.33) return 2;
  return 3;
}

export function currentWeakness(def: BossDef, phase: RaidPhase): Category {
  return phase === 1 ? def.weak : def.p2Weak;
}

function bossSide(state: RaidState): SideState {
  return state.teams.defender.members[0];
}

function currentPhase(state: RaidState): RaidPhase {
  return phaseFor(bossSide(state).hp, state.raid.maxHp);
}

function bossTeam(ctx: RaidContext): TeamState {
  const hp = Math.max(1, Math.min(ctx.hpAtStart, ctx.maxHp));
  const boss: SideState = {
    agentId: `boss:${ctx.def.key}`,
    role: ctx.def.role,
    hp,
    maxHp: ctx.maxHp,
    focus: 0,
    stunned: false,
    insightRounds: 0,
    catAvg: { ...ctx.stats.catAvg },
    speed: ctx.stats.speed,
  };
  return { playerId: "boss", members: [boss], active: 0, focus: 0, synergy: { name: "none" }, lastSwapRound: -99, participated: [false] };
}

export function raidMods(state: SquadState): ExchangeMods {
  const s = state as RaidState;
  const phase = currentPhase(s);
  const weak = currentWeakness(s.raid.def, phase);
  const resist = s.raid.def.resist;
  const solo = s.raid.solo ? SOLO_DAMAGE_MULT : 1;
  return {
    outgoingMult: {
      attacker: (c) => (c === weak ? WEAKNESS_MULT : c === resist ? RESIST_MULT : 1) * solo,
      defender: () => (phase === 3 ? ENRAGE_MULT : 1),
    },
    counterMult: phase === 3 ? ENRAGE_COUNTER_MULT : undefined,
    defenderStunImmune: true,
    defenderNoFeint: true,
  };
}

/** Intent for the upcoming round (state.round + 1): ULTIMATE on the phase cadence, otherwise a weighted strike. */
export function raidIntent(state: SquadState, rng: Rng): Intent {
  const s = state as RaidState;
  const boss = bossSide(s);
  const phase = currentPhase(s);
  const next = s.round + 1;
  if ((phase === 2 && next % 4 === 0) || (phase === 3 && next % 3 === 0)) {
    return { kind: "ultimate", category: strongestCategory(boss) };
  }
  return { kind: "strike", category: weightedCategory(boss, rng) };
}

export function createRaidAttempt(player: { playerId: string; agents: AgentWithDimensions[] }, ctx: RaidContext, rng: Rng): RaidState {
  const state: RaidState = {
    mode: "raid",
    round: 0,
    maxRounds: RAID_MAX_ROUNDS,
    teams: { attacker: buildTeam(player.playerId, player.agents), defender: bossTeam(ctx) },
    intent: { kind: "strike", category: CYCLE[0] },
    manualActions: 0,
    counters: 0,
    manualCounters: 0,
    rounds: [],
    finished: false,
    winner: null,
    damageDealt: 0,
    raid: ctx,
  };
  state.intent = raidIntent(state, rng);
  return state;
}

export function resolveRaidRound(state: RaidState, action: SquadAction, rng: Rng, opts: { manual: boolean }): RaidState {
  return resolveSquadRound(state, action, rng, { manual: opts.manual, mods: raidMods, nextIntent: raidIntent }) as RaidState;
}

export function runRaidAuto(state: RaidState, rng: Rng): RaidState {
  let s = state;
  while (!s.finished) s = resolveRaidRound(s, squadAiAction(s, rng), rng, { manual: false });
  return s;
}

export function attemptDamage(state: RaidState): number {
  return Math.min(state.damageDealt, state.raid.hpAtStart);
}
