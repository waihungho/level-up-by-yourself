import { Connection } from "@solana/web3.js";
import { blinkRpcUrl } from "./cluster";

/** The parts of a jsonParsed transaction the memo check reads. */
export type ParsedMemoTx = {
  blockTime?: number | null;
  meta?: { err: unknown } | null;
  transaction: {
    message: {
      accountKeys: Array<{ pubkey: string | { toBase58(): string }; signer?: boolean; writable?: boolean }>;
      instructions: Array<{ program?: string; parsed?: unknown }>;
    };
  };
};

/**
 * ok: verified. invalid: found but not a valid challenge tx. not_found: the RPC hasn't seen it
 * (yet). rpc_error: the RPC failed, so nothing is known.
 */
export type MemoTxStatus = "ok" | "invalid" | "not_found" | "rpc_error";

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

const LOOKUP_ATTEMPTS = 4;
const LOOKUP_DELAY_MS = 1500;

async function fetchParsedTx(signature: string): Promise<ParsedMemoTx | null> {
  const connection = new Connection(blinkRpcUrl(), "confirmed");
  const tx = await connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  return tx as unknown as ParsedMemoTx | null;
}

/**
 * Verifies on-chain that `signature` is a confirmed memo transaction from `account`, less than
 * 15 minutes old. Retries only while the RPC returns null (the Blink client posts right after
 * confirmation and the node may lag); an RPC error fails fast.
 */
export async function verifyMemoTx(
  input: { signature: string; account: string; memo: string },
  opts: { getTx?: (signature: string) => Promise<ParsedMemoTx | null>; delayMs?: number; attempts?: number } = {}
): Promise<MemoTxStatus> {
  const getTx = opts.getTx ?? fetchParsedTx;
  const attempts = opts.attempts ?? LOOKUP_ATTEMPTS;
  for (let i = 0; i < attempts; i++) {
    let tx: ParsedMemoTx | null;
    try {
      tx = await getTx(input.signature);
    } catch (e) {
      console.error("[blink verify]", e);
      return "rpc_error";
    }
    if (tx) {
      const ok = checkMemoTx(tx, { account: input.account, memo: input.memo, nowSec: Math.floor(Date.now() / 1000), maxAgeSec: MAX_CHALLENGE_TX_AGE_SEC });
      return ok ? "ok" : "invalid";
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, opts.delayMs ?? LOOKUP_DELAY_MS));
  }
  return "not_found";
}

export async function latestBlockhash(): Promise<string> {
  return (await new Connection(blinkRpcUrl(), "confirmed").getLatestBlockhash()).blockhash;
}
