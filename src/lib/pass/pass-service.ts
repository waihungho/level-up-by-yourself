import { getPlayerByWallet } from "@/lib/db";
import { passMemo } from "@/lib/payment-memos";
import { applyGems, getGemBalance } from "@/lib/shop/gems";
import { addAttemptBonus, AlreadyOwnedError, grantTitle } from "@/lib/shop/shop-db";
import type { PaymentVerifier } from "@/lib/shop/shop-service";
import { fail, type ServiceResult } from "@/lib/tactical/service-common";
import { deleteClaim, getClaims, getLoginDates, getPremium, insertClaim, loginRef, recordPremium, type PassClaim } from "./pass-db";
import { isPassTrack, PASS_TRACKS, passTitleId, PREMIUM_PRICE_SOL, rewardFor, TIERS, tierForXp, XP_PER_TIER, type PassReward } from "./rewards";
import { loginXp, seasonBounds, seasonOf } from "./season";
import { awardPassXp, getPassXp } from "./xp";

const utcDate = (d: Date) => d.toISOString().slice(0, 10);
const dayBefore = (date: string) => utcDate(new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000));

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

export async function getPassView(input: { walletAddress?: string }, now: Date = new Date()): Promise<ServiceResult> {
  if (!input.walletAddress) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(input.walletAddress);
  if (!player) return fail(403, "not_owner");
  const season = seasonOf(now);
  const today = utcDate(now);
  const [xp, premium, claims, dates] = await Promise.all([
    getPassXp(player.id, season),
    getPremium(player.id, season),
    getClaims(player.id, season),
    getLoginDates(player.id),
  ]);
  const days = new Set(dates);
  return {
    status: 200,
    body: {
      season,
      endsAt: seasonBounds(season).end,
      xp,
      tier: tierForXp(xp),
      tiers: TIERS,
      xpPerTier: XP_PER_TIER,
      premium: premium !== null,
      premiumPriceSol: PREMIUM_PRICE_SOL,
      claimed: claims.map((c) => `${c.tier}:${c.track}`),
      streak: currentStreak(days, today),
      checkedInToday: days.has(today),
    },
  };
}

/** Awards today's login XP once per UTC day; the amount grows with the streak. */
export async function checkIn(input: { walletAddress?: string }, now: Date = new Date()): Promise<ServiceResult> {
  if (!input.walletAddress) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(input.walletAddress);
  if (!player) return fail(403, "not_owner");
  const today = utcDate(now);
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

/** Grants one reward. Gems first (idempotent by ref), the non-idempotent raid ticket last. */
async function grantReward(playerId: string, season: number, claim: PassClaim, reward: PassReward): Promise<void> {
  await applyGems({ playerId, delta: reward.gems, reason: `pass:${claim.track}`, ref: `pass:${season}:${claim.tier}:${claim.track}:${playerId}` });
  if (reward.title) {
    try {
      await grantTitle(playerId, passTitleId(season));
    } catch (e) {
      if (!(e instanceof AlreadyOwnedError)) throw e;
    }
  }
  if (reward.tickets > 0) await addAttemptBonus({ playerId, agentId: null, mode: "raid", extra: reward.tickets });
}

/** Claim row first, then the grant; a failed grant deletes the claim row so the player can retry. */
async function claimOne(playerId: string, season: number, claim: PassClaim): Promise<"ok" | "already_claimed" | "grant_failed"> {
  if (!(await insertClaim({ playerId, season, ...claim }))) return "already_claimed";
  try {
    await grantReward(playerId, season, claim, rewardFor(claim.tier, claim.track));
    return "ok";
  } catch (e) {
    console.error("[pass] grant failed, rolling back claim", { playerId, season, ...claim }, e);
    try {
      await deleteClaim({ playerId, season, ...claim });
    } catch (rollback) {
      console.error("[pass] CLAIM ROLLBACK FAILED — delete the claim row by hand", { playerId, season, ...claim }, rollback);
    }
    return "grant_failed";
  }
}

/** Claims one tier/track, or with `all` every reached, unclaimed tier on the tracks the player owns. */
export async function claimPass(
  input: { walletAddress?: string; tier?: number; track?: string; all?: boolean },
  now: Date = new Date()
): Promise<ServiceResult> {
  const { walletAddress, all } = input;
  if (!walletAddress || (!all && (input.tier === undefined || input.track === undefined))) return fail(400, "missing_fields");
  if (!all) {
    if (!Number.isInteger(input.tier) || input.tier! < 1 || input.tier! > TIERS) return fail(400, "invalid_tier");
    if (!isPassTrack(input.track)) return fail(400, "invalid_track");
  }
  const player = await getPlayerByWallet(walletAddress);
  if (!player) return fail(403, "not_owner");

  const season = seasonOf(now);
  const [xp, premium, claims] = await Promise.all([getPassXp(player.id, season), getPremium(player.id, season), getClaims(player.id, season)]);
  const reached = tierForXp(xp);

  let wanted: PassClaim[];
  if (all) {
    const done = new Set(claims.map((c) => `${c.tier}:${c.track}`));
    const tracks = PASS_TRACKS.filter((t) => t === "free" || premium !== null);
    wanted = tracks.flatMap((track) => Array.from({ length: reached }, (_, i) => ({ tier: i + 1, track }))).filter((c) => !done.has(`${c.tier}:${c.track}`));
  } else {
    const claim = { tier: input.tier!, track: input.track as PassClaim["track"] };
    if (claim.tier > reached) return fail(409, "tier_locked");
    if (claim.track === "premium" && premium === null) return fail(403, "premium_required");
    wanted = [claim];
  }

  const claimed: (PassClaim & { reward: PassReward })[] = [];
  for (const claim of wanted) {
    const outcome = await claimOne(player.id, season, claim);
    if (outcome === "already_claimed") {
      if (!all) return fail(409, "already_claimed");
      continue;
    }
    if (outcome === "grant_failed") {
      return { status: 500, body: { error: "grant_failed", claimed, balance: await getGemBalance(player.id) } };
    }
    claimed.push({ ...claim, reward: rewardFor(claim.tier, claim.track) });
  }
  return { status: 200, body: { claimed, balance: await getGemBalance(player.id) } };
}

/** Verifies the 0.15 SOL premium payment on-chain and unlocks premium for the current season, once per signature. */
export async function buyPremium(input: { walletAddress?: string; signature?: string }, deps: PaymentVerifier, now: Date = new Date()): Promise<ServiceResult> {
  const { walletAddress, signature } = input;
  if (!walletAddress || !signature) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(walletAddress);
  if (!player) return fail(403, "not_owner");
  const season = seasonOf(now);

  const owned = await getPremium(player.id, season);
  if (owned) return fail(409, owned === signature ? "signature_used" : "already_owned");
  if (!(await deps.verify({ signature, payer: walletAddress, minSol: PREMIUM_PRICE_SOL, memo: passMemo(season) }))) return fail(402, "payment_invalid");

  const outcome = await recordPremium({ playerId: player.id, season, signature });
  if (outcome !== "ok") return fail(409, outcome);
  return { status: 200, body: { premium: true, season } };
}
