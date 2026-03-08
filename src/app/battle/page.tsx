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

const ROLE_COLORS: Record<string, string> = {
  future: "border-purple-700 bg-purple-900/30",
  modern: "border-blue-700 bg-blue-900/30",
  medieval: "border-amber-700 bg-amber-900/30",
};

type Phase = "select" | "pre-battle" | "battle";

export default function BattlePage() {
  const { player, agents, loading, refreshAgents } = useGame();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("select");
  const [selectStep, setSelectStep] = useState<1 | 2>(1);
  const [attackerFull, setAttackerFull] = useState<AgentWithDimensions | null>(
    null
  );
  const [defenderFull, setDefenderFull] = useState<AgentWithDimensions | null>(
    null
  );
  const [fightsToday, setFightsToday] = useState<Record<string, number>>({});
  const [battleLog, setBattleLog] = useState<BattleLog | null>(null);
  const [playbackDone, setPlaybackDone] = useState(false);
  const [loadingAgent, setLoadingAgent] = useState(false);

  useEffect(() => {
    if (!loading && !player) router.push("/");
  }, [loading, player, router]);

  // Load fight counts for all agents
  useEffect(() => {
    async function loadFights() {
      const counts: Record<string, number> = {};
      for (const agent of agents) {
        counts[agent.id] = await getAgentFightsToday(agent.id);
      }
      setFightsToday(counts);
    }
    if (agents.length > 0) loadFights();
  }, [agents]);

  async function selectAgent(agentId: string) {
    setLoadingAgent(true);
    const full = await getAgentWithDimensions(agentId);
    if (!full) {
      setLoadingAgent(false);
      return;
    }

    if (selectStep === 1) {
      setAttackerFull(full);
      setSelectStep(2);
    } else {
      setDefenderFull(full);
      setPhase("pre-battle");
    }
    setLoadingAgent(false);
  }

  async function startBattle() {
    if (!attackerFull || !defenderFull) return;

    const log = resolveBattle(attackerFull, defenderFull);
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
    setSelectStep(1);
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
    const availableAgents =
      selectStep === 2
        ? agents.filter((a) => a.id !== attackerFull?.id)
        : agents;

    return (
      <main className="min-h-screen bg-gray-950 text-white p-6 pb-24 max-w-2xl mx-auto">
        <h1 className="text-2xl font-mono font-bold mb-6">Battle Arena</h1>

        <h2 className="text-lg font-mono text-gray-400 mb-4">
          {selectStep === 1 ? "Select Your Fighter" : "Select Opponent"}
        </h2>

        {selectStep === 2 && (
          <button
            onClick={() => {
              setSelectStep(1);
              setAttackerFull(null);
            }}
            className="text-sm text-gray-500 font-mono hover:text-gray-400 mb-4 block"
          >
            &larr; Back to fighter selection
          </button>
        )}

        {availableAgents.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 font-mono mb-4">
              {agents.length < 2
                ? "You need at least 2 agents to battle."
                : "No opponents available."}
            </p>
            <Link
              href="/agents"
              className="text-purple-400 hover:text-purple-300 font-mono"
            >
              &larr; Back to agents
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {availableAgents.map((agent) => {
              const fights = fightsToday[agent.id] ?? 0;
              const remaining = MAX_FIGHTS_PER_DAY - fights;
              const disabled = remaining <= 0;

              return (
                <button
                  key={agent.id}
                  onClick={() => !disabled && !loadingAgent && selectAgent(agent.id)}
                  disabled={disabled || loadingAgent}
                  className={`border rounded p-3 text-left transition-colors ${
                    disabled
                      ? "border-gray-800 bg-gray-900/50 opacity-50 cursor-not-allowed"
                      : "border-gray-700 bg-gray-900 hover:border-purple-600 hover:bg-gray-800 cursor-pointer"
                  }`}
                >
                  <div className="flex justify-center mb-2">
                    <PixelSprite
                      spriteSeed={agent.spriteSeed as Record<string, number>}
                      role={agent.role}
                      size={56}
                    />
                  </div>
                  <p className="font-mono text-sm font-bold text-white text-center truncate">
                    {agent.name}
                  </p>
                  <p
                    className={`font-mono text-xs text-center mt-1 ${
                      disabled ? "text-red-400" : "text-gray-400"
                    }`}
                  >
                    {remaining}/{MAX_FIGHTS_PER_DAY} fights left
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </main>
    );
  }

  // --------------------------------------------------
  // Phase 2: Pre-Battle
  // --------------------------------------------------
  if (phase === "pre-battle" && attackerFull && defenderFull) {
    const attackerHp = attackerFull.dimensions.reduce(
      (sum, d) => sum + d.value,
      0
    );
    const defenderHp = defenderFull.dimensions.reduce(
      (sum, d) => sum + d.value,
      0
    );

    return (
      <main className="min-h-screen bg-gray-950 text-white p-6 pb-24 max-w-2xl mx-auto">
        <h1 className="text-2xl font-mono font-bold mb-6 text-center">
          Battle Arena
        </h1>

        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Attacker */}
          <div
            className={`border rounded p-4 text-center ${ROLE_COLORS[attackerFull.role]}`}
          >
            <div className="flex justify-center mb-3">
              <PixelSprite
                spriteSeed={
                  attackerFull.spriteSeed as Record<string, number>
                }
                role={attackerFull.role}
                size={80}
              />
            </div>
            <p className="font-mono font-bold text-white text-lg">
              {attackerFull.name}
            </p>
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-mono bg-gray-800 text-gray-300">
              {attackerFull.role}
            </span>
            <p className="font-mono text-sm text-gray-400 mt-2">
              HP: {Math.round(attackerHp)}
            </p>
          </div>

          {/* Defender */}
          <div
            className={`border rounded p-4 text-center ${ROLE_COLORS[defenderFull.role]}`}
          >
            <div className="flex justify-center mb-3">
              <PixelSprite
                spriteSeed={
                  defenderFull.spriteSeed as Record<string, number>
                }
                role={defenderFull.role}
                size={80}
              />
            </div>
            <p className="font-mono font-bold text-white text-lg">
              {defenderFull.name}
            </p>
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-mono bg-gray-800 text-gray-300">
              {defenderFull.role}
            </span>
            <p className="font-mono text-sm text-gray-400 mt-2">
              HP: {Math.round(defenderHp)}
            </p>
          </div>
        </div>

        <div className="text-center font-mono text-2xl text-gray-600 mb-8">
          VS
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={startBattle}
            className="px-8 py-3 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-mono font-bold text-lg rounded transition-all"
          >
            Fight!
          </button>
          <button
            onClick={() => {
              setPhase("select");
              setSelectStep(1);
              setAttackerFull(null);
              setDefenderFull(null);
            }}
            className="text-sm text-gray-500 font-mono hover:text-gray-400"
          >
            &larr; Back to selection
          </button>
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
