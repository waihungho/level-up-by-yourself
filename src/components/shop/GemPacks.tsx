"use client";
import { useState } from "react";
import { GEM_PACKS, type PackId } from "@/lib/shop/catalog";
import { gemPackMemo } from "@/lib/payment-memos";

interface GemPacksProps {
  walletAddress: string;
  /** Sends `sol` to the treasury with the purpose memo and resolves to the confirmed signature. */
  pay: (sol: number, memo: string) => Promise<string>;
  onBalance: (balance: number) => void;
  retryDelayMs?: number;
}

const VERIFY_ATTEMPTS = 4;

export function GemPacks({ walletAddress, pay, onBalance, retryDelayMs = 3000 }: GemPacksProps) {
  const [buying, setBuying] = useState<PackId | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function buy(packId: PackId) {
    setBuying(packId);
    setMessage(null);
    let signature: string;
    try {
      signature = await pay(GEM_PACKS[packId].sol, gemPackMemo(packId));
    } catch {
      setMessage({ ok: false, text: "Payment cancelled or failed." });
      setBuying(null);
      return;
    }
    // The server verifies the payment on-chain; retry while the RPC indexes the new transaction.
    for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
      try {
        const res = await fetch("/api/shop/gems", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress, packId, signature }),
        });
        const data = await res.json();
        if (res.ok || res.status === 409) {
          if (typeof data.balance === "number") onBalance(data.balance);
          setMessage({ ok: true, text: `+${GEM_PACKS[packId].gems} gems added!` });
          setBuying(null);
          return;
        }
      } catch {
        // network blip: retry
      }
    }
    setMessage({ ok: false, text: `Payment sent but not verified yet. Keep this signature for support: ${signature.slice(0, 16)}…` });
    setBuying(null);
  }

  return (
    <section>
      <h2 className="font-mono text-sm font-bold text-gray-200 mb-2">💎 Buy gems</h2>
      <div className="grid grid-cols-2 gap-2">
        {(Object.entries(GEM_PACKS) as [PackId, (typeof GEM_PACKS)[PackId]][]).map(([id, p]) => (
          <button
            key={id}
            type="button"
            disabled={buying !== null}
            onClick={() => buy(id)}
            className="border border-purple-700/60 bg-gradient-to-br from-purple-950 to-gray-900 rounded-lg p-3 text-left min-h-[72px] disabled:opacity-50"
          >
            <span className="block font-mono text-xs text-gray-300">{p.label}</span>
            <span className="block font-mono text-lg font-black text-white">💎 {p.gems}</span>
            <span className="block font-mono text-[11px] text-purple-300">{buying === id ? "Processing…" : `${p.sol} SOL`}</span>
          </button>
        ))}
      </div>
      {message && (
        <p role="status" className={`mt-2 font-mono text-xs ${message.ok ? "text-emerald-300" : "text-red-300"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
