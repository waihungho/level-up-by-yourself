"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { PixelSprite } from "@/components/PixelSprite";
import { getAllAgentsWithDimensions, getAllPlayers, getPvpStatsForAgents } from "@/lib/db";
import { getSquadLeaderboard, type SquadStats } from "@/lib/squads-read";
import { getAllTrophies, getContributions, getPastBosses, type RaidBoss, type TrophyTier } from "@/lib/raid/raid-read";
import { bossByKey } from "@/lib/raid/bosses";
import { TrophyBadges } from "@/components/TrophyBadges";

interface HallEntry {
  boss: RaidBoss;
  champion: string | null;
  slayer: string | null;
}

async function loadHallOfFame(): Promise<{ hall: HallEntry[]; trophies: { playerId: string; tier: TrophyTier }[] }> {
  const [past, trophies] = await Promise.all([getPastBosses(10), getAllTrophies()]);
  const hall = await Promise.all(
    past.map(async (boss) => {
      const contributions = await getContributions(boss.id);
      const label = (playerId: string | null) => contributions.find((c) => c.playerId === playerId)?.label || null;
      return { boss, champion: contributions[0]?.label || null, slayer: label(boss.lastHitPlayerId) };
    })
  );
  return { hall, trophies };
}
import { DIMENSIONS } from "@/lib/constants";
import type { AgentWithDimensions, Player, PvpStats } from "@/lib/types";
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
  const [pvpStats, setPvpStats] = useState<Record<string, PvpStats>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [tab, setTab] = useState<"agents" | "squads" | "raid">("agents");
  const [raidData, setRaidData] = useState<Awaited<ReturnType<typeof loadHallOfFame>> | null>(null);

  useEffect(() => {
    if (tab !== "raid" || raidData) return;
    loadHallOfFame()
      .then(setRaidData)
      .catch(() => setRaidData({ hall: [], trophies: [] }));
  }, [tab, raidData]);
  const [squadBoard, setSquadBoard] = useState<(SquadStats & { agentIds: string[] })[] | null>(null);

  useEffect(() => {
    if (tab !== "squads" || squadBoard) return;
    getSquadLeaderboard(50)
      .then(setSquadBoard)
      .catch(() => setSquadBoard([]));
  }, [tab, squadBoard]);

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
      // Load PvP stats for top 100 agents (or all if fewer)
      const top100Ids = allAgents.slice(0, 100).map((a) => a.id);
      const stats = await getPvpStatsForAgents(top100Ids);
      setPvpStats(stats);
      setLoadingData(false);
    }
    if (player) load();
  }, [player]);

  if (loading || !player) return null;

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const shortWallet = (playerId: string) => {
    const w = playerMap.get(playerId)?.walletAddress;
    return w ? `${w.slice(0, 4)}...${w.slice(-4)}` : "Unknown";
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 pb-32 max-w-2xl mx-auto">
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

      <div className="flex justify-center gap-2 mb-4" role="tablist">
        {(["agents", "squads", "raid"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 min-h-[40px] rounded font-mono text-xs font-bold border ${
              tab === t ? "border-purple-500 bg-purple-900/30 text-white" : "border-gray-700 text-gray-400"
            }`}
          >
            {t === "agents" ? "Agents" : t === "squads" ? "Squads" : "Raid"}
          </button>
        ))}
      </div>

      {tab === "raid" ? (
        !raidData ? (
          <p className="text-center font-mono text-sm text-gray-500 py-12">Loading hall of fame...</p>
        ) : (
          <div className="space-y-6">
            <section>
              <h2 className="font-mono text-sm font-bold mb-2">Hall of Fame</h2>
              {raidData.hall.length === 0 ? (
                <p className="font-mono text-xs text-gray-500">No bosses have fallen yet.</p>
              ) : (
                <ul className="space-y-2">
                  {raidData.hall.map(({ boss, champion, slayer }) => (
                    <li key={boss.id} className="border border-gray-800 bg-gray-900 rounded-lg p-3 font-mono text-xs">
                      <div className="flex justify-between">
                        <span className="text-white font-bold">{bossByKey(boss.bossKey)?.name ?? boss.bossKey}</span>
                        <span className={boss.status === "defeated" ? "text-green-400" : "text-gray-500"}>
                          {boss.status === "defeated" ? "Defeated" : "Escaped"} · week of {boss.weekStart}
                        </span>
                      </div>
                      <div className="text-gray-400 mt-1">
                        👑 {champion ?? "—"}
                        {slayer && <span className="ml-3">🗡 {slayer}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h2 className="font-mono text-sm font-bold mb-2">Most decorated raiders</h2>
              {(() => {
                const byPlayer = new Map<string, { tier: TrophyTier }[]>();
                for (const t of raidData.trophies) byPlayer.set(t.playerId, [...(byPlayer.get(t.playerId) ?? []), t]);
                const rows = [...byPlayer.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 20);
                if (!rows.length) return <p className="font-mono text-xs text-gray-500">No trophies awarded yet.</p>;
                return (
                  <ul className="space-y-1">
                    {rows.map(([playerId, list], i) => (
                      <li key={playerId} className={`flex items-center justify-between gap-2 border rounded px-3 py-2 ${playerId === player.id ? "border-purple-700/50 bg-purple-900/10" : "border-gray-800 bg-gray-900"}`}>
                        <span className="font-mono text-xs text-gray-400">
                          #{i + 1} {shortWallet(playerId)}
                        </span>
                        <TrophyBadges trophies={list} />
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </section>
          </div>
        )
      ) : tab === "squads" ? (
        !squadBoard ? (
          <p className="text-center font-mono text-sm text-gray-500 py-12">Loading squads...</p>
        ) : squadBoard.length === 0 ? (
          <p className="text-center font-mono text-sm text-gray-500 py-12">No squad battles yet. Be the first!</p>
        ) : (
          <div className="space-y-2">
            {squadBoard.map((row, i) => (
              <div
                key={row.playerId}
                className={`border rounded-lg p-3 flex items-center gap-3 ${
                  row.playerId === player.id ? "border-purple-700/50 bg-purple-900/10" : "border-gray-800 bg-gray-900"
                }`}
              >
                <span className="w-8 text-center font-mono text-sm text-gray-400 font-bold">#{i + 1}</span>
                <div className="flex -space-x-2">
                  {row.agentIds.map((id) => {
                    const a = agentMap.get(id);
                    return a ? <PixelSprite key={id} spriteSeed={a.spriteSeed as Record<string, number>} role={a.role} size={36} /> : null;
                  })}
                </div>
                <span className="flex-1 font-mono text-[11px] text-gray-400 truncate">{shortWallet(row.playerId)}</span>
                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-emerald-300">{row.rating}</div>
                  <div className="font-mono text-[10px]">
                    <span className="text-green-400">{row.wins}W</span>
                    <span className="text-gray-600"> - </span>
                    <span className="text-red-400">{row.losses}L</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : loadingData ? (
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

                  {/* PvP Record */}
                  {(() => {
                    const stat = pvpStats[agent.id];
                    if (!stat || (stat.wins === 0 && stat.losses === 0)) return (
                      <div className="shrink-0 text-right ml-2">
                        <div className="font-mono text-[10px] text-gray-600">—</div>
                        <div className="font-mono text-[10px] text-gray-600">W-L</div>
                      </div>
                    );
                    return (
                      <div className="shrink-0 text-right ml-2">
                        <div className="font-mono text-xs font-bold">
                          <span className="text-green-400">{stat.wins}W</span>
                          <span className="text-gray-600"> - </span>
                          <span className="text-red-400">{stat.losses}L</span>
                        </div>
                        <div className="font-mono text-[10px] text-gray-500">PvP</div>
                      </div>
                    );
                  })()}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
