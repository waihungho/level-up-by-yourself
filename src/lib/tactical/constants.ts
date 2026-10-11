import type { RoleCategory } from "@/lib/types";
import type { Category } from "./types";

/** Each category beats the next one: Physical → Technical → Mental → Spiritual → Social → Physical. */
export const CYCLE: Category[] = ["Physical", "Technical", "Mental", "Spiritual", "Social"];

export const MAX_ROUNDS = 12;
export const MAX_FOCUS = 5;
export const SPECIAL_COST = 3;
export const COUNTER_MULT = 1.5;
export const COUNTER_INTERRUPT = 0.5;
export const GUARD_REDUCTION = 0.6;
export const DMG_K = 8;
export const DEF_K = 2;
export const HP_K = 1;
export const ROLE_BONUS = 1.1;
export const INSIGHT_BONUS = 1.25;
export const INSIGHT_ROUNDS = 2;
export const ULTIMATE_MULT = 3;
export const FEINT_MIN = 0.05;
export const FEINT_MAX = 0.25;
export const FEINT_SOCIAL_K = 120;
export const AI_SPECIAL_CHANCE = 0.6;
export const MASTERY_PER_COUNTER = 0.1;
export const MASTERY_MAX = 1.5;

export const ROLE_CATEGORY: Record<RoleCategory, Category> = {
  medieval: "Physical",
  future: "Technical",
  modern: "Mental",
};

export const SPECIALS: Record<RoleCategory, { name: string; category: Category; mult: number }> = {
  medieval: { name: "Shield Bash", category: "Physical", mult: 2.0 },
  future: { name: "Overclock", category: "Technical", mult: 1.8 },
  modern: { name: "Insight", category: "Mental", mult: 1.3 },
};
