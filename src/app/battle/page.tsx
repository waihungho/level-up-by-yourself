"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { PixelSprite } from "@/components/PixelSprite";
import { BattlePlayback } from "@/components/BattlePlayback";
import {
  getAgentWithDimensions,
  saveBattleLog,
  getAgentFightsToday,
} from "@/lib/db";
import { resolveBattle } from "@/lib/battle-engine";
import { DIMENSIONS } from "@/lib/constants";
import type { AgentWithDimensions, BattleLog } from "@/lib/types";
import Link from "next/link";

const MAX_FIGHTS_PER_DAY = 3;

const ROLE_BADGE: Record<string, string> = {
  future: "bg-purple-700 text-purple-200",
  modern: "bg-blue-700 text-blue-200",
  medieval: "bg-amber-700 text-amber-200",
};

type Phase = "select" | "battle";

function getTotalHp(agent: AgentWithDimensions): number {
  return DIMENSIONS.reduce((sum, dim) => {
    const ad = agent.dimensions.find((d) => d.dimensionId === dim.id);
    return sum + (ad ? ad.value : 10);
  }, 0);
}

export default function BattlePage() {
  const { player, agents, loading, refreshAgents } = useGame();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("select");
  const [selected, setSelected] = useState<string[]>([]);
  const [allAgentsFull, setAllAgentsFull] = useState<AgentWithDimensions[]>([]);
  const [fightsToday, setFightsToday] = useState<Record<string, number>>({});
  const [battleLog, setBattleLog] = useState<BattleLog | null>(null);
  const [playbackDone, setPlaybackDone] = useState(false);
  const [attackerFull, setAttackerFull] = useState<AgentWithDimensions | null>(null);
  const [defenderFull, setDefenderFull] = useState<AgentWithDimensions | null>(null);

  useEffect(() => {
    if (!loading && !player) router.push("/");
  }, [loading, player, router]);

  // Load all agents with dimensions + fight counts
  useEffect(() => {
    async function loadAll() {
      const fulls: AgentWithDimensions[] = [];
      const counts: Record<string, number> = {};
      for (const agent of agents) {
        const full = await getAgentWithDimensions(agent.id);
        if (full) fulls.push(full);
        counts[agent.id] = await getAgentFightsToday(agent.id);
      }
      setAllAgentsFull(fulls);
      setFightsToday(counts);
    }
    if (agents.length > 0) loadAll();
  }, [agents]);

  function toggleAgent(agentId: string) {
    setSelected((prev) => {
      if (prev.includes(agentId)) {
        return prev.filter((id) => id !== agentId);
      }
      if (prev.length >= 2) return prev;
      return [...prev, agentId];
    });
  }

  async function startBattle() {
    if (selected.length !== 2) return;
    const atk = allAgentsFull.find((a) => a.id === selected[0]);
    const def = allAgentsFull.find((a) => a.id === selected[1]);
    if (!atk || !def) return;

    setAttackerFull(atk);
    setDefenderFull(def);
    const log = resolveBattle(atk, def);
    await saveBattleLog(log);
    await refreshAgents();
    setBattleLog(log);
    setPhase("battle");
  }

  const handlePlaybackComplete = useCallback(() => {
    setPlaybackDone(true);
  }, []);

  function resetBattle() {
    setPhase("select");
    setSelected([]);
    setAttackerFull(null);
    setDefenderFull(null);
    setBattleLog(null);
    setPlaybackDone(false);
    // Reload fight counts
    (async () => {
      const counts: Record<string, number> = {};
      for (const agent of agents) {
        counts[agent.id] = await getAgentFightsToday(agent.id);
      }
      setFightsToday(counts);
    })();
  }

  if (loading || !player) return null;

  // --------------------------------------------------
  // Phase 1: Select Agents
  // --------------------------------------------------
  if (phase === "select") {
    const selectedAgents = selected
      .map((id) => allAgentsFull.find((a) => a.id === id))
      .filter(Boolean) as AgentWithDimensions[];

    return (
      <main className="min-h-screen bg-gray-950 text-white p-6 pb-24 max-w-2xl mx-auto">
        <h1 className="text-2xl font-mono font-bold mb-2 text-center">
          Battle Arena
        </h1>

        {/* PvP Section */}
        <div className="mb-8 bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="text-3xl">⚔</span>
            <h2 className="text-xl font-mono font-bold text-red-400">PvP Battle</h2>
            <span className="text-3xl">⚔</span>
          </div>
          <p className="font-mono text-gray-500 text-sm animate-pulse">
            PvP coming soon.....
          </p>
        </div>

        {/* My Agent Training Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🏋</span>
            <div>
              <h2 className="text-lg font-mono font-bold text-white">My Agent Training</h2>
              <p className="font-mono text-xs text-gray-500">Select 2 agents to spar</p>
            </div>
          </div>

        {allAgentsFull.length < 2 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 font-mono mb-4">
              You need at least 2 agents to train.
            </p>
            <Link
              href="/agents"
              className="text-purple-400 hover:text-purple-300 font-mono"
            >
              &larr; Back to agents
            </Link>
          </div>
        ) : (
          <>
            {/* Agent grid */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {allAgentsFull.map((agent) => {
                const fights = fightsToday[agent.id] ?? 0;
                const remaining = MAX_FIGHTS_PER_DAY - fights;
                const disabled = remaining <= 0;
                const totalHp = getTotalHp(agent);
                const isSelected = selected.includes(agent.id);
                const selIndex = selected.indexOf(agent.id);
                const canSelect = isSelected || selected.length < 2;

                return (
                  <button
                    key={agent.id}
                    onClick={() => {
                      if (disabled || (!canSelect && !isSelected)) return;
                      toggleAgent(agent.id);
                    }}
                    disabled={disabled}
                    className={`border rounded-lg p-3 text-center transition-all duration-200 relative ${
                      disabled
                        ? "border-gray-800 bg-gray-900/50 opacity-40 cursor-not-allowed"
                        : isSelected
                        ? "border-purple-500 bg-purple-900/30 ring-1 ring-purple-500/50 scale-[1.03]"
                        : "border-gray-700 bg-gray-900 hover:border-gray-500 cursor-pointer"
                    }`}
                  >
                    {/* Selection badge */}
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                        {selIndex + 1}
                      </span>
                    )}
                    <div className="flex justify-center mb-1.5">
                      <PixelSprite
                        spriteSeed={agent.spriteSeed as Record<string, number>}
                        role={agent.role}
                        size={52}
                      />
                    </div>
                    <p className="font-mono text-xs font-bold text-white truncate">
                      {agent.name}
                    </p>
                    <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded font-mono ${ROLE_BADGE[agent.role]}`}>
                      {agent.role}
                    </span>
                    <p className="font-mono text-[10px] text-gray-500 mt-1">
                      HP: {Math.round(totalHp)}
                    </p>
                    <p
                      className={`font-mono text-[10px] mt-0.5 ${
                        disabled ? "text-red-400" : "text-gray-600"
                      }`}
                    >
                      {remaining}/{MAX_FIGHTS_PER_DAY} fights
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Selected agents summary + Fight button */}
            {selectedAgents.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 animate-fadeIn">
                <div className="flex items-center justify-center gap-4 mb-4">
                  {/* Agent 1 */}
                  <div className="text-center">
                    <PixelSprite
                      spriteSeed={selectedAgents[0].spriteSeed as Record<string, number>}
                      role={selectedAgents[0].role}
                      size={64}
                    />
                    <p className="font-mono text-xs font-bold text-white mt-1 truncate max-w-[80px]">
                      {selectedAgents[0].name}
                    </p>
                    <span className={`inline-block text-[9px] px-1 py-0.5 rounded font-mono ${ROLE_BADGE[selectedAgents[0].role]}`}>
                      {selectedAgents[0].role}
                    </span>
                  </div>

                  {/* VS */}
                  {selectedAgents.length === 2 ? (
                    <span className="font-mono font-black text-2xl text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">
                      VS
                    </span>
                  ) : (
                    <span className="font-mono text-sm text-gray-600">vs ?</span>
                  )}

                  {/* Agent 2 */}
                  {selectedAgents.length === 2 ? (
                    <div className="text-center">
                      <PixelSprite
                        spriteSeed={selectedAgents[1].spriteSeed as Record<string, number>}
                        role={selectedAgents[1].role}
                        size={64}
                      />
                      <p className="font-mono text-xs font-bold text-white mt-1 truncate max-w-[80px]">
                        {selectedAgents[1].name}
                      </p>
                      <span className={`inline-block text-[9px] px-1 py-0.5 rounded font-mono ${ROLE_BADGE[selectedAgents[1].role]}`}>
                        {selectedAgents[1].role}
                      </span>
                    </div>
                  ) : (
                    <div className="w-16 h-16 border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center">
                      <span className="text-gray-600 font-mono text-xs">?</span>
                    </div>
                  )}
                </div>

                {/* Fight button — only when 2 selected */}
                {selectedAgents.length === 2 && (
                  <button
                    onClick={startBattle}
                    className="w-full py-3 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-mono font-bold text-lg rounded-lg transition-all animate-pulseGlow"
                  >
                    FIGHT!
                  </button>
                )}
              </div>
            )}
          </>
        )}
        </div>
      </main>
    );
  }

  // --------------------------------------------------
  // Phase 3: Battle Playback & Results
  // --------------------------------------------------
  if (phase === "battle" && battleLog && attackerFull && defenderFull) {
    const winner =
      battleLog.winnerId === attackerFull.id ? attackerFull : defenderFull;

    function renderGrowth(
      growth: Record<number, number>,
      agentName: string
    ) {
      const entries = Object.entries(growth);
      if (entries.length === 0) return null;

      return (
        <div className="bg-gray-900 border border-gray-800 rounded p-4">
          <h3 className="font-mono text-sm text-gray-400 mb-2">
            {agentName} Growth
          </h3>
          <div className="flex flex-wrap gap-2">
            {entries.map(([dimIdStr, delta]) => {
              const dimId = Number(dimIdStr);
              const dim = DIMENSIONS.find((d) => d.id === dimId);
              const name = dim?.name ?? `Dim ${dimId}`;
              return (
                <span
                  key={dimId}
                  className="inline-flex items-center px-2 py-1 rounded text-xs font-mono bg-green-900/50 text-green-400 border border-green-800"
                >
                  +{delta.toFixed(1)} {name}
                </span>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <main className="min-h-screen bg-gray-950 text-white p-6 pb-24 max-w-2xl mx-auto">
        <h1 className="text-2xl font-mono font-bold mb-6 text-center">
          Battle Arena
        </h1>

        <BattlePlayback
          battleLog={battleLog}
          attacker={attackerFull}
          defender={defenderFull}
          onComplete={handlePlaybackComplete}
        />

        {playbackDone && (
          <div className="mt-8 space-y-4 animate-fadeIn">
            <div className="text-center mb-4">
              <p className="font-mono text-lg text-yellow-400">
                {winner.name} is victorious!
              </p>
            </div>

            {renderGrowth(battleLog.attackerGrowth, attackerFull.name)}
            {renderGrowth(battleLog.defenderGrowth, defenderFull.name)}

            <div className="flex flex-col items-center gap-3 mt-6">
              <button
                onClick={resetBattle}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-mono text-sm rounded transition-colors"
              >
                Fight Again
              </button>
              <Link
                href="/agents"
                className="text-sm text-gray-500 font-mono hover:text-gray-400"
              >
                &larr; Back to Agents
              </Link>
            </div>
          </div>
        )}
      </main>
    );
  }

  return null;
}
