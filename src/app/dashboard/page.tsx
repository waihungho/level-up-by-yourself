"use client";
import { useGame } from "@/components/GameProvider";
import { PlayerStats } from "@/components/PlayerStats";
import { DailyTasks } from "@/components/DailyTasks";
import { PixelSprite } from "@/components/PixelSprite";
import { AgentRoom } from "@/components/AgentRoom";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { createPaymentTransaction, confirmTransaction } from "@/lib/sol-payment";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Dashboard() {
  const { player, agents, loading } = useGame();
  const { publicKey, connected, sendTransaction, connection } = useUnifiedWallet();
  const router = useRouter();
  const [donating, setDonating] = useState(false);
  const [donateStatus, setDonateStatus] = useState<"idle" | "success" | "error">("idle");

  async function handleDonate() {
    if (!publicKey || !connected || donating) return;
    setDonating(true);
    setDonateStatus("idle");
    try {
      const tx = await createPaymentTransaction(connection, publicKey, 0.5);
      const signature = await sendTransaction(tx, connection);
      const confirmed = await confirmTransaction(connection, signature);
      setDonateStatus(confirmed ? "success" : "error");
    } catch {
      setDonateStatus("error");
    }
    setDonating(false);
    setTimeout(() => setDonateStatus("idle"), 3000);
  }

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
    <main className="min-h-screen bg-gray-950 text-white p-6 pb-32 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-mono font-bold text-white">Level Up by Yourself</h1>
        </div>
        <Link
          href="/seeker-task"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-yellow-400 bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20 hover:border-yellow-400/50 hover:shadow-[0_0_12px_rgba(255,215,0,0.25)] transition-all shrink-0"
        >
          <Image src="/seeker-icon.png" alt="Seeker" width={18} height={18} className="rounded-sm" />
          <span className="font-mono text-[11px] font-bold tracking-wider">SEEKER TASK</span>
        </Link>
      </div>

      {/* My Agents */}
      <div className="bg-gray-900 border border-gray-800 rounded p-4">
        <h2 className="text-lg font-mono font-bold text-white mb-3">My Agents</h2>
        <AgentRoom agents={agents} />
        {agents.length > 0 && (
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
        )}
      </div>

      <div className="mt-4">
        <DailyTasks />
      </div>

      <div className="mt-4">
        <PlayerStats />
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

      {/* Donate */}
      {connected && (
        <div className="mt-6 bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
          <p className="font-mono text-xs text-gray-500 mb-3">
            Support development
          </p>
          <button
            onClick={handleDonate}
            disabled={donating}
            className="px-6 py-2.5 bg-gradient-to-r from-yellow-600 to-amber-500 hover:from-yellow-500 hover:to-amber-400 text-white font-mono font-bold text-sm rounded-lg transition-all disabled:opacity-50"
          >
            {donating ? "Processing..." : "Donate 0.5 SOL"}
          </button>
          {donateStatus === "success" && (
            <p className="mt-2 font-mono text-xs text-green-400">Thank you for your support!</p>
          )}
          {donateStatus === "error" && (
            <p className="mt-2 font-mono text-xs text-red-400">Transaction failed. Please try again.</p>
          )}
        </div>
      )}
    </main>
  );
}
