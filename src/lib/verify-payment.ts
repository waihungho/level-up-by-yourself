import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TREASURY_WALLET } from "./constants";

export interface ParsedTransferTx {
  blockTime?: number | null;
  meta?: { err: unknown } | null;
  transaction: {
    message: {
      instructions: Array<{ program?: string; parsed?: string | { type?: string; info?: { source?: string; destination?: string; lamports?: number } } }>;
    };
  };
}

/**
 * Pure check: a successful, recent system transfer of at least minLamports from payer to treasury,
 * and — when `memo` is given — exactly one Level Up purpose memo, equal to `memo`. A tx carrying several
 * purpose memos is rejected, so one payment can never redeem two products (each product dedupes signatures
 * only in its own table).
 */
const PURPOSE_PREFIX = "levelup:";

export function checkTransfer(
  tx: ParsedTransferTx | null,
  opts: { payer: string; treasury: string; minLamports: number; nowSec: number; maxAgeSec: number; memo?: string }
): boolean {
  if (!tx || !tx.meta || tx.meta.err) return false;
  if (!tx.blockTime || opts.nowSec - tx.blockTime > opts.maxAgeSec) return false;
  const ixs = tx.transaction.message.instructions;
  const paid = ixs.some((ix) => {
    const p = typeof ix.parsed === "object" ? ix.parsed : undefined;
    return (
      ix.program === "system" &&
      p?.type === "transfer" &&
      p.info?.source === opts.payer &&
      p.info?.destination === opts.treasury &&
      (p.info?.lamports ?? 0) >= opts.minLamports
    );
  });
  if (!paid) return false;
  if (opts.memo === undefined) return true;
  const purposes = ixs.filter((ix) => ix.program === "spl-memo" && typeof ix.parsed === "string" && ix.parsed.startsWith(PURPOSE_PREFIX));
  return purposes.length === 1 && purposes[0].parsed === opts.memo;
}

const MAX_PAYMENT_AGE_SEC = 15 * 60;

/** Verifies on-chain that `signature` is a confirmed transfer of `minSol` from `payer` to the treasury. */
export async function verifySolPayment(input: { signature: string; payer: string; minSol: number; memo?: string }): Promise<boolean> {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!rpc) return false;
  const connection = new Connection(rpc, "confirmed");
  const tx = await connection.getParsedTransaction(input.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  return checkTransfer(tx as unknown as ParsedTransferTx | null, {
    payer: input.payer,
    treasury: TREASURY_WALLET,
    minLamports: Math.round(input.minSol * LAMPORTS_PER_SOL),
    nowSec: Math.floor(Date.now() / 1000),
    maxAgeSec: MAX_PAYMENT_AGE_SEC,
    memo: input.memo,
  });
}
