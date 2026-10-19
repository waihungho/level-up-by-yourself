/* Expedition durations and rewards. Pure (no DB imports) so pages can use it. */
import { DIMENSIONS } from "@/lib/constants";
import { ROLE_CATEGORY } from "@/lib/tactical/constants";
import type { Rng } from "@/lib/tactical/rng";
import type { RoleCategory } from "@/lib/types";

export const EXPEDITION_DURATIONS = [4, 8, 12] as const;
export type ExpeditionDuration = (typeof EXPEDITION_DURATIONS)[number];

/** Expeditions a player can have out (running or waiting to be claimed) at once. */
export const MAX_ACTIVE = 3;

/** Total stat growth (split over 2 dimensions), gems, and Raid Ticket chance per duration. */
export const EXPEDITION_REWARDS: Record<ExpeditionDuration, { growth: number; gems: number; ticketChance: number }> = {
  4: { growth: 0.6, gems: 1, ticketChance: 0 },
  8: { growth: 1.2, gems: 3, ticketChance: 0 },
  12: { growth: 2.0, gems: 5, ticketChance: 0.15 },
};

export interface ExpeditionReward {
  /** dimension id → stat points */
  growth: Record<number, number>;
  gems: number;
  ticket: boolean;
}

export function isExpeditionDuration(x: unknown): x is ExpeditionDuration {
  return EXPEDITION_DURATIONS.includes(x as ExpeditionDuration);
}

/** Rolls the reward at start: growth split over 2 random dimensions of the role's category, plus the 12h ticket roll. */
export function rollReward(duration: ExpeditionDuration, role: RoleCategory, rng: Rng): ExpeditionReward {
  const { growth, gems, ticketChance } = EXPEDITION_REWARDS[duration];
  const pool = DIMENSIONS.filter((d) => d.category === ROLE_CATEGORY[role]).map((d) => d.id);
  const first = pool.splice(Math.floor(rng() * pool.length), 1)[0];
  const second = pool[Math.floor(rng() * pool.length)];
  const each = Math.round((growth / 2) * 100) / 100;
  return {
    growth: { [first]: each, [second]: each },
    gems,
    ticket: ticketChance > 0 && rng() < ticketChance,
  };
}

