/* Season Pass tiers, reward table and API shapes. Pure (no DB imports) so pages can use it. */

export const TIERS = 30;
export const XP_PER_TIER = 250;
export const PREMIUM_PRICE_SOL = 0.15;

export type PassTrack = "free" | "premium";
export const PASS_TRACKS: readonly PassTrack[] = ["free", "premium"];

export interface PassReward {
  gems: number;
  /** Raid tickets (+1 raid attempt on the UTC day it's claimed). */
  tickets: number;
  /** Grants the season title (`passTitleId`). */
  title: boolean;
}

export interface PassClaim {
  tier: number;
  track: PassTrack;
}

/** GET /api/pass response. */
export interface PassViewBody {
  season: number;
  endsAt: string;
  xp: number;
  tier: number;
  tiers: number;
  xpPerTier: number;
  premium: boolean;
  /** claimKey()s of claimed rewards */
  claimed: string[];
  streak: number;
  checkedInToday: boolean;
  /** The player's current title id, if any. */
  title: string | null;
}

/** POST /api/pass/claim success response. */
export interface PassClaimBody {
  claimed: (PassClaim & { reward: PassReward })[];
  balance: number;
}

export function isPassTrack(v: unknown): v is PassTrack {
  return v === "free" || v === "premium";
}

export function isPassTier(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= TIERS;
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

export function claimKey(tier: number, track: PassTrack): string {
  return `${tier}:${track}`;
}

/** Reached, unclaimed rewards on the tracks the player owns (`done` holds claimKeys). */
export function unclaimed(reached: number, premium: boolean, done: ReadonlySet<string>): PassClaim[] {
  const tracks = PASS_TRACKS.filter((t) => t === "free" || premium);
  return tracks.flatMap((track) => Array.from({ length: reached }, (_, i) => ({ tier: i + 1, track }))).filter((c) => !done.has(claimKey(c.tier, c.track)));
}

/** True when claiming the season title would replace a different title the player holds. */
export function replacesTitle(currentTitle: string | null, season: number): boolean {
  return currentTitle !== null && currentTitle !== passTitleId(season);
}

/**
 * Whether "Claim all" takes this reward. Raid tickets only count on the claim day, and the season
 * title may replace another title, so both are claimed one by one instead.
 */
export function inClaimAll(claim: PassClaim, titleWouldReplace: boolean): boolean {
  const reward = rewardFor(claim.tier, claim.track);
  return reward.tickets === 0 && !(reward.title && titleWouldReplace);
}
