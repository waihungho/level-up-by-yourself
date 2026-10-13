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
  /** When /prepare handed out the transaction; null if it never got that far. */
  txBuiltAt: string | null;
  txSignature: string | null;
}

/**
 * How long the button treats a `pending` reservation as live, counted from when its transaction
 * was built. A courtesy only: the server reclaims a reservation solely once the chain proves its
 * transaction can't land (asset absent, blockhash expired), and answers 409 until then. Kept
 * longer than a blockhash's validity window (~60-150s) so the two rarely disagree. Also how long
 * mint-service waits before reclaiming a reservation whose transaction was never built.
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
  if (mint?.status === "pending" && now - Date.parse(mint.txBuiltAt ?? mint.createdAt) <= MINT_RESERVATION_TTL_MS) {
    return { ok: false, reason: "mint_pending", message: "A mint for this agent is still confirming. Try again in a few minutes." };
  }
  return { ok: true };
}
