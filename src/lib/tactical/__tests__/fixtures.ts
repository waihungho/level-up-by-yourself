import { DIMENSIONS, ROLE_WEIGHTS } from "@/lib/constants";
import type { AgentWithDimensions, RoleCategory } from "@/lib/types";
import type { Category } from "../types";

export function makeAgent(
  id: string,
  role: RoleCategory,
  value = 150,
  perCategory: Partial<Record<Category, number>> = {},
  playerId = "player-" + id
): AgentWithDimensions {
  return {
    id,
    playerId,
    name: id,
    role,
    roleTitle: role,
    character: "",
    objective: "",
    spriteSeed: {},
    createdAt: new Date().toISOString(),
    dimensions: DIMENSIONS.map((d) => ({
      agentId: id,
      dimensionId: d.id,
      value: perCategory[d.category] ?? value,
    })),
  };
}

/** Constant RNG: no feints (0.5 > 0.25), ties on initiative, variance factor exactly 1. */
export const half = () => 0.5;

const WEIGHT_MULT = { low: 0.75, medium: 1, high: 1.25 } as const;

/**
 * Agent whose category averages follow ROLE_WEIGHTS (like real summoned + grown agents),
 * normalised so every role has the same total stats (isolates engine fairness).
 */
export function makeRoleAgent(id: string, role: RoleCategory, base = 150, playerId = "player-" + id): AgentWithDimensions {
  const weights = ROLE_WEIGHTS[role];
  const cats = Object.keys(weights) as Category[];
  const raw = cats.map((c) => WEIGHT_MULT[weights[c]]);
  const norm = cats.length / raw.reduce((a, b) => a + b, 0);
  const perCategory = Object.fromEntries(cats.map((c, i) => [c, base * raw[i] * norm])) as Record<Category, number>;
  return makeAgent(id, role, base, perCategory, playerId);
}
