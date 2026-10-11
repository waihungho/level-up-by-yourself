import type { BattleRound, DimensionCategory, RoleCategory } from "@/lib/types";

export type Category = DimensionCategory;

export type Intent =
  | { kind: "strike"; category: Category }
  | { kind: "special" }
  | { kind: "stunned" }
  // Boss only (raids): a telegraphed heavy strike that punishes not guarding.
  | { kind: "ultimate"; category: Category };

export type PlayerAction =
  | { type: "strike"; category: Category }
  | { type: "guard" }
  | { type: "special" };

export type Action = PlayerAction | { type: "auto" };

export type BattleMode = "training" | "pvp";

export type SideKey = "attacker" | "defender";

export interface SideState {
  agentId: string;
  role: RoleCategory;
  hp: number;
  maxHp: number;
  focus: number;
  stunned: boolean;
  insightRounds: number;
  catAvg: Record<Category, number>;
  speed: number;
}

export interface TacticalRound extends BattleRound {
  playerAction: "strike" | "guard" | "special" | "stunned" | "swap";
  actionCategory?: Category;
  opponentIntent: string;
  opponentAction: string;
  countered: boolean;
  /** The player chose this round's action (not Auto). */
  manual?: boolean;
  /** The defender's strike beat the attacker's category. */
  counteredBy?: boolean;
  feint: boolean;
  special?: string;
  // Squad / raid fields
  actorSlot?: number;
  swap?: { side: SideKey; from: number; to: number; tag: boolean };
  ko?: { side: SideKey; slot: number };
}

export interface TacticalState {
  mode: BattleMode;
  /** Completed rounds; doubles as the optimistic-concurrency version. */
  round: number;
  sides: Record<SideKey, SideState>;
  /** The defender's telegraphed intent for the next round. */
  intent: Intent;
  manualActions: number;
  counters: number;
  /** Counters landed on manual turns (only these earn the mastery bonus). */
  manualCounters: number;
  rounds: TacticalRound[];
  finished: boolean;
  winner: SideKey | null;
}

export class InvalidActionError extends Error {}
