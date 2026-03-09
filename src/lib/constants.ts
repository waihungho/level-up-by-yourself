import type { Dimension, GrowthTier, RoleWeightMap } from "./types";

export const DIMENSIONS: Dimension[] = [
  // Physical (10)
  { id: 1, name: "Strength", category: "Physical" },
  { id: 2, name: "Agility", category: "Physical" },
  { id: 3, name: "Endurance", category: "Physical" },
  { id: 4, name: "Vitality", category: "Physical" },
  { id: 5, name: "Reflexes", category: "Physical" },
  { id: 6, name: "Precision", category: "Physical" },
  { id: 7, name: "Resilience", category: "Physical" },
  { id: 8, name: "Speed", category: "Physical" },
  { id: 9, name: "Recovery", category: "Physical" },
  { id: 10, name: "Fortitude", category: "Physical" },
  // Mental (10)
  { id: 11, name: "Intelligence", category: "Mental" },
  { id: 12, name: "Wisdom", category: "Mental" },
  { id: 13, name: "Focus", category: "Mental" },
  { id: 14, name: "Memory", category: "Mental" },
  { id: 15, name: "Creativity", category: "Mental" },
  { id: 16, name: "Logic", category: "Mental" },
  { id: 17, name: "Intuition", category: "Mental" },
  { id: 18, name: "Adaptability", category: "Mental" },
  { id: 19, name: "Perception", category: "Mental" },
  { id: 20, name: "Willpower", category: "Mental" },
  // Social (10)
  { id: 21, name: "Charisma", category: "Social" },
  { id: 22, name: "Leadership", category: "Social" },
  { id: 23, name: "Empathy", category: "Social" },
  { id: 24, name: "Persuasion", category: "Social" },
  { id: 25, name: "Diplomacy", category: "Social" },
  { id: 26, name: "Intimidation", category: "Social" },
  { id: 27, name: "Teamwork", category: "Social" },
  { id: 28, name: "Deception", category: "Social" },
  { id: 29, name: "Loyalty", category: "Social" },
  { id: 30, name: "Influence", category: "Social" },
  // Spiritual (10)
  { id: 31, name: "Spirit", category: "Spiritual" },
  { id: 32, name: "Meditation", category: "Spiritual" },
  { id: 33, name: "Aura", category: "Spiritual" },
  { id: 34, name: "Prophecy", category: "Spiritual" },
  { id: 35, name: "Faith", category: "Spiritual" },
  { id: 36, name: "Harmony", category: "Spiritual" },
  { id: 37, name: "Mysticism", category: "Spiritual" },
  { id: 38, name: "Transcendence", category: "Spiritual" },
  { id: 39, name: "Connection", category: "Spiritual" },
  { id: 40, name: "Enlightenment", category: "Spiritual" },
  // Technical (10)
  { id: 41, name: "Engineering", category: "Technical" },
  { id: 42, name: "Hacking", category: "Technical" },
  { id: 43, name: "Crafting", category: "Technical" },
  { id: 44, name: "Analysis", category: "Technical" },
  { id: 45, name: "Strategy", category: "Technical" },
  { id: 46, name: "Innovation", category: "Technical" },
  { id: 47, name: "Synthesis", category: "Technical" },
  { id: 48, name: "Automation", category: "Technical" },
  { id: 49, name: "Research", category: "Technical" },
  { id: 50, name: "Optimization", category: "Technical" },
];

export const ROLE_WEIGHTS: Record<string, RoleWeightMap> = {
  future: { Physical: "low", Mental: "high", Social: "medium", Spiritual: "low", Technical: "high" },
  modern: { Physical: "medium", Mental: "high", Social: "high", Spiritual: "low", Technical: "medium" },
  medieval: { Physical: "high", Mental: "medium", Social: "medium", Spiritual: "high", Technical: "low" },
};

export const WEIGHT_VALUES = { low: 0.5, medium: 1.0, high: 1.5 };
export const BASE_DIMENSION_VALUE = 10;
export const BONUS_MIN = 5;
export const BONUS_MAX = 15;

export const GROWTH_TIERS: GrowthTier[] = [
  { minScore: 0, maxScore: 100, multiplier: 1.0 },
  { minScore: 100, maxScore: 500, multiplier: 1.5 },
  { minScore: 500, maxScore: Infinity, multiplier: 2.0 },
];

export const SUMMON_COOLDOWN_DAYS = 7;
export const SUMMON_COST_SOL = 0.1;

export const TREASURY_WALLET = "CUknNpb82DiG6vra4FMkvDk68knVWV8gsJNiH7Vop2fn";

export const DAILY_TASKS = [
  { name: "Daily Login", description: "Log in to the game", abilityPoints: 5 },
  { name: "View Agents", description: "Visit your agents page", abilityPoints: 3 },
  { name: "Check Growth", description: "View an agent's growth log", abilityPoints: 5 },
  { name: "Read Narrative", description: "Read a growth narrative", abilityPoints: 2 },
];
