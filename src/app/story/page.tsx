"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { GemChip } from "@/components/GemChip";
import { StoryBoard } from "@/components/story/StoryBoard";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";

export default function StoryPage() {
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-mono font-bold">Story &amp; Events</h1>
        <GemChip />
      </div>
      <p className="font-mono text-[11px] text-gray-500">Fight through three eras and limited-time seasonal events. Each stage pays out on its first clear.</p>
      {wallet ? <StoryBoard walletAddress={wallet} onRewards={refreshAgents} /> : <p className="font-mono text-sm text-gray-400">Connect your wallet to play the campaign.</p>}
    </main>
  );
}
