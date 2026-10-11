"use client";
import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { GemPacks } from "@/components/shop/GemPacks";
import { ShopItems } from "@/components/shop/ShopItems";
import { useGems } from "@/hooks/useGems";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { SHOP_ITEMS } from "@/lib/shop/catalog";
import { confirmTransaction, createPaymentTransaction } from "@/lib/sol-payment";

export default function ShopPage() {
  const { player, agents, loading, refreshAgents } = useGame();
  const { publicKey, connected, sendTransaction, connection } = useUnifiedWallet();
  const router = useRouter();
  const wallet = publicKey?.toBase58() ?? null;
  const { balance, setBalance } = useGems(wallet);

  useEffect(() => {
    if (!loading && !player) router.push("/");
  }, [loading, player, router]);

  const pay = useCallback(
    async (sol: number, memo: string) => {
      if (!publicKey || !connected) throw new Error("wallet not connected");
      const tx = await createPaymentTransaction(connection, publicKey, sol, memo);
      const signature = await sendTransaction(tx, connection);
      if (!(await confirmTransaction(connection, signature))) throw new Error("not confirmed");
      return signature;
    },
    [publicKey, connected, connection, sendTransaction]
  );

  const onBalance = useCallback(
    (b: number) => {
      setBalance(b);
      refreshAgents();
    },
    [setBalance, refreshAgents]
  );

  if (loading || !player) return null;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 pb-32 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-mono font-bold">Gem Shop</h1>
        <span className="font-mono text-sm font-bold text-purple-200" aria-live="polite">
          💎 {balance ?? "…"}
        </span>
      </div>
      <p className="font-mono text-[11px] text-gray-500">
        Gems are in-game points, bought with SOL. Gear upgrades are on each{" "}
        <Link href="/agents" className="underline">
          agent&apos;s page
        </Link>
        .
      </p>

      {wallet ? (
        <>
          <GemPacks walletAddress={wallet} pay={pay} onBalance={onBalance} />
          <ShopItems items={SHOP_ITEMS} balance={balance ?? 0} agents={agents} walletAddress={wallet} onBalance={onBalance} />
        </>
      ) : (
        <p className="font-mono text-sm text-gray-400">Connect your wallet to use the shop.</p>
      )}
    </main>
  );
}
