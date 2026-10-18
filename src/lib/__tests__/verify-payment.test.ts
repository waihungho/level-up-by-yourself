import { describe, it, expect } from "vitest";
import { checkTransfer } from "../verify-payment";

const payer = "Payer111111111111111111111111111111111111111";
const treasury = "Treasury1111111111111111111111111111111111111";
const now = 1_800_000_000;

function tx(over: { err?: unknown; blockTime?: number; source?: string; destination?: string; lamports?: number; memo?: string | null; memos?: string[] } = {}) {
  return {
    blockTime: over.blockTime ?? now - 30,
    meta: { err: over.err ?? null },
    transaction: {
      message: {
        instructions: [
          { program: "system", parsed: { type: "transfer", info: { source: over.source ?? payer, destination: over.destination ?? treasury, lamports: over.lamports ?? 50_000_000 } } },
          ...(over.memo ? [{ program: "spl-memo", parsed: over.memo }] : []),
          ...(over.memos ?? []).map((m) => ({ program: "spl-memo", parsed: m })),
        ],
      },
    },
  };
}

const opts = { payer, treasury, minLamports: 50_000_000, nowSec: now, maxAgeSec: 900 };

describe("checkTransfer", () => {
  it("accepts a recent successful transfer of enough SOL from the payer to the treasury", () => {
    expect(checkTransfer(tx(), opts)).toBe(true);
  });
  it("rejects a missing or failed transaction", () => {
    expect(checkTransfer(null, opts)).toBe(false);
    expect(checkTransfer(tx({ err: { InstructionError: [0, "x"] } }), opts)).toBe(false);
  });
  it("rejects the wrong payer, destination or amount", () => {
    expect(checkTransfer(tx({ source: treasury }), opts)).toBe(false);
    expect(checkTransfer(tx({ destination: payer }), opts)).toBe(false);
    expect(checkTransfer(tx({ lamports: 49_999_999 }), opts)).toBe(false);
  });
  it("rejects transactions older than the window", () => {
    expect(checkTransfer(tx({ blockTime: now - 901 }), opts)).toBe(false);
  });

  it("requires the exact purpose memo when one is asked for", () => {
    const withMemo = { ...opts, memo: "levelup:gems:starter" };
    expect(checkTransfer(tx({ memo: "levelup:gems:starter" }), withMemo)).toBe(true);
    expect(checkTransfer(tx({ memo: null }), withMemo)).toBe(false);
    expect(checkTransfer(tx({ memo: "levelup:recharge:a1" }), withMemo)).toBe(false);
    expect(checkTransfer(tx({ memo: "levelup:gems:whale" }), withMemo)).toBe(false);
  });

  it("rejects a payment that carries several purpose memos (one payment, one product)", () => {
    const withMemo = { ...opts, memo: "levelup:gems:starter" };
    expect(checkTransfer(tx({ memo: "levelup:gems:starter", memos: ["levelup:pass:1"] }), withMemo)).toBe(false);
    expect(checkTransfer(tx({ memo: "levelup:gems:starter", memos: ["gm frens"] }), withMemo)).toBe(true);
  });
});
