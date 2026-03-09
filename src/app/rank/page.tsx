"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { PixelSprite } from "@/components/PixelSprite";
import { getAllAgentsWithDimensions, getAllPlayers } from "@/lib/db";
import { DIMENSIONS } from "@/lib/constants";
import type { AgentWithDimensions, Player } from "@/lib/types";
import Link from "next/link";

const ROLE_BADGE: Record<string, string> = {
  future: "bg-purple-700 text-purple-200",
  modern: "bg-blue-700 text-blue-200",
  medieval: "bg-amber-700 text-amber-200",
};

function getTotalAbility(agent: AgentWithDimensions): number {
  return DIMENSIONS.reduce((sum, dim) => {
    const ad = agent.dimensions.find((d) => d.dimensionId === dim.id);
    return sum + (ad ? ad.value : 10);
  }, 0);
}

function getCategoryAvg(
  agent: AgentWithDimensions,
  category: string
): number {
  const dimIds = DIMENSIONS.filter((d) => d.category === category).map(
    (d) => d.id
  );
  if (dimIds.length === 0) return 0;
  const total = dimIds.reduce((sum, id) => {
    const ad = agent.dimensions.find((d) => d.dimensionId === id);
    return sum + (ad ? ad.value : 10);
  }, 0);
  return total / dimIds.length;
}

const CATEGORIES = ["Physical", "Mental", "Social", "Spiritual", "Technical"];

const CATEGORY_COLORS: Record<string, string> = {
  Physical: "text-red-400",
  Mental: "text-blue-400",
  Social: "text-green-400",
  Spiritual: "text-purple-400",
  Technical: "text-cyan-400",
};

export default function RankPage() {
  const { player, loading } = useGame();
  const router = useRouter();

  const [agents, setAgents] = useState<AgentWithDimensions[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !player) router.push("/");
  }, [loading, player, router]);

  useEffect(() => {
    async function load() {
      setLoadingData(true);
      const [allAgents, allPlayers] = await Promise.all([
        getAllAgentsWithDimensions(),
        getAllPlayers(),
      ]);
      // Sort by total ability descending
      allAgents.sort((a, b) => getTotalAbility(b) - getTotalAbility(a));
      setAgents(allAgents);
      setPlayers(allPlayers);
      setLoadingData(false);
    }
    if (player) load();
  }, [player]);

  if (loading || !player) return null;

  const playerMap = new Map(players.map((p) => [p.id, p]));

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 pb-24 max-w-2xl mx-auto">
      <h1 className="text-2xl font-mono font-bold mb-1 text-center">
        Rankings
      </h1>
      {loadingData ? (
        <p className="text-center font-mono text-sm text-gray-500 mb-6">Loading...</p>
      ) : (
        <div className="flex justify-center gap-6 mb-6">
          <div className="text-center">
            <div className="font-mono font-bold text-lg text-white">{players.length}</div>
            <div className="font-mono text-[10px] text-gray-500">Total Players</div>
          </div>
          <div className="text-center">
            <div className="font-mono font-bold text-lg text-white">{agents.length}</div>
            <div className="font-mono text-[10px] text-gray-500">Total Agents</div>
          </div>
        </div>
      )}

      {loadingData ? (
        <div className="text-center py-12">
          <span className="font-mono text-gray-400">Loading rankings...</span>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="font-mono text-xs text-gray-600 mb-2">Top {Math.min(100, agents.length)} Agents by Ability</p>
          {agents.slice(0, 100).map((agent, index) => {
            const rank = index + 1;
            const totalAbility = getTotalAbility(agent);
            const ownerPlayer = playerMap.get(agent.playerId);
            const isOwn = agent.playerId === player.id;
            const topCategory = CATEGORIES.reduce((best, cat) => {
              const avg = getCategoryAvg(agent, cat);
              return avg > getCategoryAvg(agent, best) ? cat : best;
            }, CATEGORIES[0]);

            return (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className={`block border rounded-lg p-3 transition-all hover:border-gray-500 ${
                  isOwn
                    ? "border-purple-700/50 bg-purple-900/10"
                    : "border-gray-800 bg-gray-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Rank */}
                  <div className="shrink-0 w-8 text-center">
                    {rank <= 3 ? (
                      <span
                        className={`font-mono font-black text-lg ${
                          rank === 1
                            ? "text-yellow-400"
                            : rank === 2
                            ? "text-gray-300"
                            : "text-amber-600"
                        }`}
                      >
                        {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
                      </span>
                    ) : (
                      <span className="font-mono text-sm text-gray-500 font-bold">
                        #{rank}
                      </span>
                    )}
                  </div>

                  {/* Sprite */}
                  <div className="shrink-0">
                    <PixelSprite
                      spriteSeed={agent.spriteSeed as Record<string, number>}
                      role={agent.role}
                      size={48}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-white truncate">
                        {agent.name}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${ROLE_BADGE[agent.role]}`}
                      >
                        {agent.role}
                      </span>
                      {isOwn && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-purple-800 text-purple-300">
                          YOU
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-[10px] text-gray-500">
                        {ownerPlayer
                          ? `${ownerPlayer.walletAddress.slice(0, 4)}...${ownerPlayer.walletAddress.slice(-4)}`
                          : "Unknown"}
                      </span>
                      <span className="text-gray-700">·</span>
                      <span
                        className={`font-mono text-[10px] ${CATEGORY_COLORS[topCategory]}`}
                      >
                        Best: {topCategory}
                      </span>
                    </div>
                  </div>

                  {/* Ability Score */}
                  <div className="shrink-0 text-right">
                    <div className="font-mono font-bold text-white text-sm">
                      {Math.round(totalAbility)}
                    </div>
                    <div className="font-mono text-[10px] text-gray-500">
                      AP
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
