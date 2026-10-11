import type { Gear } from "@/lib/shop/catalog";

export type RoleCategory = "future" | "modern" | "medieval";

export type DimensionCategory = "Physical" | "Mental" | "Social" | "Spiritual" | "Technical";

export interface Dimension {
  id: number;
  name: string;
  category: DimensionCategory;
}

export interface Player {
  id: string;
  walletAddress: string;
  abilityScore: number;
  lastSummonAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  playerId: string;
  name: string;
  role: RoleCategory;
  roleTitle: string;
  character: string;
  objective: string;
  spriteSeed: Record<string, unknown>;
  createdAt: string;
}

export interface AgentDimension {
  agentId: string;
  dimensionId: number;
  value: number;
}

export interface AgentWithDimensions extends Agent {
  dimensions: AgentDimension[];
  /** Equipment levels (battle-time bonuses); attached by withGear() when building fighters. */
  gear?: Gear;
  /** Bought aura style, shown around the sprite in battle. */
  aura?: string;
}

export interface DailyTask {
  id: string;
  name: string;
  description: string;
  abilityPoints: number;
}

export interface GrowthLog {
  agentId: string;
  date: string;
  dimensionChanges: Record<number, number>;
  narrative: string;
}

export interface GrowthTier {
  minScore: number;
  maxScore: number;
  multiplier: number;
}

export interface BattleRound {
  roundNumber: number;
  category: string;
  firstAttacker: string;
  firstDamage: number;
  secondDamage: number;
  attackerHpAfter: number;
  defenderHpAfter: number;
  // Tactical battle fields (absent on legacy logs)
  playerAction?: string;
  actionCategory?: string;
  opponentIntent?: string;
  opponentAction?: string;
  countered?: boolean;
  manual?: boolean;
  feint?: boolean;
  special?: string;
}

export interface BattleLog {
  id: string;
  attackerId: string;
  defenderId: string;
  winnerId: string;
  rounds: BattleRound[];
  attackerGrowth: Record<number, number>;
  defenderGrowth: Record<number, number>;
  createdAt: string;
  pvp?: boolean;
  tactical?: boolean;
  manualActions?: number;
}

export type CategoryWeight = "low" | "medium" | "high";

export interface RoleWeightMap {
  Physical: CategoryWeight;
  Mental: CategoryWeight;
  Social: CategoryWeight;
  Spiritual: CategoryWeight;
  Technical: CategoryWeight;
}

export interface PvpStats {
  agentId: string;
  wins: number;
  losses: number;
}
