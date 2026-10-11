"use client";
import { useCallback, useEffect, useState } from "react";
import { announceGemBalance, GEM_BALANCE_EVENT } from "@/lib/shop-client";

/** The player's gem balance (null until loaded or without a wallet). */
export function useGems(walletAddress: string | null) {
  const [balance, setBalance] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch(`/api/shop?wallet=${encodeURIComponent(walletAddress)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { balance: number };
      setBalance(data.balance);
    } catch {
      // keep the last known balance
    }
  }, [walletAddress]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    refresh();
  }, [refresh]);

  // Purchases anywhere on the page announce the new balance; keep every display in sync.
  useEffect(() => {
    const onBalance = (e: Event) => setBalance((e as CustomEvent<number>).detail);
    window.addEventListener(GEM_BALANCE_EVENT, onBalance);
    return () => window.removeEventListener(GEM_BALANCE_EVENT, onBalance);
  }, []);

  /** Sets the balance after a purchase and updates every other gem display. */
  const updateBalance = useCallback((b: number) => announceGemBalance(b), []);

  return { balance, setBalance: updateBalance, refresh };
}
