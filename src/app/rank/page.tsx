"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { PixelSprite } from "@/components/PixelSprite";
import { getAgentsByIds, getPlayersByIds } from "@/lib/db";
import { useRankings } from "@/hooks/useRankings";
import { getSquadLeaderboard, type SquadStats } from "@/lib/squads-read";
import { getAllTrophies, getChampionAndPlayerLabel, getPastBosses, type RaidBoss, type TrophyTier } from "@/lib/raid/raid-read";
import { bossByKey } from "@/lib/raid/bosses";
import { TrophyBadges } from "@/components/TrophyBadges";
import { getCosmetics, getTitles, type Cosmetics } from "@/lib/shop/shop-read";
import { titleLabel } from "@/lib/shop/catalog";
import { auraStyle, nameColorClass } from "@/components/shop/cosmeticStyle";

interface HallEntry {
  boss: RaidBoss;
  champion: string | null;
  slayer: string | null;
}

async function loadHallOfFame(): Promise<{ hall: HallEntry[]; trophies: { playerId: string; tier: TrophyTier }[] }> {
  const [past, trophies] = await Promise.all([getPastBosses(10), getAllTrophies()]);
  const hall = await Promise.all(
    past.map(async (boss) => {
      const labels = await getChampionAndPlayerLabel(boss.id, boss.lastHitPlayerId);
      return { boss, champion: labels.champion, slayer: labels.player };
    })
  );
  return { hall, trophies };
}
import type { Agent } from "@/lib/types";
import Link from "next/link";

const ROLE_BADGE: Record<string, string> = {
  future: "bg-purple-700 text-purple-200",
  modern: "bg-blue-700 text-blue-200",
  medieval: "bg-amber-700 text-amber-200",
};

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

  const { rankings, error: rankError, retry: retryRankings } = useRankings();
  const [tab, setTab] = useState<"agents" | "squads" | "raid">("agents");
  const [raidData, setRaidData] = useState<Awaited<ReturnType<typeof loadHallOfFame>> | null>(null);
  const [squadBoard, setSquadBoard] = useState<(SquadStats & { agentIds: string[] })[] | null>(null);
  const [squadAgents, setSquadAgents] = useState<Map<string, Agent>>(new Map());
  const [wallets, setWallets] = useState<Map<string, string>>(new Map());

  const addWallets = (playerIds: string[]) =>
    getPlayersByIds(playerIds)
      .then((ps) => setWallets((prev) => new Map([...prev, ...ps.map((p) => [p.id, p.walletAddress] as const)])))
      .catch(() => {});

  useEffect(() => {
    if (tab !== "raid" || raidData) return;
    loadHallOfFame()
      .then((data) => {
        setRaidData(data);
        addWallets([...new Set(data.trophies.map((t) => t.playerId))]);
      })
      .catch(() => setRaidData({ hall: [], trophies: [] }));
  }, [tab, raidData]);

  useEffect(() => {
    if (tab !== "squads" || squadBoard) return;
    getSquadLeaderboard(50)
      .then(async (board) => {
        setSquadBoard(board);
        addWallets(board.map((r) => r.playerId));
        const agents = await getAgentsByIds(board.flatMap((r) => r.agentIds));
        setSquadAgents(new Map(agents.map((a) => [a.id, a])));
      })
      .catch(() => setSquadBoard([]));
  }, [tab, squadBoard]);

  useEffect(() => {
    if (!loading && !player) router.push("/");
  }, [loading, player, router]);

  const [cosmetics, setCosmetics] = useState<Record<string, Cosmetics>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!rankings) return;
    getCosmetics(rankings.top.map((a) => a.id)).then(setCosmetics).catch(() => {});
    getTitles([...new Set(rankings.top.map((a) => a.playerId))]).then(setTitles).catch(() => {});
  }, [rankings]);

  useEffect(() => {
    if (!rankings) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- merge owner wallets that arrive with the rankings
    setWallets((prev) => new Map([...prev, ...rankings.top.flatMap((a) => (a.wallet ? [[a.playerId, a.wallet] as const] : []))]));
  }, [rankings]);

  // Render as soon as rankings are available; player startup only adds the "YOU" highlights.
  if (!player && !rankings) return null;

  const loadingData = !rankings && !rankError;
  const shortWallet = (playerId: string) => {
    const w = wallets.get(playerId);
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
            <div className="font-mono font-bold text-lg text-white">{rankings?.totalPlayers ?? 0}</div>
            <div className="font-mono text-[10px] text-gray-500">Total Players</div>
          </div>
          <div className="text-center">
            <div className="font-mono font-bold text-lg text-white">{rankings?.totalAgents ?? 0}</div>
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
                      <li key={playerId} className={`flex items-center justify-between gap-2 border rounded px-3 py-2 ${playerId === player?.id ? "border-purple-700/50 bg-purple-900/10" : "border-gray-800 bg-gray-900"}`}>
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
                  row.playerId === player?.id ? "border-purple-700/50 bg-purple-900/10" : "border-gray-800 bg-gray-900"
                }`}
              >
                <span className="w-8 text-center font-mono text-sm text-gray-400 font-bold">#{i + 1}</span>
                <div className="flex -space-x-2">
                  {row.agentIds.map((id) => {
                    const a = squadAgents.get(id);
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
      ) : !rankings ? (
        <div className="text-center py-12">
          <span className="font-mono text-gray-400">Could not load rankings.</span>
          <button
            type="button"
            onClick={retryRankings}
            className="block mx-auto mt-3 px-4 py-2 min-h-[40px] border border-gray-700 rounded font-mono text-xs text-gray-300"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="font-mono text-xs text-gray-600 mb-2">Top {rankings.top.length} Agents by Ability</p>
          {rankings.top.map((agent, index) => {
            const rank = index + 1;
            const isOwn = agent.playerId === player?.id;
            const topCategory = agent.topCategory;

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
                  <div className="shrink-0" style={{ filter: auraStyle(cosmetics[agent.id]?.aura) }}>
                    <PixelSprite
                      spriteSeed={agent.spriteSeed}
                      role={agent.role}
                      size={48}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-sm font-bold truncate ${nameColorClass(cosmetics[agent.id]?.namecolor) || "text-white"}`}>
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
                        {shortWallet(agent.playerId)}
                      </span>
                      {titles[agent.playerId] && (
                        <span className="font-mono text-[9px] px-1 rounded bg-yellow-900/40 text-yellow-300 border border-yellow-700/50">
                          {titleLabel(titles[agent.playerId])}
                        </span>
                      )}
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
                      {Math.round(agent.totalAbility)}
                    </div>
                    <div className="font-mono text-[10px] text-gray-500">
                      AP
                    </div>
                  </div>

                  {/* PvP Record */}
                  {(() => {
                    const stat = agent.pvp;
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
