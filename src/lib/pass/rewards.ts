/* Season Pass tiers and reward table. Pure (no DB imports) so pages can use it. */

export const TIERS = 30;
export const XP_PER_TIER = 250;
export const PREMIUM_PRICE_SOL = 0.15;

export type PassTrack = "free" | "premium";
export const PASS_TRACKS: readonly PassTrack[] = ["free", "premium"];

export interface PassReward {
  gems: number;
  /** Raid tickets (+1 raid attempt on the day it's claimed). */
  tickets: number;
  /** Grants the season title (`passTitleId`). */
  title: boolean;
}

export function isPassTrack(v: unknown): v is PassTrack {
  return v === "free" || v === "premium";
}

/** Tier reached with `xp` season XP: tier N needs N × 250 XP. */
export function tierForXp(xp: number): number {
  return Math.min(TIERS, Math.max(0, Math.floor(xp / XP_PER_TIER)));
}

/** Free: 3 gems, every 5th tier 10 gems + 1 Raid Ticket. Premium: 12 gems, every 5th tier 40, tier 30 adds the title. */
export function rewardFor(tier: number, track: PassTrack): PassReward {
  const milestone = tier % 5 === 0;
  if (track === "free") return { gems: milestone ? 10 : 3, tickets: milestone ? 1 : 0, title: false };
  return { gems: milestone ? 40 : 12, tickets: 0, title: tier === TIERS };
}

export function passTitleId(season: number): string {
  return `pass_s${season}`;
}
