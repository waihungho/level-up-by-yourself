import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from "@solana/web3.js";
import { TREASURY_WALLET } from "./constants";

/** SPL Memo program: tags a payment with its purpose so the server can tell payments apart. */
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/**
 * Transfer of `solAmount` to the treasury. Server-verified purchases pass a `memo`
 * (e.g. "levelup:gems:starter") so one payment can't be redeemed for something else.
 */
export async function createPaymentTransaction(
  connection: Connection,
  payerPublicKey: PublicKey,
  solAmount: number,
  memo?: string
): Promise<Transaction> {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payerPublicKey,
      toPubkey: new PublicKey(TREASURY_WALLET),
      lamports: Math.round(solAmount * LAMPORTS_PER_SOL),
    })
  );
  if (memo) {
    transaction.add(new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(memo, "utf8") }));
  }
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payerPublicKey;
  return transaction;
}

export async function confirmTransaction(
  connection: Connection,
  signature: string,
  onProgress?: (check: number, total: number) => void,
  maxChecks = 10
): Promise<boolean> {
  for (let i = 0; i < maxChecks; i++) {
    if (onProgress) onProgress(i + 1, maxChecks);
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const status = await connection.getSignatureStatus(signature);
      if (status.value?.err) return false;
      if (
        status.value?.confirmationStatus === "confirmed" ||
        status.value?.confirmationStatus === "finalized"
      ) {
        return true;
      }
    } catch (e) {
      if (i === maxChecks - 1) return false;
    }
  }
  return false;
}
