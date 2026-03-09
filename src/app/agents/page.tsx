"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/components/GameProvider";
import { AgentCard } from "@/components/AgentCard";
import { getAgentWithDimensions } from "@/lib/db";
import type { Agent, AgentDimension } from "@/lib/types";
import { DIMENSIONS } from "@/lib/constants";
import Link from "next/link";
import { useRouter } from "next/navigation";

function getTotalAbility(dims: AgentDimension[] | undefined): number {
  if (!dims) return 0;
  return DIMENSIONS.reduce((sum, dim) => {
    const ad = dims.find((d) => d.dimensionId === dim.id);
    return sum + (ad ? ad.value : 10);
  }, 0);
}

export default function AgentsPage() {
  const { player, agents, loading } = useGame();
  const router = useRouter();
  const [agentDimensions, setAgentDimensions] = useState<Record<string, AgentDimension[]>>({});

  useEffect(() => {
    if (!loading && !player) router.push("/");
  }, [loading, player, router]);

  useEffect(() => {
    async function loadDimensions() {
      const dims: Record<string, AgentDimension[]> = {};
      for (const agent of agents) {
        const full = await getAgentWithDimensions(agent.id);
        if (full) dims[agent.id] = full.dimensions;
      }
      setAgentDimensions(dims);
    }
    if (agents.length > 0) loadDimensions();
  }, [agents]);

  if (loading || !player) return null;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-mono font-bold">Your Agents</h1>
        <Link href="/summon" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-mono text-sm rounded transition-colors">
          + Summon
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 font-mono mb-4">No agents yet.</p>
          <Link href="/summon" className="text-purple-400 hover:text-purple-300 font-mono">
            Summon your first agent →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {[...agents]
            .sort((a, b) => getTotalAbility(agentDimensions[b.id]) - getTotalAbility(agentDimensions[a.id]))
            .map((agent) => (
            <AgentCard key={agent.id} agent={agent} dimensions={agentDimensions[agent.id]} />
          ))}
        </div>
      )}
    </main>
  );
}
