import { calculateGrowth } from "@/lib/battle-engine";
import type { AgentWithDimensions, RoleCategory } from "@/lib/types";
import {
  AI_SWAP_COOLDOWN,
  AI_SWAP_HP,
  CYCLE,
  ROLE_CATEGORY,
  SPECIAL_COST,
  SQUAD_GROWTH_FACTOR,
  SQUAD_HP_FACTOR,
  SQUAD_MAX_ROUNDS,
  SQUAD_SIZE,
  SWAP_INCOMING_MULT,
  SYNERGY_LEGION,
  SYNERGY_LEGION_OFF,
  SYNERGY_PAIR,
  SYNERGY_TRINITY,
} from "./constants";
import {
  categoriesUsed,
  chooseIntent,
  counterFor,
  endOfRoundFocus,
  masteryMultiplier,
  resolveExchange,
  strongestCategory,
  toRoundRecord,
  toSide,
  type ExchangeMods,
} from "./engine";
import type { Rng } from "./rng";
import { InvalidActionError, type Category, type Intent, type PlayerAction, type SideKey, type SideState, type TacticalRound } from "./types";

export type SynergyName = "trinity" | "pair" | "legion" | "none";
export interface Synergy {
  name: SynergyName;
  role?: RoleCategory;
}

export interface TeamState {
  playerId: string;
  members: SideState[];
  active: number;
  /** Shared team focus (member.focus is unused in squads). */
  focus: number;
  synergy: Synergy;
  lastSwapRound: number;
  participated: boolean[];
}

export type SquadAction = PlayerAction | { type: "swap"; slot: number };
export type SquadMode = "squad_pvp" | "raid";

export interface SquadState {
  mode: SquadMode;
  round: number;
  maxRounds: number;
  teams: Record<SideKey, TeamState>;
  intent: Intent;
  manualActions: number;
  counters: number;
  rounds: TacticalRound[];
  finished: boolean;
  winner: SideKey | null;
  /** Total damage the attacker team has dealt (raids score this). */
  damageDealt: number;
}

export interface SquadRoundOpts {
  manual: boolean;
  /** Extra per-round modifiers (raids: weakness, enrage, counter boost). */
  mods?: (state: SquadState) => ExchangeMods;
  /** Overrides the defender's next intent (raids: boss ULTIMATE cadence). */
  nextIntent?: (state: SquadState, rng: Rng) => Intent;
}

export function synergyFor(roles: RoleCategory[]): Synergy {
  if (roles.length < SQUAD_SIZE) return { name: "none" };
  const counts = new Map<RoleCategory, number>();
  for (const r of roles) counts.set(r, (counts.get(r) ?? 0) + 1);
  if (counts.size === 3) return { name: "trinity" };
  if (counts.size === 1) return { name: "legion", role: roles[0] };
  const pairRole = [...counts.entries()].find(([, n]) => n === 2)![0];
  return { name: "pair", role: pairRole };
}

export function synergyMult(team: TeamState, memberIndex: number, c: Category): number {
  const { synergy } = team;
  if (synergy.name === "trinity") return SYNERGY_TRINITY;
  if (synergy.name === "pair") {
    const member = team.members[memberIndex];
    return member.role === synergy.role && ROLE_CATEGORY[synergy.role!] === c ? SYNERGY_PAIR : 1;
  }
  if (synergy.name === "legion") return ROLE_CATEGORY[synergy.role!] === c ? SYNERGY_LEGION : SYNERGY_LEGION_OFF;
  return 1;
}

export function buildTeam(playerId: string, agents: AgentWithDimensions[], hpFactor = SQUAD_HP_FACTOR): TeamState {
  return {
    playerId,
    members: agents.map((a) => toSide(a, hpFactor)),
    active: 0,
    focus: 0,
    synergy: synergyFor(agents.map((a) => a.role)),
    lastSwapRound: -99,
    participated: agents.map(() => false),
  };
}

function activeSide(team: TeamState): SideState {
  return { ...team.members[team.active], focus: team.focus };
}

function nextLiving(team: TeamState): number {
  for (let i = 1; i <= team.members.length; i++) {
    const idx = (team.active + i) % team.members.length;
    if (team.members[idx].hp > 0) return idx;
  }
  return -1;
}

function totalHpPct(team: TeamState): number {
  const hp = team.members.reduce((s, m) => s + m.hp, 0);
  const max = team.members.reduce((s, m) => s + m.maxHp, 0);
  return max > 0 ? hp / max : 0;
}

export function createSquadBattle(
  a: { playerId: string; agents: AgentWithDimensions[] },
  d: { playerId: string; agents: AgentWithDimensions[] },
  rng: Rng
): SquadState {
  const teams = { attacker: buildTeam(a.playerId, a.agents), defender: buildTeam(d.playerId, d.agents) };
  return {
    mode: "squad_pvp",
    round: 0,
    maxRounds: SQUAD_MAX_ROUNDS,
    teams,
    intent: chooseIntent(activeSide(teams.defender), rng),
    manualActions: 0,
    counters: 0,
    rounds: [],
    finished: false,
    winner: null,
    damageDealt: 0,
  };
}

export function resolveSquadRound(state: SquadState, action: SquadAction, rng: Rng, opts: SquadRoundOpts): SquadState {
  if (state.finished) throw new InvalidActionError("battle already finished");
  const s = structuredClone(state);
  const A = s.teams.attacker;
  const D = s.teams.defender;
  const extra = opts.mods?.(s) ?? {};

  let exAction: PlayerAction;
  let swap: TacticalRound["swap"];
  let incoming = extra.incomingMultAttacker;
  let skip = extra.attackerSkipsAction;

  if (action.type === "swap") {
    const slot = action.slot;
    const target = A.members[slot];
    if (!Number.isInteger(slot) || !target || slot === A.active || target.hp <= 0) throw new InvalidActionError("invalid_swap");
    if (A.members[A.active].stunned) throw new InvalidActionError("stunned agents cannot swap");
    const from = A.active;
    A.active = slot;
    A.lastSwapRound = s.round + 1;
    const tag = A.focus >= SPECIAL_COST;
    exAction = tag ? { type: "special" } : { type: "guard" };
    skip = !tag;
    incoming = (incoming ?? 1) * SWAP_INCOMING_MULT;
    swap = { side: "attacker", from, to: slot, tag };
  } else {
    exAction = action;
  }

  const mods: ExchangeMods = {
    ...extra,
    incomingMultAttacker: incoming,
    attackerSkipsAction: skip,
    outgoingMult: {
      attacker: (c) => synergyMult(A, A.active, c) * (extra.outgoingMult?.attacker?.(c) ?? 1),
      defender: (c) => synergyMult(D, D.active, c) * (extra.outgoingMult?.defender?.(c) ?? 1),
    },
  };

  const ex = resolveExchange(activeSide(A), activeSide(D), s.intent, exAction, rng, mods);
  const atk = endOfRoundFocus(ex.attacker, { guard: ex.playerAction === "guard", counter: ex.countered });
  const def = endOfRoundFocus(ex.defender, { guard: false, counter: ex.counteredBy });
  A.focus = atk.focus;
  D.focus = def.focus;
  A.members[A.active] = { ...atk, focus: 0 };
  D.members[D.active] = { ...def, focus: 0 };
  A.participated[A.active] = true;
  D.participated[D.active] = true;

  const round = s.round + 1;
  const record = toRoundRecord(round, s.intent, ex, atk.hp, def.hp);
  record.actorSlot = A.active;
  if (swap) {
    record.swap = swap;
    record.playerAction = "swap";
  }

  for (const [side, team] of [["defender", D], ["attacker", A]] as const) {
    if (team.members[team.active].hp <= 0) {
      record.ko = { side, slot: team.active };
      const next = nextLiving(team);
      if (next >= 0) team.active = next;
    }
  }

  const attackerAlive = A.members.some((m) => m.hp > 0);
  const defenderAlive = D.members.some((m) => m.hp > 0);
  let winner: SideKey | null = null;
  if (!defenderAlive) winner = "attacker";
  else if (!attackerAlive) winner = "defender";
  else if (round >= s.maxRounds) winner = totalHpPct(A) > totalHpPct(D) ? "attacker" : "defender";

  s.round = round;
  s.rounds.push(record);
  s.damageDealt += ex.attackerDamage;
  s.manualActions += opts.manual ? 1 : 0;
  s.counters += ex.countered ? 1 : 0;
  s.finished = winner !== null;
  s.winner = winner;
  if (!winner) s.intent = opts.nextIntent ? opts.nextIntent(s, rng) : chooseIntent(activeSide(D), rng);
  return s;
}

function lastOpponentCategory(state: SquadState): Category | null {
  const last = state.rounds[state.rounds.length - 1];
  if (!last) return null;
  const cat = last.opponentAction.replace("ULTIMATE ", "") as Category;
  return CYCLE.includes(cat) ? cat : null;
}

/** Auto policy for the attacker's squad (no intent reading, like tactical Auto). */
export function squadAiAction(state: SquadState): SquadAction {
  const team = state.teams.attacker;
  const me = activeSide(team);
  if (me.stunned) return { type: "guard" };
  if (state.intent.kind === "ultimate") return { type: "guard" };
  if (state.intent.kind === "special" && me.hp < me.maxHp * 0.5) return { type: "guard" };

  const lastCat = lastOpponentCategory(state);
  if (me.hp < me.maxHp * AI_SWAP_HP && lastCat && state.round + 1 - team.lastSwapRound >= AI_SWAP_COOLDOWN) {
    const wanted = counterFor(lastCat);
    const slot = team.members.findIndex((m, i) => i !== team.active && m.hp > 0 && strongestCategory(m) === wanted);
    if (slot >= 0) return { type: "swap", slot };
  }

  if (me.focus >= SPECIAL_COST) return { type: "special" };
  return { type: "strike", category: strongestCategory(me) };
}

export function runSquadAuto(state: SquadState, rng: Rng, opts: Omit<SquadRoundOpts, "manual"> = {}): SquadState {
  let s = state;
  while (!s.finished) s = resolveSquadRound(s, squadAiAction(s), rng, { ...opts, manual: false });
  return s;
}

function scale(growth: Record<number, number>, mult: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(growth)) out[Number(k)] = parseFloat((v * mult).toFixed(2));
  return out;
}

/** Growth per participating agent: ×0.6, attacker team also gets the mastery bonus. */
export function squadGrowth(state: SquadState): Record<SideKey, Record<string, Record<number, number>>> {
  const cats = categoriesUsed(state.rounds);
  const out: Record<SideKey, Record<string, Record<number, number>>> = { attacker: {}, defender: {} };
  for (const side of ["attacker", "defender"] as const) {
    const team = state.teams[side];
    const won = state.winner === side;
    const mult = SQUAD_GROWTH_FACTOR * (side === "attacker" ? masteryMultiplier(state) : 1);
    team.members.forEach((m, i) => {
      if (team.participated[i]) out[side][m.agentId] = scale(calculateGrowth(cats, won), mult);
    });
  }
  return out;
}
