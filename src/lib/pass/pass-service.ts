import { getPlayerByWallet } from "@/lib/db";
import { passMemo } from "@/lib/payment-memos";
import { getGemBalance } from "@/lib/shop/gems";
import { getTitles } from "@/lib/shop/shop-db";
import type { PaymentVerifier } from "@/lib/shop/shop-service";
import { fail, type ServiceResult } from "@/lib/tactical/service-common";
import { utcToday } from "@/lib/time";
import { claimRewards, getClaims, getLoginDates, getPremium, loginRef, recordPremium } from "./pass-db";
import {
  claimKey,
  inClaimAll,
  isPassTier,
  isPassTrack,
  passTitleId,
  PREMIUM_PRICE_SOL,
  replacesTitle,
  rewardFor,
  TIERS,
  tierForXp,
  unclaimed,
  XP_PER_TIER,
  type PassClaim,
  type PassClaimBody,
  type PassViewBody,
} from "./rewards";
import { loginXp, seasonBounds, seasonOf } from "./season";
import { awardPassXp, getPassXp } from "./xp";

const dayBefore = (date: string) => utcToday(new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000));

/** Wallet from an untrusted body/query: a non-empty string, else null. */
const walletOf = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Consecutive check-in days ending on `end` (0 if `end` has none). */
function streakEnding(dates: Set<string>, end: string): number {
  let n = 0;
  for (let d = end; dates.has(d); d = dayBefore(d)) n++;
  return n;
}

/** Current streak: counts today if checked in, otherwise the run ending yesterday (still alive until today ends). */
function currentStreak(dates: Set<string>, today: string): number {
  return dates.has(today) ? streakEnding(dates, today) : streakEnding(dates, dayBefore(today));
}

export async function getPassView(input: { walletAddress?: unknown }, now: Date = new Date()): Promise<ServiceResult> {
  const wallet = walletOf(input.walletAddress);
  if (!wallet) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(wallet);
  if (!player) return fail(403, "not_owner");
  const season = seasonOf(now);
  const today = utcToday(now);
  const [xp, premium, claims, dates, titles] = await Promise.all([
    getPassXp(player.id, season),
    getPremium(player.id, season),
    getClaims(player.id, season),
    getLoginDates(player.id),
    getTitles([player.id]),
  ]);
  const days = new Set(dates);
  const body: PassViewBody = {
    season,
    endsAt: seasonBounds(season).end,
    xp,
    tier: tierForXp(xp),
    tiers: TIERS,
    xpPerTier: XP_PER_TIER,
    premium: premium !== null,
    claimed: claims.map((c) => claimKey(c.tier, c.track)),
    streak: currentStreak(days, today),
    checkedInToday: days.has(today),
    title: titles[player.id] ?? null,
  };
  return { status: 200, body: { ...body } };
}

/** Awards today's login XP once per UTC day; the amount grows with the streak. */
export async function checkIn(input: { walletAddress?: unknown }, now: Date = new Date()): Promise<ServiceResult> {
  const wallet = walletOf(input.walletAddress);
  if (!wallet) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(wallet);
  if (!player) return fail(403, "not_owner");
  const today = utcToday(now);
  const days = new Set(await getLoginDates(player.id));
  if (days.has(today)) {
    const xp = await getPassXp(player.id, seasonOf(now));
    return { status: 200, body: { awarded: 0, xp, tier: tierForXp(xp), streak: streakEnding(days, today) } };
  }
  const streak = streakEnding(days, dayBefore(today)) + 1;
  const amount = loginXp(streak);
  const { xp, applied } = await awardPassXp({ playerId: player.id, source: "login", ref: loginRef(player.id, today), xp: amount, now });
  return { status: 200, body: { awarded: applied ? amount : 0, xp, tier: tierForXp(xp), streak } };
}

/**
 * Claims one tier/track, or with `all` every reached, unclaimed reward on the tracks the player owns,
 * except raid-ticket tiers and a season title that would replace another title (see inClaimAll).
 * Claim rows and grants are written in one transaction (claimRewards).
 */
export async function claimPass(
  input: { walletAddress?: unknown; tier?: unknown; track?: unknown; all?: unknown },
  now: Date = new Date()
): Promise<ServiceResult> {
  const wallet = walletOf(input.walletAddress);
  const all = input.all === true;
  const { tier, track } = input;
  if (!wallet || (!all && (tier === undefined || track === undefined))) return fail(400, "missing_fields");
  if (!all && !isPassTier(tier)) return fail(400, "invalid_tier");
  if (!all && !isPassTrack(track)) return fail(400, "invalid_track");
  const player = await getPlayerByWallet(wallet);
  if (!player) return fail(403, "not_owner");

  const season = seasonOf(now);
  const [xp, premium, claims] = await Promise.all([getPassXp(player.id, season), getPremium(player.id, season), getClaims(player.id, season)]);
  const reached = tierForXp(xp);

  let wanted: PassClaim[];
  if (all) {
    const titleWouldReplace = replacesTitle((await getTitles([player.id]))[player.id] ?? null, season);
    const done = new Set(claims.map((c) => claimKey(c.tier, c.track)));
    wanted = unclaimed(reached, premium !== null, done).filter((c) => inClaimAll(c, titleWouldReplace));
  } else if (isPassTier(tier) && isPassTrack(track)) {
    const claim: PassClaim = { tier, track };
    if (claim.tier > reached) return fail(409, "tier_locked");
    if (claim.track === "premium" && premium === null) return fail(403, "premium_required");
    wanted = [claim];
  } else {
    return fail(400, "invalid_tier");
  }

  if (wanted.length === 0) return { status: 200, body: { claimed: [], balance: await getGemBalance(player.id) } };
  const items = wanted.map((c) => {
    const reward = rewardFor(c.tier, c.track);
    return { ...c, gems: reward.gems, tickets: reward.tickets, title: reward.title ? passTitleId(season) : null };
  });
  const result = await claimRewards(player.id, season, items);
  if (!all && result.claimed.length === 0) return fail(409, "already_claimed");
  const body: PassClaimBody = { claimed: result.claimed.map((c) => ({ ...c, reward: rewardFor(c.tier, c.track) })), balance: result.balance };
  return { status: 200, body: { ...body } };
}

/** Verifies the 0.15 SOL premium payment on-chain and unlocks premium for the current season, once per signature. */
export async function buyPremium(input: { walletAddress?: unknown; signature?: unknown }, deps: PaymentVerifier, now: Date = new Date()): Promise<ServiceResult> {
  const wallet = walletOf(input.walletAddress);
  const signature = typeof input.signature === "string" && input.signature ? input.signature : null;
  if (!wallet || !signature) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(wallet);
  if (!player) return fail(403, "not_owner");
  const season = seasonOf(now);

  const owned = await getPremium(player.id, season);
  if (owned) return fail(409, owned === signature ? "signature_used" : "already_owned");
  // A payment sent just before a season rollover carries the previous season's memo; the 15-minute
  // payment age limit bounds that window. It unlocks the current season.
  const memos = season > 1 ? [passMemo(season), passMemo(season - 1)] : [passMemo(season)];
  let paid = false;
  for (const memo of memos) {
    if (await deps.verify({ signature, payer: wallet, minSol: PREMIUM_PRICE_SOL, memo })) {
      paid = true;
      break;
    }
  }
  if (!paid) return fail(402, "payment_invalid");

  const outcome = await recordPremium({ playerId: player.id, season, signature });
  if (outcome !== "ok") return fail(409, outcome);
  return { status: 200, body: { premium: true, season } };
}
