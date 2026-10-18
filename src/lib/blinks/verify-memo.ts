import { Connection } from "@solana/web3.js";

/** The parts of a jsonParsed transaction the memo check reads. */
export interface ParsedMemoTx {
  blockTime?: number | null;
  meta?: { err: unknown } | null;
  transaction: {
    message: {
      accountKeys: Array<{ pubkey: string | { toBase58(): string }; signer?: boolean; writable?: boolean }>;
      instructions: Array<{ program?: string; parsed?: unknown }>;
    };
  };
}

export const MAX_CHALLENGE_TX_AGE_SEC = 15 * 60;

const keyString = (k: string | { toBase58(): string }) => (typeof k === "string" ? k : k.toBase58());

/** Pure check: a successful, recent transaction signed by `account` that carries exactly `memo`. */
export function checkMemoTx(tx: ParsedMemoTx | null, opts: { account: string; memo: string; nowSec: number; maxAgeSec: number }): boolean {
  if (!tx || !tx.meta || tx.meta.err) return false;
  if (!tx.blockTime || opts.nowSec - tx.blockTime > opts.maxAgeSec) return false;
  const { accountKeys, instructions } = tx.transaction.message;
  if (!accountKeys.some((k) => k.signer && keyString(k.pubkey) === opts.account)) return false;
  return instructions.some((ix) => ix.program === "spl-memo" && ix.parsed === opts.memo);
}

/** RPC for Blink challenges: server RPC first, then the public one, then mainnet (documented fallback). */
export function blinkRpcUrl(): string {
  return process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
}

const LOOKUP_ATTEMPTS = 4;
const LOOKUP_DELAY_MS = 1500;

/**
 * Verifies on-chain that `signature` is a confirmed memo transaction from `account`, less than
 * 15 minutes old. Retries briefly: the Blink client posts right after confirmation and the RPC
 * node may not have the transaction yet.
 */
export async function verifyMemoTx(input: { signature: string; account: string; memo: string }): Promise<boolean> {
  const connection = new Connection(blinkRpcUrl(), "confirmed");
  for (let i = 0; i < LOOKUP_ATTEMPTS; i++) {
    const tx = await connection.getParsedTransaction(input.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (tx) {
      return checkMemoTx(tx as unknown as ParsedMemoTx, {
        account: input.account,
        memo: input.memo,
        nowSec: Math.floor(Date.now() / 1000),
        maxAgeSec: MAX_CHALLENGE_TX_AGE_SEC,
      });
    }
    if (i < LOOKUP_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, LOOKUP_DELAY_MS));
  }
  return false;
}

export async function latestBlockhash(): Promise<string> {
  return (await new Connection(blinkRpcUrl(), "confirmed").getLatestBlockhash()).blockhash;
}
