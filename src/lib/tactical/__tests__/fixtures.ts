import { DIMENSIONS } from "@/lib/constants";
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
