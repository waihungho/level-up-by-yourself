import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { TREASURY_WALLET } from "./constants";

export async function createPaymentTransaction(
  connection: Connection,
  payerPublicKey: PublicKey,
  solAmount: number
): Promise<Transaction> {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payerPublicKey,
      toPubkey: new PublicKey(TREASURY_WALLET),
      lamports: Math.round(solAmount * LAMPORTS_PER_SOL),
    })
  );
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
