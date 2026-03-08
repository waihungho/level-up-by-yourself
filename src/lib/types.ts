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

export type CategoryWeight = "low" | "medium" | "high";

export interface RoleWeightMap {
  Physical: CategoryWeight;
  Mental: CategoryWeight;
  Social: CategoryWeight;
  Spiritual: CategoryWeight;
  Technical: CategoryWeight;
}
