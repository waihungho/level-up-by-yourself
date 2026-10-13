/**
 * Optional wallet-signed authorization for /api/nft/prepare. Client-safe.
 *
 * `wallet` in a prepare request is only a claim (players and agents are publicly readable), so a
 * request that merely names a wallet gets the strict unsigned rate limit. A signature over this
 * short-lived message proves the caller controls the wallet and earns the normal budget. The
 * mobile bridge cannot sign messages, which is why unsigned requests are still accepted.
 */
import nacl from "tweetnacl";
import bs58 from "bs58";

export const MINT_AUTH_HEADER = "Level Up By Yourself — authorize NFT mint";
export const MINT_AUTH_MAX_SKEW_MS = 5 * 60 * 1000;

export type MintAuthFailure = "malformed_message" | "wrong_agent" | "expired" | "malformed_signature" | "bad_signature";

export const MINT_AUTH_MESSAGES: Record<MintAuthFailure, string> = {
  malformed_message: "That authorization message could not be read.",
  wrong_agent: "That authorization was for a different agent.",
  expired: "That authorization has expired. Try again.",
  malformed_signature: "That signature could not be read.",
  bad_signature: "That signature does not match your wallet.",
};

export function buildMintAuthMessage(agentId: string, issuedIso: string): string {
  return `${MINT_AUTH_HEADER}\nagent: ${agentId}\nissued: ${issuedIso}`;
}

export function verifyMintAuth(
  message: string,
  signatureBase58: string,
  wallet: string,
  agentId: string,
  now: number
): { ok: true } | { ok: false; reason: MintAuthFailure } {
  const [header, agentLine, issuedLine, ...rest] = message.split("\n");
  const agent = /^agent: (.+)$/.exec(agentLine ?? "")?.[1];
  const issuedMs = Date.parse(/^issued: (.+)$/.exec(issuedLine ?? "")?.[1] ?? "");
  if (header !== MINT_AUTH_HEADER || rest.length || !agent || Number.isNaN(issuedMs)) return { ok: false, reason: "malformed_message" };
  if (agent !== agentId) return { ok: false, reason: "wrong_agent" };
  if (Math.abs(now - issuedMs) > MINT_AUTH_MAX_SKEW_MS) return { ok: false, reason: "expired" };

  let signature: Uint8Array;
  let publicKey: Uint8Array;
  try {
    signature = bs58.decode(signatureBase58);
    publicKey = bs58.decode(wallet);
  } catch {
    return { ok: false, reason: "malformed_signature" };
  }
  // nacl throws (rather than returning false) on a wrong-sized signature or key.
  let verified = false;
  try {
    verified = nacl.sign.detached.verify(new TextEncoder().encode(message), signature, publicKey);
  } catch {
    verified = false;
  }
  return verified ? { ok: true } : { ok: false, reason: "bad_signature" };
}
