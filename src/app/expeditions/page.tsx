"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { ExpeditionsBoard } from "@/components/expeditions/ExpeditionsBoard";
import { useGems } from "@/hooks/useGems";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";

export default function ExpeditionsPage() {
  const { player, loading, refreshAgents } = useGame();
  const { publicKey } = useUnifiedWallet();
  const router = useRouter();
  const wallet = publicKey?.toBase58() ?? null;
  const { balance } = useGems(wallet);

  useEffect(() => {
    if (!loading && !player) router.push("/");
  }, [loading, player, router]);

  if (loading || !player) return null;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 pb-32 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-mono font-bold">Expeditions</h1>
        <span className="font-mono text-sm font-bold text-purple-200" aria-live="polite">
          💎 {balance ?? "…"}
        </span>
      </div>
      <p className="font-mono text-[11px] text-gray-500">Send up to 3 agents away. They come back stronger, with gems and sometimes a Raid Ticket.</p>

      {wallet ? (
        <ExpeditionsBoard walletAddress={wallet} onClaimed={refreshAgents} />
      ) : (
        <p className="font-mono text-sm text-gray-400">Connect your wallet to send agents on expeditions.</p>
      )}
    </main>
  );
}
