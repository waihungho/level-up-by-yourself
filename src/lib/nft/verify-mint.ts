/**
 * On-chain verification of an atomic pay-and-mint transaction (pure).
 *
 * Payment rules reuse checkTransfer (payer → treasury, enough lamports, exact purpose memo).
 * On top of that, the asset address this server generated must go from 0 to >0 lamports in
 * this very transaction — mere presence in the account list would accept a transaction that
 * only referenced an existing asset.
 *
 * Not sufficient alone: a dust transfer to the asset address also passes the balance check.
 * Callers MUST also confirm the asset account is owned by the mpl-core program.
 */
import { checkTransfer, type ParsedTransferTx } from "@/lib/verify-payment";

export interface ParsedMintTx extends ParsedTransferTx {
  meta?: { err: unknown; preBalances?: number[]; postBalances?: number[] } | null;
  transaction: ParsedTransferTx["transaction"] & {
    message: ParsedTransferTx["transaction"]["message"] & { accountKeys?: Array<{ pubkey: { toString(): string } | string }> };
  };
}

export type MintVerifyResult = { ok: true } | { ok: false; reason: "not_found" | "payment_invalid" | "asset_missing" };

export const MINT_VERIFY_MESSAGES: Record<Exclude<MintVerifyResult, { ok: true }>["reason"], string> = {
  not_found: "Transaction not visible on chain yet.",
  payment_invalid: "That transaction did not pay for this mint.",
  asset_missing: "That transaction did not create your NFT.",
};

export function verifyMint(
  tx: ParsedMintTx | null,
  opts: { payer: string; treasury: string; minLamports: number; memo: string; assetAddress: string }
): MintVerifyResult {
  if (!tx || !tx.meta) return { ok: false, reason: "not_found" };
  // No age limit: reconciliation may confirm a mint long after it landed.
  const paid = checkTransfer(tx, {
    payer: opts.payer,
    treasury: opts.treasury,
    minLamports: opts.minLamports,
    memo: opts.memo,
    nowSec: tx.blockTime ?? 0,
    maxAgeSec: Number.POSITIVE_INFINITY,
  });
  if (!paid) return { ok: false, reason: "payment_invalid" };

  const keys = (tx.transaction.message.accountKeys ?? []).map((k) => (typeof k.pubkey === "string" ? k.pubkey : k.pubkey.toString()));
  const i = keys.indexOf(opts.assetAddress);
  const pre = tx.meta.preBalances?.[i];
  const post = tx.meta.postBalances?.[i];
  if (i === -1 || pre !== 0 || !post) return { ok: false, reason: "asset_missing" };
  return { ok: true };
}
