"use client";
import Link from "next/link";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { useGems } from "@/hooks/useGems";

/** 💎 balance chip linking to the shop. */
export function GemChip() {
  const { publicKey } = useUnifiedWallet();
  const { balance } = useGems(publicKey?.toBase58() ?? null);
  if (balance === null) return null;
  return (
    <Link href="/shop" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-purple-600/60 bg-purple-950/60 font-mono text-xs font-bold text-purple-100 hover:border-purple-400" aria-label={`${balance} gems, open the shop`}>
      💎 {balance}
    </Link>
  );
}
