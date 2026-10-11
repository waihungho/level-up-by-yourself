"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { getAgentWithDimensions, getGrowthLogs, getBattleLogs, getBattleLogsCount, getGrowthLogsCount } from "@/lib/db";
import { DimensionChart } from "@/components/DimensionChart";
import { GrowthTimeline } from "@/components/GrowthTimeline";
import { BattleHistory } from "@/components/BattleHistory";
import type { AgentWithDimensions, BattleLog, GrowthLog } from "@/lib/types";
import Link from "next/link";
import { PixelSprite } from "@/components/PixelSprite";
import { TrophyBadges } from "@/components/TrophyBadges";
import { getTrophies, type TrophyTier } from "@/lib/raid/raid-read";
import { getCosmetics, type Cosmetics } from "@/lib/shop/shop-read";
import { auraStyle, nameColorClass } from "@/components/shop/cosmeticStyle";
import { EquipmentPanel } from "@/components/shop/EquipmentPanel";
import { weaponTint } from "@/components/shop/gearStyle";
import { GemChip } from "@/components/GemChip";
import { getGearForAgents } from "@/lib/shop/gear-read";
import type { Gear } from "@/lib/shop/catalog";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { announceGemBalance } from "@/lib/shop-client";

const ROLE_COLORS = {
  future: "border-purple-700 bg-purple-900/30",
  modern: "border-blue-700 bg-blue-900/30",
  medieval: "border-amber-700 bg-amber-900/30",
};

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { player, loading } = useGame();
  const { publicKey } = useUnifiedWallet();
  const [gear, setGear] = useState<Gear>({});
  const router = useRouter();
  const [agent, setAgent] = useState<AgentWithDimensions | null>(null);
  const [logs, setLogs] = useState<GrowthLog[]>([]);
  const [battleLogs, setBattleLogs] = useState<BattleLog[]>([]);
  const [battleCount, setBattleCount] = useState(0);
  const [growthCount, setGrowthCount] = useState(0);
  const [loadingAgent, setLoadingAgent] = useState(true);
  const [trophies, setTrophies] = useState<{ tier: TrophyTier }[]>([]);
  const [cosmetics, setCosmetics] = useState<Cosmetics>({});

  useEffect(() => {
    if (!loading && !player) router.push("/");
  }, [loading, player, router]);

  useEffect(() => {
    async function load() {
      if (!id) return;
      setLoadingAgent(true);
      const [a, l, bl, bc, gc] = await Promise.all([
        getAgentWithDimensions(id),
        getGrowthLogs(id),
        getBattleLogs(id),
        getBattleLogsCount(id),
        getGrowthLogsCount(id),
      ]);
      setAgent(a);
      setLogs(l);
      setBattleLogs(bl);
      setBattleCount(bc);
      setGrowthCount(gc);
      setLoadingAgent(false);
      if (a) {
        getTrophies([a.playerId])
          .then((t) => setTrophies(t[a.playerId] ?? []))
          .catch(() => setTrophies([]));
        getGearForAgents([a.id])
          .then((g) => setGear(g[a.id] ?? {}))
          .catch(() => setGear({}));
        getCosmetics([a.id])
          .then((c) => setCosmetics(c[a.id] ?? {}))
          .catch(() => setCosmetics({}));
      }
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
      <div className="flex items-center justify-between mb-4">
        <Link href="/agents" className="text-sm text-gray-500 font-mono hover:text-gray-400">
          &larr; Back to agents
        </Link>
        <GemChip />
      </div>

      {/* Header */}
      <div className={`border rounded p-4 mb-6 ${ROLE_COLORS[agent.role]}`}>
        <div className="flex gap-4 items-center">
          <div style={{ filter: auraStyle(cosmetics.aura) }}>
            <PixelSprite spriteSeed={agent.spriteSeed as Record<string, number>} role={agent.role} size={80} weaponTint={weaponTint(gear)} />
          </div>
          <div>
            <h1 className={`text-2xl font-mono font-bold ${nameColorClass(cosmetics.namecolor)}`}>{agent.name}</h1>
            <p className="text-gray-400 font-mono">{agent.roleTitle} &middot; {agent.role}</p>
            <div className="mt-1">
              <TrophyBadges trophies={trophies} />
            </div>
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

      {/* Equipment */}
      <div className="mb-6">
        <EquipmentPanel
          agentId={agent.id}
          role={agent.role}
          gear={gear}
          walletAddress={publicKey && player?.id === agent.playerId ? publicKey.toBase58() : null}
          onUpgraded={(g, balance) => {
            setGear(g);
            announceGemBalance(balance);
          }}
        />
      </div>

      {/* Dimensions */}
      <div className="bg-gray-900 border border-gray-800 rounded p-4 mb-6">
        <h2 className="text-lg font-mono font-bold mb-4">Dimensions</h2>
        <DimensionChart dimensions={agent.dimensions} />
      </div>

      {/* Growth Timeline */}
      <div>
        <h2 className="text-lg font-mono font-bold mb-4">Growth Log</h2>
        <GrowthTimeline logs={logs} totalCount={growthCount} />
      </div>

      {/* Battle History */}
      <div>
        <h2 className="text-lg font-mono font-bold mb-4">Battle History</h2>
        <BattleHistory logs={battleLogs} agentId={id} totalCount={battleCount} />
      </div>
    </main>
  );
}
