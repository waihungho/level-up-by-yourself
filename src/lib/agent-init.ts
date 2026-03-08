import { DIMENSIONS, ROLE_WEIGHTS, WEIGHT_VALUES, BASE_DIMENSION_VALUE, BONUS_MIN, BONUS_MAX } from "./constants";
import type { RoleCategory } from "./types";

export function generateInitialDimensions(role: RoleCategory): { dimensionId: number; value: number }[] {
  const weights = ROLE_WEIGHTS[role];
  return DIMENSIONS.map((dim) => {
    const weight = WEIGHT_VALUES[weights[dim.category]];
    const bonus = Math.floor(Math.random() * (BONUS_MAX - BONUS_MIN + 1) + BONUS_MIN) * weight;
    return {
      dimensionId: dim.id,
      value: Math.round((BASE_DIMENSION_VALUE + bonus) * 10) / 10,
    };
  });
}

export function generateSpriteSeed(
  role: RoleCategory,
  name: string,
  character: string
): Record<string, number> {
  const str = `${role}:${name}:${character}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  const seed = Math.abs(hash);
  return {
    bodyType: seed % 5,
    headType: (seed >> 4) % 6,
    eyeType: (seed >> 8) % 4,
    weaponType: (seed >> 12) % 8,
    auraType: (seed >> 16) % 5,
    colorSeed: seed % 360,
  };
}
