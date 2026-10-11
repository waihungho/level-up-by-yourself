import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TREASURY_WALLET } from "./constants";

interface ParsedTransferTx {
  blockTime?: number | null;
  meta?: { err: unknown } | null;
  transaction: {
    message: {
      instructions: Array<{ program?: string; parsed?: { type?: string; info?: { source?: string; destination?: string; lamports?: number } } }>;
    };
  };
}

/** Pure check: a successful, recent system transfer of at least minLamports from payer to treasury. */
export function checkTransfer(
  tx: ParsedTransferTx | null,
  opts: { payer: string; treasury: string; minLamports: number; nowSec: number; maxAgeSec: number }
): boolean {
  if (!tx || !tx.meta || tx.meta.err) return false;
  if (!tx.blockTime || opts.nowSec - tx.blockTime > opts.maxAgeSec) return false;
  return tx.transaction.message.instructions.some(
    (ix) =>
      ix.program === "system" &&
      ix.parsed?.type === "transfer" &&
      ix.parsed.info?.source === opts.payer &&
      ix.parsed.info?.destination === opts.treasury &&
      (ix.parsed.info?.lamports ?? 0) >= opts.minLamports
  );
}

const MAX_PAYMENT_AGE_SEC = 15 * 60;

/** Verifies on-chain that `signature` is a confirmed transfer of `minSol` from `payer` to the treasury. */
export async function verifySolPayment(input: { signature: string; payer: string; minSol: number }): Promise<boolean> {
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
  });
}
