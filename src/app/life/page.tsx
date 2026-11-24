"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { LifeBoard } from "@/components/life/LifeBoard";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { LIFE_DAILY_CAP } from "@/lib/life/catalog";

export default function LifePage() {
  const { player, loading, refreshAgents } = useGame();
  const { publicKey } = useUnifiedWallet();
  const router = useRouter();
  const wallet = publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (!loading && !player) router.push("/");
  }, [loading, player, router]);

  if (loading || !player) return null;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 pb-32 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-mono font-bold">Real Life</h1>
      <p className="font-mono text-[11px] text-gray-500">
        Level up yourself and your agent levels up too. Habits, quests, focus, meditation and steps grow the agent you pick, up to {LIFE_DAILY_CAP} pts a day.
      </p>
      {wallet ? <LifeBoard walletAddress={wallet} onGrowth={refreshAgents} /> : <p className="font-mono text-sm text-gray-400">Connect your wallet to track real life.</p>}
    </main>
  );
}
