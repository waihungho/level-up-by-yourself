"use client";
import { useGame } from "@/components/GameProvider";
import { PlayerStats } from "@/components/PlayerStats";
import { DailyTasks } from "@/components/DailyTasks";
import { PixelSprite } from "@/components/PixelSprite";
import { AgentRoom } from "@/components/AgentRoom";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Dashboard() {
  const { player, agents, loading } = useGame();
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
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-mono font-bold text-white">Level Up by Yourself</h1>
        </div>
        <p className="text-xs text-gray-500 font-mono shrink-0">{walletShort}</p>
        <Link
          href="/seeker-task"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-yellow-400 bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20 hover:border-yellow-400/50 hover:shadow-[0_0_12px_rgba(255,215,0,0.25)] transition-all shrink-0"
        >
          <Image src="/seeker-icon.png" alt="Seeker" width={18} height={18} className="rounded-sm" />
          <span className="font-mono text-[11px] font-bold tracking-wider">SEEKER TASK</span>
        </Link>
      </div>
      <PlayerStats />

      {/* My Agents */}
      {agents.length > 0 && (
        <div className="mt-6 bg-gray-900 border border-gray-800 rounded p-4">
          <h2 className="text-lg font-mono font-bold text-white mb-3">My Agents</h2>
          <AgentRoom agents={agents} />
          <div className="flex gap-3 overflow-x-auto pb-2 mt-4 pt-4 border-t border-gray-800">
            {agents.map((agent) => (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="flex flex-col items-center shrink-0 group"
              >
                <div className="rounded-lg border border-gray-700 group-hover:border-purple-500 transition-colors p-1 bg-gray-800">
                  <PixelSprite spriteSeed={agent.spriteSeed as Record<string, number>} role={agent.role} size={56} />
                </div>
                <span className="text-xs font-mono text-gray-400 mt-1 max-w-[64px] truncate group-hover:text-purple-400 transition-colors">
                  {agent.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

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
