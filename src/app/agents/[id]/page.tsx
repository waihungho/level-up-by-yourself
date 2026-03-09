"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { getAgentWithDimensions, getGrowthLogs, getBattleLogs } from "@/lib/db";
import { DimensionChart } from "@/components/DimensionChart";
import { GrowthTimeline } from "@/components/GrowthTimeline";
import { BattleHistory } from "@/components/BattleHistory";
import type { AgentWithDimensions, BattleLog, GrowthLog } from "@/lib/types";
import Link from "next/link";
import { PixelSprite } from "@/components/PixelSprite";

const ROLE_COLORS = {
  future: "border-purple-700 bg-purple-900/30",
  modern: "border-blue-700 bg-blue-900/30",
  medieval: "border-amber-700 bg-amber-900/30",
};

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { player, loading } = useGame();
  const router = useRouter();
  const [agent, setAgent] = useState<AgentWithDimensions | null>(null);
  const [logs, setLogs] = useState<GrowthLog[]>([]);
  const [battleLogs, setBattleLogs] = useState<BattleLog[]>([]);
  const [loadingAgent, setLoadingAgent] = useState(true);

  useEffect(() => {
    if (!loading && !player) router.push("/");
  }, [loading, player, router]);

  useEffect(() => {
    async function load() {
      if (!id) return;
      setLoadingAgent(true);
      const [a, l, bl] = await Promise.all([
        getAgentWithDimensions(id),
        getGrowthLogs(id, 20),
        getBattleLogs(id),
      ]);
      setAgent(a);
      setLogs(l);
      setBattleLogs(bl);
      setLoadingAgent(false);
    }
    if (player) load();
  }, [id, player]);

  if (loading || loadingAgent) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <span className="font-mono text-gray-400">Loading...</span>
      </main>
    );
  }

  if (!agent) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center">
        <p className="font-mono text-gray-400 mb-4">Agent not found.</p>
        <Link href="/agents" className="text-purple-400 font-mono">&larr; Back to agents</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 pb-32 max-w-2xl mx-auto">
      <Link href="/agents" className="text-sm text-gray-500 font-mono hover:text-gray-400 mb-4 block">
        &larr; Back to agents
      </Link>

      {/* Header */}
      <div className={`border rounded p-4 mb-6 ${ROLE_COLORS[agent.role]}`}>
        <div className="flex gap-4 items-center">
          <PixelSprite spriteSeed={agent.spriteSeed as Record<string, number>} role={agent.role} size={80} />
          <div>
            <h1 className="text-2xl font-mono font-bold">{agent.name}</h1>
            <p className="text-gray-400 font-mono">{agent.roleTitle} &middot; {agent.role}</p>
          </div>
        </div>
      </div>

      {/* Character & Objective */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded p-4">
          <h3 className="font-mono text-sm text-gray-500 mb-2">Character</h3>
          <p className="text-sm text-gray-300 italic">&ldquo;{agent.character}&rdquo;</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded p-4">
          <h3 className="font-mono text-sm text-gray-500 mb-2">Objective</h3>
          <p className="text-sm text-gray-300 italic">&ldquo;{agent.objective}&rdquo;</p>
        </div>
      </div>

      {/* Dimensions */}
      <div className="bg-gray-900 border border-gray-800 rounded p-4 mb-6">
        <h2 className="text-lg font-mono font-bold mb-4">Dimensions</h2>
        <DimensionChart dimensions={agent.dimensions} />
      </div>

      {/* Growth Timeline */}
      <div>
        <h2 className="text-lg font-mono font-bold mb-4">Growth Log</h2>
        <GrowthTimeline logs={logs} />
      </div>

      {/* Battle History */}
      <div>
        <h2 className="text-lg font-mono font-bold mb-4">Battle History</h2>
        <BattleHistory logs={battleLogs} agentId={id} />
      </div>
    </main>
  );
}
