import { gearTier, type Gear, type GearTier } from "@/lib/shop/catalog";

export const TIER_COLOR: Record<GearTier, string> = {
  bronze: "#cd7f32",
  silver: "#d1d5db",
  gold: "#facc15",
  mythic: "#e879f9",
};

/** Sprite weapon tint for an agent's weapon tier (undefined = default sprite colours). */
export function weaponTint(gear: Gear | undefined): string | undefined {
  const tier = gearTier(gear?.weapon ?? 0);
  return tier ? TIER_COLOR[tier] : undefined;
}
