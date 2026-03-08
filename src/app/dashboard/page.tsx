"use client";
import { useGame } from "@/components/GameProvider";
import { PlayerStats } from "@/components/PlayerStats";
import { DailyTasks } from "@/components/DailyTasks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Dashboard() {
  const { player, loading } = useGame();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !player) {
      router.push("/");
    }
  }, [loading, player, router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <span className="font-mono text-gray-400">Loading...</span>
      </main>
    );
  }

  if (!player) return null;

  const walletShort = player.walletAddress.slice(0, 4) + "..." + player.walletAddress.slice(-4);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 pb-24 max-w-2xl mx-auto">
      {/* Player Profile */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center text-2xl font-mono font-bold text-white shrink-0">
          {player.walletAddress.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-mono font-bold">Dashboard</h1>
          <p className="text-sm text-gray-500 font-mono">{walletShort}</p>
        </div>
      </div>
      <PlayerStats />
      <div className="mt-6">
        <DailyTasks />
      </div>
      <div className="mt-6 flex gap-4">
        <Link
          href="/agents"
          className="flex-1 text-center px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white font-mono rounded transition-colors"
        >
          View Agents
        </Link>
        <Link
          href="/summon"
          className="flex-1 text-center px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-mono rounded transition-colors"
        >
          Summon Agent
        </Link>
      </div>
    </main>
  );
}
