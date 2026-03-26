"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { PixelSprite } from "@/components/PixelSprite";
import { BattlePlayback } from "@/components/BattlePlayback";
import {
  getAgentWithDimensions,
  saveBattleLog,
  getAgentFightsToday,
  rechargeAgentFights,
  getPvpFightsToday,
  getPvpStatsForAgents,
} from "@/lib/db";
import { resolveBattle } from "@/lib/battle-engine";
import { createPaymentTransaction, confirmTransaction } from "@/lib/sol-payment";
import { DIMENSIONS } from "@/lib/constants";
import type { AgentWithDimensions, BattleLog, PvpStats } from "@/lib/types";
import Link from "next/link";

const MAX_FIGHTS_PER_DAY = 3;
const MAX_PVP_FIGHTS = 3;
const RECHARGE_COST_SOL = 0.05;

function getTimeUntilMidnight(): string {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight.getTime() - now.getTime();
  const h = Math.floor(diff / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const s = Math.floor((diff % (1000 * 60)) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
  const { publicKey, connected, sendTransaction, connection } = useUnifiedWallet();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("select");
  const [recharging, setRecharging] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [allAgentsFull, setAllAgentsFull] = useState<AgentWithDimensions[]>([]);
  const [fightsToday, setFightsToday] = useState<Record<string, number>>({});
  const [battleLog, setBattleLog] = useState<BattleLog | null>(null);
  const [playbackDone, setPlaybackDone] = useState(false);
  const [attackerFull, setAttackerFull] = useState<AgentWithDimensions | null>(null);
  const [defenderFull, setDefenderFull] = useState<AgentWithDimensions | null>(null);
  const [resetTimer, setResetTimer] = useState(getTimeUntilMidnight());

  // PvP state
  const [pvpSelected, setPvpSelected] = useState<string | null>(null);
  const [pvpFightsToday, setPvpFightsToday] = useState<Record<string, number>>({});
  const [pvpLoading, setPvpLoading] = useState(false);
  const [pvpError, setPvpError] = useState<string | null>(null);
  const [pvpBattleLog, setPvpBattleLog] = useState<BattleLog | null>(null);
  const [pvpOpponent, setPvpOpponent] = useState<AgentWithDimensions | null>(null);
  const [pvpAttacker, setPvpAttacker] = useState<AgentWithDimensions | null>(null);
  const [pvpPhase, setPvpPhase] = useState<"select" | "battle">("select");
  const [pvpPlaybackDone, setPvpPlaybackDone] = useState(false);
  const [pvpMyStats, setPvpMyStats] = useState<PvpStats | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setResetTimer(getTimeUntilMidnight()), 1000);
    return () => clearInterval(interval);
  }, []);

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

      const pvpCounts: Record<string, number> = {};
      for (const agent of agents) {
        pvpCounts[agent.id] = await getPvpFightsToday(agent.id);
      }
      setPvpFightsToday(pvpCounts);
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

    // Check both agents still have fights remaining
    const atkRemaining = MAX_FIGHTS_PER_DAY - (fightsToday[atk.id] ?? 0);
    const defRemaining = MAX_FIGHTS_PER_DAY - (fightsToday[def.id] ?? 0);
    if (atkRemaining <= 0 || defRemaining <= 0) return;

    // Immediately increment fight counts so UI stays in sync
    setFightsToday((prev) => ({
      ...prev,
      [atk.id]: (prev[atk.id] ?? 0) + 1,
      [def.id]: (prev[def.id] ?? 0) + 1,
    }));

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

  async function startPvpBattle() {
    if (!pvpSelected || !publicKey) return;
    setPvpLoading(true);
    setPvpError(null);
    try {
      const res = await fetch("/api/pvp/battle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: pvpSelected,
          walletAddress: publicKey.toBase58(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "fight_limit_reached") {
          setPvpError("Your agent has used all 3 PvP fights today.");
        } else if (data.error === "no_opponent") {
          setPvpError("No opponents available yet. Check back soon!");
        } else {
          setPvpError("Something went wrong. Please try again.");
        }
        return;
      }
      setPvpBattleLog(data.battleLog);
      setPvpOpponent(data.opponentAgent);
      setPvpAttacker(data.attackerAgent);
      setPvpFightsToday((prev) => ({
        ...prev,
        [pvpSelected]: (prev[pvpSelected] ?? 0) + 1,
      }));
      const updatedStats = await getPvpStatsForAgents([pvpSelected]);
      setPvpMyStats(updatedStats[pvpSelected] ?? null);
      setPvpPhase("battle");
    } catch {
      setPvpError("Network error. Please try again.");
    } finally {
      setPvpLoading(false);
    }
  }

  function resetPvp() {
    setPvpPhase("select");
    setPvpSelected(null);
    setPvpBattleLog(null);
    setPvpOpponent(null);
    setPvpAttacker(null);
    setPvpMyStats(null);
    setPvpPlaybackDone(false);
    setPvpError(null);
  }

  async function handleRecharge(agentId: string) {
    if (!publicKey || !connected || !player || recharging) return;
    setRecharging(agentId);
    try {
      const tx = await createPaymentTransaction(connection, publicKey, RECHARGE_COST_SOL);
      const signature = await sendTransaction(tx, connection);
      const confirmed = await confirmTransaction(connection, signature);
      if (!confirmed) {
        setRecharging(null);
        return;
      }
      await rechargeAgentFights(agentId);
      setFightsToday((prev) => ({ ...prev, [agentId]: 0 }));
    } catch {
      // user cancelled or error
    }
    setRecharging(null);
  }

  if (loading || !player) return null;

  function renderGrowth(growth: Record<number, number>, agentName: string) {
    const entries = Object.entries(growth);
    if (entries.length === 0) return null;
    return (
      <div className="bg-gray-900 border border-gray-800 rounded px-3 py-2 flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-gray-400 shrink-0">{agentName}:</span>
        {entries.map(([dimIdStr, delta]) => {
          const dimId = Number(dimIdStr);
          const dim = DIMENSIONS.find((d) => d.id === dimId);
          const name = dim?.name ?? `Dim ${dimId}`;
          return (
            <span
              key={dimId}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-green-900/50 text-green-400 border border-green-800"
            >
              +{delta.toFixed(1)} {name}
            </span>
          );
        })}
      </div>
    );
  }

  // --------------------------------------------------
  // PvP Battle Phase
  // --------------------------------------------------
  if (pvpPhase === "battle" && pvpBattleLog && pvpOpponent && pvpAttacker) {
    const myAgentId = pvpBattleLog.attackerId;
    const didWin = pvpBattleLog.winnerId === myAgentId;

    return (
      <main className="min-h-screen bg-gray-950 text-white p-4 pb-32 max-w-2xl mx-auto">
        <h1 className="text-xl font-mono font-bold mb-1 text-center">PvP Battle</h1>
        <p className="font-mono text-xs text-center text-gray-500 mb-3">
          vs {pvpOpponent.name} ({pvpOpponent.role})
        </p>

        <BattlePlayback
          battleLog={pvpBattleLog}
          attacker={pvpAttacker}
          defender={pvpOpponent}
          onComplete={() => setPvpPlaybackDone(true)}
        />

        {pvpPlaybackDone && (
          <div className="mt-3 space-y-3">
            <div className={`text-center py-3 rounded-lg font-mono font-bold text-lg ${
              didWin
                ? "bg-green-900/30 border border-green-700/40 text-green-400"
                : "bg-red-900/20 border border-red-800/30 text-red-400"
            }`}>
              {didWin ? "Victory! ⚔" : "Defeat"}
            </div>

            {pvpMyStats && (
              <p className="text-center font-mono text-xs text-gray-400">
                Your record: <span className="text-green-400">{pvpMyStats.wins}W</span>
                {" - "}
                <span className="text-red-400">{pvpMyStats.losses}L</span>
              </p>
            )}

            {renderGrowth(pvpBattleLog.attackerGrowth, pvpAttacker.name)}
            {renderGrowth(pvpBattleLog.defenderGrowth, pvpOpponent.name)}

            <div className="flex items-center justify-center gap-4 pt-2">
              <button
                onClick={resetPvp}
                className="px-5 py-2 bg-red-700 hover:bg-red-600 text-white font-mono text-sm rounded transition-colors"
              >
                Fight Again
              </button>
              <Link href="/agents" className="text-sm text-gray-500 font-mono hover:text-gray-400">
                Back to Agents
              </Link>
            </div>
          </div>
        )}
      </main>
    );
  }

  // --------------------------------------------------
  // Phase 1: Select Agents
  // --------------------------------------------------
  if (phase === "select") {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-6 pb-32 max-w-2xl mx-auto">
        <h1 className="text-2xl font-mono font-bold mb-2 text-center">
          Battle Arena
        </h1>

        {/* PvP Section */}
        <div className="mb-8 bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-3xl">⚔</span>
            <h2 className="text-xl font-mono font-bold text-red-400">PvP Battle</h2>
            <span className="text-3xl">⚔</span>
          </div>
          <p className="font-mono text-xs text-gray-500 text-center mb-4">
            Select an agent — we'll find a random opponent from another player
          </p>

          {pvpError && (
            <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-700/30 rounded text-red-400 font-mono text-xs text-center">
              {pvpError}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mb-4">
            {allAgentsFull.map((agent) => {
              const pvpFights = pvpFightsToday[agent.id] ?? 0;
              const pvpRemaining = Math.max(0, MAX_PVP_FIGHTS - pvpFights);
              const disabled = pvpRemaining <= 0;
              const isSelected = pvpSelected === agent.id;
              return (
                <div
                  key={agent.id}
                  onClick={() => {
                    if (disabled) return;
                    setPvpSelected(isSelected ? null : agent.id);
                  }}
                  className={`border rounded-lg p-3 text-center transition-all duration-200 relative ${
                    disabled
                      ? "border-gray-800 bg-gray-900/50 opacity-60 cursor-not-allowed"
                      : isSelected
                      ? "border-red-500 bg-red-900/20 ring-1 ring-red-500/50 scale-[1.03] cursor-pointer"
                      : "border-gray-700 bg-gray-900 hover:border-gray-500 cursor-pointer"
                  }`}
                >
                  <div className="flex justify-center mb-1.5">
                    <PixelSprite
                      spriteSeed={agent.spriteSeed as Record<string, number>}
                      role={agent.role}
                      size={52}
                    />
                  </div>
                  <p className="font-mono text-xs font-bold text-white truncate">{agent.name}</p>
                  <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded font-mono ${ROLE_BADGE[agent.role]}`}>
                    {agent.role}
                  </span>
                  <p className={`font-mono text-[10px] mt-1 ${disabled ? "text-red-400" : "text-gray-500"}`}>
                    PvP: {pvpRemaining}/{MAX_PVP_FIGHTS}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center">
            <button
              onClick={startPvpBattle}
              disabled={!pvpSelected || pvpLoading}
              className="px-6 py-2.5 bg-gradient-to-r from-red-700 to-red-500 hover:from-red-600 hover:to-red-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono font-bold text-sm rounded-lg transition-all"
            >
              {pvpLoading ? "Searching..." : "Find Opponent ⚔"}
            </button>
          </div>
        </div>

        {/* My Agent Training Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">🏋</span>
            <div className="flex-1">
              <h2 className="text-lg font-mono font-bold text-white">My Agent Training</h2>
              <p className="font-mono text-xs text-gray-500">Select 2 agents to spar</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-mono text-[10px] text-gray-600">Resets in</p>
              <p className="font-mono text-sm text-yellow-400">{resetTimer}</p>
            </div>
            {selected.length === 2 && (
              <button
                onClick={startBattle}
                className="px-5 py-2 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-mono font-bold text-sm rounded-lg transition-all animate-pulseGlow"
              >
                Fight!
              </button>
            )}
          </div>
          <div className="mb-4 px-3 py-2 bg-yellow-500/5 border border-yellow-600/20 rounded-lg flex items-center gap-2">
            <span className="text-yellow-400 text-sm">⚡</span>
            <p className="font-mono text-[10px] text-yellow-400/80">
              {MAX_FIGHTS_PER_DAY} fights per day per agent — Pay {RECHARGE_COST_SOL} SOL to recharge fights instantly
            </p>
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
                const remaining = Math.max(0, MAX_FIGHTS_PER_DAY - fights);
                const disabled = remaining <= 0;
                const totalHp = getTotalHp(agent);
                const isSelected = selected.includes(agent.id);
                const selIndex = selected.indexOf(agent.id);
                const canSelect = isSelected || selected.length < 2;

                return (
                  <div
                    key={agent.id}
                    onClick={() => {
                      if (disabled || (!canSelect && !isSelected)) return;
                      toggleAgent(agent.id);
                    }}
                    className={`border rounded-lg p-3 text-center transition-all duration-200 relative ${
                      disabled
                        ? "border-gray-800 bg-gray-900/50 opacity-60"
                        : isSelected
                        ? "border-purple-500 bg-purple-900/30 ring-1 ring-purple-500/50 scale-[1.03] cursor-pointer"
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
                    {disabled && connected && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRecharge(agent.id);
                        }}
                        disabled={recharging === agent.id}
                        className="mt-1.5 w-full text-[9px] px-2 py-1 rounded border border-yellow-600/40 bg-yellow-500/10 text-yellow-400 font-mono font-bold hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
                      >
                        {recharging === agent.id ? "Paying..." : `Recharge ${RECHARGE_COST_SOL} SOL`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

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
    return (
      <main className="min-h-screen bg-gray-950 text-white p-4 pb-32 max-w-2xl mx-auto">
        <h1 className="text-xl font-mono font-bold mb-3 text-center">
          Battle Arena
        </h1>

        <BattlePlayback
          battleLog={battleLog}
          attacker={attackerFull}
          defender={defenderFull}
          onComplete={handlePlaybackComplete}
        />

        {playbackDone && (
          <div className="mt-3 space-y-2 animate-fadeIn">
            {renderGrowth(battleLog.attackerGrowth, attackerFull.name)}
            {renderGrowth(battleLog.defenderGrowth, defenderFull.name)}

            <div className="flex items-center justify-center gap-4 pt-2">
              <button
                onClick={resetBattle}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-mono text-sm rounded transition-colors"
              >
                Fight Again
              </button>
              <Link
                href="/agents"
                className="text-sm text-gray-500 font-mono hover:text-gray-400"
              >
                Back to Agents
              </Link>
            </div>
          </div>
        )}
      </main>
    );
  }

  return null;
}
