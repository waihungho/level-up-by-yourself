/*
 * Class Evolution and Signature Moves. Pure (no DB imports) so pages and the engine can use it.
 *
 * - Evolution: once an agent's role category averages EVOLVE_AT, its owner picks one of two
 *   permanent paths. Each path boosts two categories by EVOLUTION_BONUS in battle.
 * - Signature Move: an agent with any dimension at SIGNATURE_AT or more turns its special into a
 *   named signature move that hits SIGNATURE_MULT harder.
 */
import { DIMENSIONS } from "@/lib/constants";
import { ROLE_CATEGORY } from "@/lib/tactical/constants";
import type { AgentWithDimensions, DimensionCategory, RoleCategory } from "@/lib/types";

export const EVOLVE_AT = 80;
export const EVOLUTION_BONUS = 0.03;
export const SIGNATURE_AT = 200;
export const SIGNATURE_MULT = 1.1;

export interface EvolutionPath {
  id: string;
  name: string;
  blurb: string;
  categories: [DimensionCategory, DimensionCategory];
}

export const EVOLUTIONS: Record<RoleCategory, [EvolutionPath, EvolutionPath]> = {
  medieval: [
    { id: "paladin", name: "Paladin", blurb: "Holy steel. Hits hard and stands firm in faith.", categories: ["Physical", "Spiritual"] },
    { id: "berserker", name: "Berserker", blurb: "Raw fury that cows every foe.", categories: ["Physical", "Social"] },
  ],
  future: [
    { id: "archon", name: "Archon", blurb: "A machine mind that out-thinks the battlefield.", categories: ["Technical", "Mental"] },
    { id: "cyber_ninja", name: "Cyber Ninja", blurb: "Chrome reflexes and silent code.", categories: ["Technical", "Physical"] },
  ],
  modern: [
    { id: "mastermind", name: "Mastermind", blurb: "Every move planned three steps ahead.", categories: ["Mental", "Technical"] },
    { id: "diplomat", name: "Diplomat", blurb: "Wins the room before the fight starts.", categories: ["Mental", "Social"] },
  ],
};

export const EVOLUTION_IDS: string[] = Object.values(EVOLUTIONS).flatMap((p) => p.map((x) => x.id));

export function evolutionPath(role: RoleCategory, id: string | null | undefined): EvolutionPath | null {
  return EVOLUTIONS[role]?.find((p) => p.id === id) ?? null;
}

type Dims = Pick<AgentWithDimensions, "dimensions">;

export function categoryAverage(agent: Dims, category: DimensionCategory): number {
  const ids = DIMENSIONS.filter((d) => d.category === category).map((d) => d.id);
  const sum = ids.reduce((s, id) => s + (agent.dimensions.find((d) => d.dimensionId === id)?.value ?? 0), 0);
  return sum / ids.length;
}

/** Progress toward evolving: the role category's average against EVOLVE_AT. */
export function evolutionProgress(agent: Dims & { role: RoleCategory }): { average: number; ready: boolean } {
  const average = categoryAverage(agent, ROLE_CATEGORY[agent.role]);
  return { average: Math.round(average * 10) / 10, ready: average >= EVOLVE_AT };
}

/** Battle multipliers per category from the agent's evolution (1 where it doesn't apply). */
export function evolutionMultipliers(role: RoleCategory, evolution: string | null | undefined): Partial<Record<DimensionCategory, number>> {
  const path = evolutionPath(role, evolution);
  if (!path) return {};
  return Object.fromEntries(path.categories.map((c) => [c, 1 + EVOLUTION_BONUS]));
}

const SIGNATURE_SUFFIX: Record<DimensionCategory, string> = {
  Physical: "Breaker",
  Mental: "Gambit",
  Social: "Command",
  Spiritual: "Ascension",
  Technical: "Protocol",
};

export interface SignatureMove {
  dimensionId: number;
  name: string;
  category: DimensionCategory;
}

/** The agent's signature move: from its highest dimension at SIGNATURE_AT or more (lowest id on ties). */
export function signatureMove(agent: Dims): SignatureMove | null {
  let best: { id: number; value: number } | null = null;
  for (const d of agent.dimensions) {
    if (d.value < SIGNATURE_AT) continue;
    if (!best || d.value > best.value || (d.value === best.value && d.dimensionId < best.id)) best = { id: d.dimensionId, value: d.value };
  }
  if (!best) return null;
  const dim = DIMENSIONS.find((d) => d.id === best.id);
  if (!dim) return null;
  return { dimensionId: dim.id, name: `${dim.name} ${SIGNATURE_SUFFIX[dim.category]}`, category: dim.category };
}
