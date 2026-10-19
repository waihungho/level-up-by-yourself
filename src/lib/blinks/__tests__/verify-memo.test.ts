// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { checkMemoTx, verifyMemoTx, type ParsedMemoTx } from "../verify-memo";
import { guestFighter } from "../guest";
import { blinkMemo } from "@/lib/payment-memos";
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

describe("verifyMemoTx", () => {
  const input = { signature: "s", account: ACCOUNT, memo: MEMO };
  const fresh = () => tx({ blockTime: Math.floor(Date.now() / 1000) - 10 });

  it("retries while the RPC returns null, then verifies", async () => {
    const getTx = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(fresh());
    expect(await verifyMemoTx(input, { getTx, delayMs: 0 })).toBe("ok");
    expect(getTx).toHaveBeenCalledTimes(3);
  });

  it("reports not_found after the retries run out", async () => {
    const getTx = vi.fn(async () => null);
    expect(await verifyMemoTx(input, { getTx, delayMs: 0, attempts: 3 })).toBe("not_found");
    expect(getTx).toHaveBeenCalledTimes(3);
  });

  it("fails fast on an RPC error without retrying", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const getTx = vi.fn(async () => {
      throw new Error("429 Too Many Requests");
    });
    expect(await verifyMemoTx(input, { getTx, delayMs: 0 })).toBe("rpc_error");
    expect(getTx).toHaveBeenCalledTimes(1);
  });

  it("reports invalid for a found transaction that fails the check", async () => {
    expect(await verifyMemoTx(input, { getTx: async () => tx({ memo: "other" }), delayMs: 0 })).toBe("invalid");
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

describe("blinkMemo", () => {
  it("tags the challenged agent", () => {
    expect(blinkMemo("abc")).toBe("levelup:blink:abc");
  });
});
