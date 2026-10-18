// @vitest-environment node
import { describe, it, expect } from "vitest";
import { checkMemoTx, type ParsedMemoTx } from "../verify-memo";
import { guestFighter } from "../guest";
import { blinkMemo, ACTION_HEADERS } from "../actions";
import { DIMENSIONS } from "@/lib/constants";

const NOW = 1_800_000_000;
const ACCOUNT = "Chall3nger1111111111111111111111111111111111";
const MEMO = blinkMemo("agent-1");

function tx(over: { err?: unknown; blockTime?: number | null; signer?: boolean; payer?: string; memo?: string | null } = {}): ParsedMemoTx {
  return {
    blockTime: over.blockTime === undefined ? NOW - 30 : over.blockTime,
    meta: { err: over.err ?? null },
    transaction: {
      message: {
        accountKeys: [{ pubkey: over.payer ?? ACCOUNT, signer: over.signer ?? true, writable: true }],
        instructions: over.memo === null ? [] : [{ program: "spl-memo", parsed: over.memo ?? MEMO }],
      },
    },
  };
}

const opts = { account: ACCOUNT, memo: MEMO, nowSec: NOW, maxAgeSec: 15 * 60 };

describe("checkMemoTx", () => {
  it("accepts a confirmed, recent tx signed by the account with the exact memo", () => {
    expect(checkMemoTx(tx(), opts)).toBe(true);
  });

  it("rejects missing, failed, stale or undated transactions", () => {
    expect(checkMemoTx(null, opts)).toBe(false);
    expect(checkMemoTx(tx({ err: { InstructionError: [0, "x"] } }), opts)).toBe(false);
    expect(checkMemoTx(tx({ blockTime: NOW - 15 * 60 - 1 }), opts)).toBe(false);
    expect(checkMemoTx(tx({ blockTime: null }), opts)).toBe(false);
  });

  it("rejects a tx not signed by the account", () => {
    expect(checkMemoTx(tx({ signer: false }), opts)).toBe(false);
    expect(checkMemoTx(tx({ payer: "Someone1111111111111111111111111111111111111" }), opts)).toBe(false);
  });

  it("rejects a wrong or missing memo", () => {
    expect(checkMemoTx(tx({ memo: blinkMemo("agent-2") }), opts)).toBe(false);
    expect(checkMemoTx(tx({ memo: null }), opts)).toBe(false);
  });
});

describe("guestFighter", () => {
  it("has 150 in every dimension, the name Guest and a role picked deterministically from the wallet", () => {
    const g = guestFighter(ACCOUNT);
    expect(g.name).toBe("Guest");
    expect(g.dimensions).toHaveLength(DIMENSIONS.length);
    expect(g.dimensions.every((d) => d.value === 150)).toBe(true);
    expect(guestFighter(ACCOUNT).role).toBe(g.role);
    const roles = new Set(Array.from({ length: 30 }, (_, i) => guestFighter(`wallet-${i}`).role));
    expect(roles).toEqual(new Set(["future", "modern", "medieval"]));
  });
});

describe("actions helpers", () => {
  it("builds the memo and the Actions CORS + spec headers", () => {
    expect(blinkMemo("abc")).toBe("levelup:blink:abc");
    expect(ACTION_HEADERS["Access-Control-Allow-Origin"]).toBe("*");
    expect(ACTION_HEADERS["X-Blockchain-Ids"]).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
    expect(ACTION_HEADERS["X-Action-Version"]).toBeTruthy();
  });
});
