import { DIMENSIONS } from "@/lib/constants";
import { calculateGrowth } from "@/lib/battle-engine";
import type { AgentWithDimensions, BattleLog } from "@/lib/types";
import {
  AI_SPECIAL_CHANCE,
  COUNTER_INTERRUPT,
  COUNTER_MULT,
  CYCLE,
  DEF_K,
  DMG_K,
  FEINT_MAX,
  FEINT_MIN,
  FEINT_SOCIAL_K,
  GUARD_REDUCTION,
  HP_K,
  INSIGHT_BONUS,
  INTENT_WEIGHT_EXP,
  INSIGHT_ROUNDS,
  MASTERY_MAX,
  MASTERY_PER_COUNTER,
  MAX_FOCUS,
  MAX_ROUNDS,
  ROLE_BONUS,
  ROLE_CATEGORY,
  SPECIAL_COST,
  SPECIALS,
  ULTIMATE_MULT,
} from "./constants";
import type { Rng } from "./rng";
import {
  InvalidActionError,
  type BattleMode,
  type Category,
  type Intent,
  type PlayerAction,
  type SideKey,
  type SideState,
  type TacticalRound,
  type TacticalState,
} from "./types";

const SPEED_DIMENSION_ID = 8;
const SHIELD_BASH_IMMUNE_MULT = 1.5;

// ---------------------------------------------------------------------------
// Cycle helpers
// ---------------------------------------------------------------------------

export function beats(a: Category, b: Category): boolean {
  return CYCLE[(CYCLE.indexOf(a) + 1) % CYCLE.length] === b;
}

export function counterFor(c: Category): Category {
  return CYCLE[(CYCLE.indexOf(c) + CYCLE.length - 1) % CYCLE.length];
}

export function strongestCategory(side: SideState): Category {
  return CYCLE.reduce((best, c) => (side.catAvg[c] > side.catAvg[best] ? c : best), CYCLE[0]);
}

export function feintChance(side: SideState): number {
  const social = side.catAvg.Social;
  return Math.min(FEINT_MAX, Math.max(FEINT_MIN, social / (social + FEINT_SOCIAL_K)));
}

export function masteryMultiplier(state: { manualActions: number; counters: number }): number {
  if (state.manualActions <= 0) return 1;
  return Math.min(1 + MASTERY_PER_COUNTER * state.counters, MASTERY_MAX);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function toSide(agent: AgentWithDimensions, hpFactor = 1): SideState {
  const value = (dimId: number) => agent.dimensions.find((d) => d.dimensionId === dimId)?.value ?? 10;
  const catAvg = {} as Record<Category, number>;
  for (const c of CYCLE) {
    const ids = DIMENSIONS.filter((d) => d.category === c).map((d) => d.id);
    catAvg[c] = ids.reduce((sum, id) => sum + value(id), 0) / ids.length;
  }
  const maxHp = Math.max(1, Math.round(DIMENSIONS.reduce((sum, d) => sum + value(d.id), 0) * HP_K * hpFactor));
  return {
    agentId: agent.id,
    role: agent.role,
    hp: maxHp,
    maxHp,
    focus: 0,
    stunned: false,
    insightRounds: 0,
    catAvg,
    speed: value(SPEED_DIMENSION_ID),
  };
}

/** Samples a strike category weighted by catAvg^INTENT_WEIGHT_EXP (agents favour their strengths). */
export function weightedCategory(side: SideState, rng: Rng): Category {
  const weights = CYCLE.map((c) => side.catAvg[c] ** INTENT_WEIGHT_EXP);
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < CYCLE.length; i++) {
    roll -= weights[i];
    if (roll < 0) return CYCLE[i];
  }
  return CYCLE[CYCLE.length - 1];
}

export function chooseIntent(side: SideState, rng: Rng): Intent {
  if (side.stunned) return { kind: "stunned" };
  if (side.focus >= SPECIAL_COST && rng() < AI_SPECIAL_CHANCE) return { kind: "special" };
  return { kind: "strike", category: weightedCategory(side, rng) };
}

export function createBattle(
  attacker: AgentWithDimensions,
  defender: AgentWithDimensions,
  mode: BattleMode,
  rng: Rng
): TacticalState {
  const sides = { attacker: toSide(attacker), defender: toSide(defender) };
  return {
    mode,
    round: 0,
    sides,
    intent: chooseIntent(sides.defender, rng),
    manualActions: 0,
    counters: 0,
    rounds: [],
    finished: false,
    winner: null,
  };
}

// ---------------------------------------------------------------------------
// Exchange (one clash between two active fighters)
// ---------------------------------------------------------------------------

export interface ExchangeMods {
  outgoingMult?: { attacker?: (c: Category) => number; defender?: (c: Category) => number };
  incomingMultAttacker?: number;
  counterMult?: number;
  defenderStunImmune?: boolean;
  defenderNoFeint?: boolean;
  attackerSkipsAction?: boolean;
}

export interface ExchangeResult {
  attacker: SideState;
  defender: SideState;
  attackerDamage: number;
  defenderDamage: number;
  countered: boolean;
  counteredBy: boolean;
  feint: boolean;
  attackerFirst: boolean;
  playerAction: TacticalRound["playerAction"];
  actionCategory?: Category;
  opponentAction: string;
  special?: string;
}

type Move =
  | { kind: "none" }
  | { kind: "guard" }
  | { kind: "strike"; category: Category }
  | { kind: "special" }
  | { kind: "ultimate"; category: Category };

function baseDamage(
  src: SideState,
  dst: SideState,
  c: Category,
  rng: Rng,
  outMult: number,
  ignoreDefense: boolean
): number {
  const roleBonus = ROLE_CATEGORY[src.role] === c ? ROLE_BONUS : 1;
  const raw = src.catAvg[c] * (0.85 + 0.3 * rng()) * DMG_K * roleBonus * outMult;
  const reduction = ignoreDefense ? 0 : dst.catAvg[c] * DEF_K;
  return Math.max(raw - reduction, 5);
}

/** Damage a move deals before situational multipliers (counter, guard, insight). */
function moveDamage(
  move: Move,
  src: SideState,
  dst: SideState,
  rng: Rng,
  outgoing: ((c: Category) => number) | undefined,
  dstStunImmune: boolean
): number {
  const out = (c: Category) => outgoing?.(c) ?? 1;
  if (move.kind === "strike" || move.kind === "ultimate") {
    return baseDamage(src, dst, move.category, rng, out(move.category), false);
  }
  if (move.kind === "special") {
    const sp = SPECIALS[src.role];
    const immuneBonus = src.role === "medieval" && dstStunImmune ? SHIELD_BASH_IMMUNE_MULT : 1;
    return baseDamage(src, dst, sp.category, rng, sp.mult * immuneBonus * out(sp.category), src.role === "future");
  }
  return 0;
}

function moveLabel(move: Move): string {
  if (move.kind === "strike" || move.kind === "ultimate") return move.kind === "ultimate" ? `ULTIMATE ${move.category}` : move.category;
  if (move.kind === "special") return "Special";
  if (move.kind === "guard") return "Guard";
  return "None";
}

export function resolveExchange(
  attackerIn: SideState,
  defenderIn: SideState,
  intent: Intent,
  action: PlayerAction,
  rng: Rng,
  mods: ExchangeMods = {}
): ExchangeResult {
  const attacker = { ...attackerIn };
  const defender = { ...defenderIn };

  const attackerStunned = attacker.stunned;
  if (!attackerStunned && !mods.attackerSkipsAction && action.type === "special" && attacker.focus < SPECIAL_COST) {
    throw new InvalidActionError("special requires 3 focus");
  }
  attacker.stunned = false;
  defender.stunned = false;
  const attackerInsight = attacker.insightRounds > 0;
  const defenderInsight = defender.insightRounds > 0;

  // --- Defender move (it executes its telegraphed intent) ---
  let defMove: Move;
  let feint = false;
  if (intent.kind === "stunned") {
    defMove = { kind: "none" };
  } else if (intent.kind === "ultimate") {
    defMove = { kind: "ultimate", category: intent.category };
  } else if (intent.kind === "special") {
    defMove = defender.focus >= SPECIAL_COST ? { kind: "special" } : { kind: "strike", category: strongestCategory(defender) };
  } else {
    let category = intent.category;
    if (!mods.defenderNoFeint && !attackerInsight && rng() < feintChance(defender)) {
      const others = CYCLE.filter((c) => c !== category);
      category = others[Math.floor(rng() * others.length)];
      feint = true;
    }
    defMove = { kind: "strike", category };
  }

  // --- Attacker move ---
  let atkMove: Move;
  let playerAction: TacticalRound["playerAction"];
  if (attackerStunned) {
    atkMove = { kind: "none" };
    playerAction = "stunned";
  } else if (mods.attackerSkipsAction) {
    atkMove = { kind: "none" };
    playerAction = "swap";
  } else if (action.type === "strike") {
    atkMove = { kind: "strike", category: action.category };
    playerAction = "strike";
  } else if (action.type === "guard") {
    atkMove = { kind: "guard" };
    playerAction = "guard";
  } else {
    atkMove = { kind: "special" };
    playerAction = "special";
  }

  const bothStrike = atkMove.kind === "strike" && defMove.kind === "strike";
  const countered = bothStrike && beats((atkMove as { category: Category }).category, (defMove as { category: Category }).category);
  const counteredBy = bothStrike && beats((defMove as { category: Category }).category, (atkMove as { category: Category }).category);
  const counterMult = mods.counterMult ?? COUNTER_MULT;

  // --- Damage ---
  let attackerDamage = moveDamage(atkMove, attacker, defender, rng, mods.outgoingMult?.attacker, !!mods.defenderStunImmune);
  if (countered) attackerDamage *= counterMult;
  if (counteredBy) attackerDamage *= COUNTER_INTERRUPT;
  if (attackerInsight && attackerDamage > 0) attackerDamage *= INSIGHT_BONUS;

  let defenderDamage = moveDamage(defMove, defender, attacker, rng, mods.outgoingMult?.defender, false);
  if (defMove.kind === "ultimate" && atkMove.kind !== "guard") defenderDamage *= ULTIMATE_MULT;
  if (countered) defenderDamage *= COUNTER_INTERRUPT;
  if (counteredBy) defenderDamage *= COUNTER_MULT;
  if (atkMove.kind === "guard") defenderDamage *= 1 - GUARD_REDUCTION;
  if (defenderInsight && defenderDamage > 0) defenderDamage *= INSIGHT_BONUS;
  if (mods.incomingMultAttacker !== undefined) defenderDamage *= mods.incomingMultAttacker;

  attackerDamage = Math.round(attackerDamage);
  defenderDamage = Math.round(defenderDamage);

  // --- Initiative: first hit that KOs cancels the reply ---
  const attackerFirst = attacker.speed + rng() * 5 >= defender.speed + rng() * 5;
  if (attackerFirst) {
    defender.hp = Math.max(defender.hp - attackerDamage, 0);
    if (defender.hp <= 0) defenderDamage = 0;
    attacker.hp = Math.max(attacker.hp - defenderDamage, 0);
  } else {
    attacker.hp = Math.max(attacker.hp - defenderDamage, 0);
    if (attacker.hp <= 0) attackerDamage = 0;
    defender.hp = Math.max(defender.hp - attackerDamage, 0);
  }

  // --- Insight bookkeeping (active rounds tick down, new insight lasts the next 2 rounds) ---
  if (attackerInsight) attacker.insightRounds -= 1;
  if (defenderInsight) defender.insightRounds -= 1;

  // --- Specials: spend focus and apply effects ---
  let special: string | undefined;
  if (atkMove.kind === "special") {
    attacker.focus -= SPECIAL_COST;
    special = SPECIALS[attacker.role].name;
    if (attacker.role === "medieval" && !mods.defenderStunImmune && attackerDamage > 0) defender.stunned = true;
    if (attacker.role === "modern") attacker.insightRounds = INSIGHT_ROUNDS;
  }
  if (defMove.kind === "special") {
    defender.focus -= SPECIAL_COST;
    if (defender.role === "medieval" && defenderDamage > 0) attacker.stunned = true;
    if (defender.role === "modern") defender.insightRounds = INSIGHT_ROUNDS;
  }

  return {
    attacker,
    defender,
    attackerDamage,
    defenderDamage,
    countered,
    counteredBy,
    feint,
    attackerFirst,
    playerAction,
    actionCategory: atkMove.kind === "strike" ? atkMove.category : atkMove.kind === "special" ? SPECIALS[attacker.role].category : undefined,
    opponentAction: defMove.kind === "special" ? `Special: ${SPECIALS[defender.role].name}` : moveLabel(defMove),
    special,
  };
}

export function endOfRoundFocus(side: SideState, gained: { guard: boolean; counter: boolean }): SideState {
  const focus = Math.min(MAX_FOCUS, side.focus + 1 + (gained.guard ? 1 : 0) + (gained.counter ? 1 : 0));
  return { ...side, focus };
}

export function intentLabel(intent: Intent): string {
  if (intent.kind === "strike") return intent.category;
  if (intent.kind === "ultimate") return `ULTIMATE ${intent.category}`;
  return intent.kind === "special" ? "SPECIAL" : "STUNNED";
}

/** Builds the persisted round record from an exchange. */
export function toRoundRecord(
  roundNumber: number,
  intent: Intent,
  ex: ExchangeResult,
  attackerHpAfter: number,
  defenderHpAfter: number
): TacticalRound {
  return {
    roundNumber,
    category: ex.actionCategory ?? (ex.playerAction === "guard" ? "Guard" : "None"),
    firstAttacker: ex.attackerFirst ? ex.attacker.agentId : ex.defender.agentId,
    firstDamage: ex.attackerFirst ? ex.attackerDamage : ex.defenderDamage,
    secondDamage: ex.attackerFirst ? ex.defenderDamage : ex.attackerDamage,
    attackerHpAfter,
    defenderHpAfter,
    playerAction: ex.playerAction,
    actionCategory: ex.actionCategory,
    opponentIntent: intentLabel(intent),
    opponentAction: ex.opponentAction,
    countered: ex.countered,
    counteredBy: ex.counteredBy,
    feint: ex.feint,
    special: ex.special,
  };
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

function decideWinner(a: SideState, d: SideState, round: number, maxRounds: number): SideKey | null {
  if (d.hp <= 0) return "attacker";
  if (a.hp <= 0) return "defender";
  if (round >= maxRounds) return a.hp / a.maxHp > d.hp / d.maxHp ? "attacker" : "defender";
  return null;
}

export function resolveRound(
  state: TacticalState,
  action: PlayerAction,
  rng: Rng,
  opts: { manual: boolean }
): TacticalState {
  if (state.finished) throw new InvalidActionError("battle already finished");
  const ex = resolveExchange(state.sides.attacker, state.sides.defender, state.intent, action, rng);
  const attacker = endOfRoundFocus(ex.attacker, { guard: ex.playerAction === "guard", counter: ex.countered });
  const defender = endOfRoundFocus(ex.defender, { guard: false, counter: ex.counteredBy });
  const round = state.round + 1;
  const winner = decideWinner(attacker, defender, round, MAX_ROUNDS);
  const record = toRoundRecord(round, state.intent, ex, attacker.hp, defender.hp);

  return {
    ...state,
    round,
    sides: { attacker, defender },
    intent: winner ? state.intent : chooseIntent(defender, rng),
    manualActions: state.manualActions + (opts.manual ? 1 : 0),
    counters: state.counters + (ex.countered ? 1 : 0),
    rounds: [...state.rounds, record],
    finished: winner !== null,
    winner,
  };
}

/**
 * Auto policy: does not read intents (manual play is how you counter). It samples
 * strike categories from the same strength-weighted distribution opponents use,
 * so Auto vs AI is symmetric.
 */
export function aiAction(state: TacticalState, rng: Rng): PlayerAction {
  const me = state.sides.attacker;
  if (state.intent.kind === "ultimate") return { type: "guard" };
  if (state.intent.kind === "special" && me.hp < me.maxHp * 0.5) return { type: "guard" };
  if (me.focus >= SPECIAL_COST) return { type: "special" };
  return { type: "strike", category: weightedCategory(me, rng) };
}

/** Intent-reading policy (the spec's counter policy); used by balance sims. */
export function skilledAction(state: TacticalState): PlayerAction {
  const me = state.sides.attacker;
  if (state.intent.kind === "ultimate") return { type: "guard" };
  if (state.intent.kind === "special" && me.hp < me.maxHp * 0.5) return { type: "guard" };
  if (me.focus >= SPECIAL_COST) return { type: "special" };
  if (state.intent.kind === "strike") return { type: "strike", category: counterFor(state.intent.category) };
  return { type: "strike", category: strongestCategory(me) };
}

export function runAuto(state: TacticalState, rng: Rng): TacticalState {
  let s = state;
  while (!s.finished) s = resolveRound(s, aiAction(s, rng), rng, { manual: false });
  return s;
}

function scaleGrowth(growth: Record<number, number>, mult: number): Record<number, number> {
  if (mult === 1) return growth;
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(growth)) out[Number(k)] = parseFloat((v * mult).toFixed(2));
  return out;
}

export function categoriesUsed(rounds: TacticalRound[]): Category[] {
  const used = new Set<Category>();
  for (const r of rounds) {
    if (r.actionCategory) used.add(r.actionCategory);
    const opp = r.opponentAction.replace("ULTIMATE ", "") as Category;
    if (CYCLE.includes(opp)) used.add(opp);
  }
  return used.size ? Array.from(used) : ["Physical"];
}

export function toBattleLog(state: TacticalState, id: string = crypto.randomUUID()): BattleLog {
  if (!state.finished || !state.winner) throw new Error("battle not finished");
  const attackerWon = state.winner === "attacker";
  const cats = categoriesUsed(state.rounds);
  return {
    id,
    attackerId: state.sides.attacker.agentId,
    defenderId: state.sides.defender.agentId,
    winnerId: attackerWon ? state.sides.attacker.agentId : state.sides.defender.agentId,
    rounds: state.rounds,
    attackerGrowth: scaleGrowth(calculateGrowth(cats, attackerWon), masteryMultiplier(state)),
    defenderGrowth: calculateGrowth(cats, !attackerWon),
    createdAt: new Date().toISOString(),
    pvp: state.mode === "pvp",
    tactical: true,
    manualActions: state.manualActions,
  };
}
