/* Raid reward table. Pure (no DB imports) so the raid page can show it. */

export type RewardTier = "champion" | "elite" | "vanguard" | "participant";

/** growthTotal is spread evenly across the boss's weakness-category dimensions for each reward agent. */
export const REWARDS: Record<RewardTier, { ability: number; growthTotal: number }> = {
  champion: { ability: 300, growthTotal: 3.0 },
  elite: { ability: 150, growthTotal: 2.0 },
  vanguard: { ability: 75, growthTotal: 1.0 },
  participant: { ability: 30, growthTotal: 0.5 },
};
export const LAST_HIT_ABILITY = 100;
export const EXPIRED_REWARD_FACTOR = 0.5;

/** Display order with the ranks each tier covers. */
export const REWARD_TIERS: { tier: RewardTier; label: string; ranks: string }[] = [
  { tier: "champion", label: "Champion", ranks: "#1" },
  { tier: "elite", label: "Elite", ranks: "#2–3" },
  { tier: "vanguard", label: "Vanguard", ranks: "#4–10" },
  { tier: "participant", label: "Participant", ranks: "#11+" },
];

export function tierForRank(rank: number): RewardTier {
  if (rank === 1) return "champion";
  if (rank <= 3) return "elite";
  if (rank <= 10) return "vanguard";
  return "participant";
}
