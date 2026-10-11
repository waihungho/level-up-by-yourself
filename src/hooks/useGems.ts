"use client";
import { useCallback, useEffect, useState } from "react";

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

  return { balance, setBalance, refresh };
}
