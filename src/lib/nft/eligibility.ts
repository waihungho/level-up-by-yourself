/**
 * Mint eligibility and client phases. Client-safe: no keypair, database or chain.
 * The server (the partial unique index in 010_nft_mints.sql) is the real guard; this
 * only decides what the button looks like.
 */

/** A minted (or in-flight) agent NFT, as read from levelup_nft_mints. */
export interface NftMint {
  agentId: string;
  assetAddress: string;
  status: "pending" | "confirmed";
  createdAt: string;
  txSignature: string | null;
}

/**
 * How long a `pending` reservation blocks the agent. Must match `interval '3 minutes'` in
 * levelup_reserve_nft_mint. It has to outlast a blockhash's validity window (~60-150s), so an
 * abandoned transaction can no longer land once its reservation is reclaimed.
 */
export const MINT_RESERVATION_TTL_MS = 3 * 60 * 1000;

export type MintPhase = "idle" | "preparing" | "signing" | "confirming" | "done" | "unconfirmed" | "error";

export function isMintBusy(phase: MintPhase): boolean {
  return phase === "preparing" || phase === "signing" || phase === "confirming";
}

export type MintEligibility = { ok: true } | { ok: false; reason: "already_minted" | "mint_pending"; message: string };

export function canMint(mint: NftMint | null, now: number = Date.now()): MintEligibility {
  if (mint?.status === "confirmed") {
    return { ok: false, reason: "already_minted", message: "This agent has already been minted." };
  }
  // Strict `<=`, mirroring the SQL's `created_at < now() - interval '3 minutes'`.
  if (mint?.status === "pending" && now - new Date(mint.createdAt).getTime() <= MINT_RESERVATION_TTL_MS) {
    return { ok: false, reason: "mint_pending", message: "A mint for this agent is still confirming. Try again in a few minutes." };
  }
  return { ok: true };
}
