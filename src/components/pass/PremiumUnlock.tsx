"use client";
import { useState } from "react";
import { passMemo } from "@/lib/payment-memos";
import { PREMIUM_PRICE_SOL } from "@/lib/pass/rewards";

export type PassMessage = { ok: boolean; text: string; signature?: string };

interface PremiumUnlockProps {
  walletAddress: string;
  season: number;
  /** Sends `sol` to the treasury with the purpose memo and resolves to the confirmed signature. */
  pay: (sol: number, memo: string) => Promise<string>;
  onUnlocked: () => void;
  onMessage: (m: PassMessage | null) => void;
  retryDelayMs?: number;
}

const VERIFY_ATTEMPTS = 4;

export function PremiumUnlock({ walletAddress, season, pay, onUnlocked, onMessage, retryDelayMs = 3000 }: PremiumUnlockProps) {
  const [buying, setBuying] = useState(false);

  async function buy() {
    setBuying(true);
    onMessage(null);
    try {
      let signature: string;
      try {
        signature = await pay(PREMIUM_PRICE_SOL, passMemo(season));
      } catch {
        onMessage({ ok: false, text: "Payment cancelled or not confirmed yet. If SOL left your wallet, contact support with the transaction." });
        return;
      }
      // The server verifies the payment on-chain; retry while the RPC indexes the new transaction.
      for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
        try {
          const res = await fetch("/api/pass/premium", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ walletAddress, signature }),
          });
          if (res.ok || res.status === 409) {
            onMessage({ ok: true, text: "Premium unlocked! Claim your premium rewards below." });
            onUnlocked();
            return;
          }
        } catch {
          // network blip: retry
        }
      }
      onMessage({ ok: false, text: "Payment sent but not verified yet. Keep this transaction signature for support:", signature });
    } finally {
      setBuying(false);
    }
  }

  return (
    <section className="border border-amber-600/60 bg-gradient-to-br from-amber-950/70 to-gray-900 rounded-lg p-3 space-y-2">
      <h2 className="font-mono text-sm font-bold text-amber-200">👑 Premium track</h2>
      <p className="font-mono text-[11px] text-gray-300">
        12 gems every tier, 40 every 5th, and the Season {season} Elite title at tier 30. Unlocks rewards for tiers you already reached.
      </p>
      <button
        type="button"
        onClick={buy}
        disabled={buying}
        className="w-full min-h-[48px] rounded-lg bg-gradient-to-r from-amber-600 to-yellow-500 font-mono text-sm font-black text-gray-950 disabled:opacity-50"
      >
        {buying ? "Processing…" : `Unlock Premium for ${PREMIUM_PRICE_SOL} SOL`}
      </button>
    </section>
  );
}
