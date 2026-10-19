"use client";
import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { SeasonPass } from "@/components/pass/SeasonPass";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { confirmTransaction, createPaymentTransaction } from "@/lib/sol-payment";

export default function PassPage() {
  const { player, loading } = useGame();
  const { publicKey, connected, sendTransaction, connection } = useUnifiedWallet();
  const router = useRouter();
  const wallet = publicKey?.toBase58() ?? null;

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

  if (loading || !player) return null;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 pb-32 max-w-2xl mx-auto">
      {wallet ? (
        <SeasonPass key={wallet} walletAddress={wallet} pay={pay} />
      ) : (
        <div className="text-center py-12 space-y-2">
          <p className="font-mono text-4xl">🎟️</p>
          <p className="font-mono text-sm text-gray-300">Connect your wallet to see your Season Pass.</p>
        </div>
      )}
    </main>
  );
}
