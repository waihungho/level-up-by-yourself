import { shopMem } from "@/lib/shop/shop-memory";
import { getWriteClient } from "@/lib/supabase-admin";
import { utcToday } from "@/lib/time";
import { claimKey, type PassClaim, type PassTrack } from "./rewards";
import { passXpMem, resetPassXpMemory } from "./xp";

/** Demo-mode stores for premium unlocks and claims; tests reset them with resetPassMemory(). */
export const passMem = {
  /** `${playerId}:${season}` → tx signature */
  premium: new Map<string, string>(),
  signatures: new Set<string>(),
  /** `${playerId}:${season}:${tier}:${track}` */
  claims: new Set<string>(),
};

export function resetPassMemory(): void {
  resetPassXpMemory();
  passMem.premium.clear();
  passMem.signatures.clear();
  passMem.claims.clear();
}

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "23505";

export function loginRef(playerId: string, date: string): string {
  return `login:${playerId}:${date}`;
}

/** Check-in dates (YYYY-MM-DD, newest first), read from login XP events across seasons. */
export async function getLoginDates(playerId: string, limit = 400): Promise<string[]> {
  const prefix = loginRef(playerId, "");
  const sb = getWriteClient();
  let refs: string[];
  if (sb) {
    const { data, error } = await sb
      .from("levelup_pass_events")
      .select("ref")
      .eq("player_id", playerId)
      .eq("source", "login")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    refs = (data ?? []).map((r) => r.ref as string);
  } else {
    refs = [...passXpMem.events.entries()].filter(([, e]) => e.playerId === playerId && e.source === "login").map(([ref]) => ref);
  }
  return refs
    .filter((r) => r.startsWith(prefix))
    .map((r) => r.slice(prefix.length))
    .sort()
    .reverse();
}

/** The signature that unlocked premium for this season, or null. */
export async function getPremium(playerId: string, season: number): Promise<string | null> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.from("levelup_pass_premium").select("tx_signature").eq("player_id", playerId).eq("season", season).maybeSingle();
    if (error) throw error;
    return data?.tx_signature ?? null;
  }
  return passMem.premium.get(`${playerId}:${season}`) ?? null;
}

/** Records a premium unlock. A reused signature or a second unlock for the same season changes nothing. */
export async function recordPremium(input: { playerId: string; season: number; signature: string }): Promise<"ok" | "signature_used" | "already_owned"> {
  const sb = getWriteClient();
  if (sb) {
    const { error } = await sb.from("levelup_pass_premium").insert({ player_id: input.playerId, season: input.season, tx_signature: input.signature });
    if (!error) return "ok";
    if (!isUniqueViolation(error)) throw error;
    const { data, error: readError } = await sb.from("levelup_pass_premium").select("player_id").eq("tx_signature", input.signature).maybeSingle();
    if (readError) throw readError;
    return data ? "signature_used" : "already_owned";
  }
  if (passMem.signatures.has(input.signature)) return "signature_used";
  const key = `${input.playerId}:${input.season}`;
  if (passMem.premium.has(key)) return "already_owned";
  passMem.signatures.add(input.signature);
  passMem.premium.set(key, input.signature);
  return "ok";
}

export async function getClaims(playerId: string, season: number): Promise<PassClaim[]> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.from("levelup_pass_claims").select("tier, track").eq("player_id", playerId).eq("season", season);
    if (error) throw error;
    return (data ?? []).map((r) => ({ tier: r.tier as number, track: r.track as PassTrack }));
  }
  const prefix = `${playerId}:${season}:`;
  return [...passMem.claims]
    .filter((k) => k.startsWith(prefix))
    .map((k) => {
      const [tier, track] = k.slice(prefix.length).split(":");
      return { tier: Number(tier), track: track as PassTrack };
    });
}

/** One reward to claim; amounts are computed by the caller from rewards.ts. */
export interface ClaimItem extends PassClaim {
  gems: number;
  tickets: number;
  /** Title id to set, or null. */
  title: string | null;
}

export function passGemRef(playerId: string, season: number, claim: PassClaim): string {
  return `pass:${season}:${claim.tier}:${claim.track}:${playerId}`;
}

/**
 * Claims and grants `items` atomically (levelup_pass_claim, one transaction): already-claimed items
 * are skipped, every new one gets its gems, raid ticket and title. Returns the newly claimed items.
 */
export async function claimRewards(playerId: string, season: number, items: ClaimItem[]): Promise<{ claimed: PassClaim[]; balance: number }> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_pass_claim", { p_player: playerId, p_season: season, p_items: items });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const claimed = ((row?.claimed ?? []) as { tier: number; track: PassTrack }[]).map((c) => ({ tier: Number(c.tier), track: c.track }));
    return { claimed, balance: Number(row?.balance ?? 0) };
  }

  // Demo mode: synchronous section, so it is atomic in JS.
  const claimed: PassClaim[] = [];
  let balance = shopMem.balances.get(playerId) ?? 0;
  for (const item of items) {
    const key = `${playerId}:${season}:${claimKey(item.tier, item.track)}`;
    if (passMem.claims.has(key)) continue;
    passMem.claims.add(key);
    const ref = passGemRef(playerId, season, item);
    if (item.gems > 0 && !shopMem.refs.has(ref)) {
      shopMem.refs.add(ref);
      balance += item.gems;
    }
    if (item.tickets > 0) shopMem.bonuses.push({ playerId, agentId: null, mode: "raid", extra: item.tickets, day: utcToday() });
    if (item.title) shopMem.titles.set(playerId, item.title);
    claimed.push({ tier: item.tier, track: item.track });
  }
  shopMem.balances.set(playerId, balance);
  return { claimed, balance };
}
