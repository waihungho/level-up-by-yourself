// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { createPaymentTransaction, MEMO_PROGRAM_ID } from "../sol-payment";

const connection = { getLatestBlockhash: async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 1 }) };

describe("createPaymentTransaction", () => {
  it("adds a memo instruction with the purpose when given", async () => {
    const payer = Keypair.generate().publicKey;
    const tx = await createPaymentTransaction(connection as never, payer, 0.05, "levelup:gems:starter");
    expect(tx.instructions).toHaveLength(2);
    expect(tx.instructions[0].programId.equals(SystemProgram.programId)).toBe(true);
    expect(tx.instructions[1].programId.equals(MEMO_PROGRAM_ID)).toBe(true);
    expect(Buffer.from(tx.instructions[1].data).toString("utf8")).toBe("levelup:gems:starter");
  });

  it("is a plain transfer without a memo", async () => {
    const tx = await createPaymentTransaction(connection as never, Keypair.generate().publicKey, 0.1);
    expect(tx.instructions).toHaveLength(1);
  });
});
