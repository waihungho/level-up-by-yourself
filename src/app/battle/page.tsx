"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { PixelSprite } from "@/components/PixelSprite";
import { TacticalBattle } from "@/components/TacticalBattle";
import { SquadArena } from "@/components/SquadArena";
import {
  getAgentWithDimensions,
  getAgentFightsToday,
  getPvpFightsToday,
  getPvpStatsForAgents,
} from "@/lib/db";
import { createPaymentTransaction, confirmTransaction } from "@/lib/sol-payment";
import { DIMENSIONS, RECHARGE_COST_SOL } from "@/lib/constants";
import { MASTERY_MAX, MASTERY_PER_COUNTER } from "@/lib/tactical/constants";
import type { TacticalState } from "@/lib/tactical/types";
import type { AgentWithDimensions, BattleLog, PvpStats } from "@/lib/types";
import Link from "next/link";

const MAX_FIGHTS_PER_DAY = 3;
const MAX_PVP_FIGHTS = 3;
const RECHARGE_VERIFY_ATTEMPTS = 4;

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

interface TacticalSession {
  sessionId: string;
  state: TacticalState;
  attacker: AgentWithDimensions;
  defender: AgentWithDimensions;
}

async function postStart(body: Record<string, unknown>): Promise<{ ok: true; session: TacticalSession } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/battle/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? "internal" };
    return { ok: true, session: data as TacticalSession };
  } catch {
    return { ok: false, error: "network" };
  }
}

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
  const [arena, setArena] = useState<"duel" | "squad">("duel");
  const [recharging, setRecharging] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [allAgentsFull, setAllAgentsFull] = useState<AgentWithDimensions[]>([]);
  const [fightsToday, setFightsToday] = useState<Record<string, number>>({});
  const [battleLog, setBattleLog] = useState<BattleLog | null>(null);
  const [tactical, setTactical] = useState<TacticalSession | null>(null);
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [resetTimer, setResetTimer] = useState(getTimeUntilMidnight());

  // PvP state
  const [pvpSelected, setPvpSelected] = useState<string | null>(null);
  const [pvpFightsToday, setPvpFightsToday] = useState<Record<string, number>>({});
  const [pvpLoading, setPvpLoading] = useState(false);
  const [pvpError, setPvpError] = useState<string | null>(null);
  const [pvpBattleLog, setPvpBattleLog] = useState<BattleLog | null>(null);
  const [pvpTactical, setPvpTactical] = useState<TacticalSession | null>(null);
  const [pvpPhase, setPvpPhase] = useState<"select" | "battle">("select");
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
    if (selected.length !== 2 || !publicKey || starting) return;
    const [atkId, defId] = selected;
    if ((fightsToday[atkId] ?? 0) >= MAX_FIGHTS_PER_DAY || (fightsToday[defId] ?? 0) >= MAX_FIGHTS_PER_DAY) return;

    setStarting(true);
    setTrainingError(null);
    const result = await postStart({ mode: "training", agentId: atkId, opponentAgentId: defId, walletAddress: publicKey.toBase58() });
    setStarting(false);
    if (!result.ok) {
      setTrainingError(
        result.error === "fight_limit_reached"
          ? "One of these agents has no fights left today."
          : result.error === "network"
          ? "Network error. Please try again."
          : "Something went wrong. Please try again."
      );
      return;
    }
    setFightsToday((prev) => ({
      ...prev,
      [atkId]: (prev[atkId] ?? 0) + 1,
      [defId]: (prev[defId] ?? 0) + 1,
    }));
    setBattleLog(null);
    setTactical(result.session);
    setPhase("battle");
  }

  const handleTrainingFinished = useCallback(
    (log: BattleLog) => {
      setBattleLog(log);
      refreshAgents();
    },
    [refreshAgents]
  );

  function resetBattle() {
    setPhase("select");
    setSelected([]);
    setTactical(null);
    setBattleLog(null);
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
    const selectedId = pvpSelected;
    if (!selectedId || !publicKey) return;
    setPvpLoading(true);
    setPvpError(null);
    const result = await postStart({ mode: "pvp", agentId: selectedId, walletAddress: publicKey.toBase58() });
    setPvpLoading(false);
    if (!result.ok) {
      setPvpError(
        result.error === "fight_limit_reached"
          ? "Your agent has used all 3 PvP fights today."
          : result.error === "no_opponent"
          ? "No opponents available yet. Check back soon!"
          : result.error === "network"
          ? "Network error. Please try again."
          : "Something went wrong. Please try again."
      );
      setPvpSelected(null);
      return;
    }
    setPvpTactical(result.session);
    setPvpBattleLog(null);
    setPvpFightsToday((prev) => ({
      ...prev,
      [selectedId]: (prev[selectedId] ?? 0) + 1,
    }));
    setPvpPhase("battle");
  }

  const handlePvpFinished = useCallback(async (log: BattleLog) => {
    setPvpBattleLog(log);
    const updatedStats = await getPvpStatsForAgents([log.attackerId]);
    setPvpMyStats(updatedStats[log.attackerId] ?? null);
  }, []);

  function resetPvp() {
    setPvpPhase("select");
    setPvpSelected(null);
    setPvpBattleLog(null);
    setPvpTactical(null);
    setPvpMyStats(null);
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
      // The server verifies the payment on-chain; retry briefly while the RPC indexes the new transaction.
      let ok = false;
      for (let attempt = 0; attempt < RECHARGE_VERIFY_ATTEMPTS && !ok; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));
        const res = await fetch("/api/battle/recharge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: publicKey.toBase58(), agentId, signature }),
        });
        ok = res.ok || res.status === 409; // 409: this payment was already credited
      }
      if (ok) {
        setTrainingError(null);
        setFightsToday((prev) => ({ ...prev, [agentId]: 0 }));
        getAgentFightsToday(agentId).then((n) => setFightsToday((prev) => ({ ...prev, [agentId]: n })));
      } else {
        setTrainingError(`Payment sent but not verified yet. Keep this signature for support: ${signature.slice(0, 16)}…`);
      }
    } catch {
      // user cancelled or error
    }
    setRecharging(null);
  }

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

  function renderMastery(log: BattleLog) {
    if (!log.manualActions) return null;
    const counters = log.rounds.filter((r) => r.countered && r.manual).length;
    if (counters === 0) return null;
    const pct = Math.round((Math.min(1 + MASTERY_PER_COUNTER * counters, MASTERY_MAX) - 1) * 100);
    return (
      <p className="text-center font-mono text-xs text-yellow-300">
        Counters: {counters} → +{pct}% growth
      </p>
    );
  }

  if (loading || !player) return null;

  // --------------------------------------------------
  // PvP Battle Phase
  // --------------------------------------------------
  if (pvpPhase === "battle" && pvpTactical && publicKey && phase === "select") {
    const pvpOpponent = pvpTactical.defender;
    const pvpAttacker = pvpTactical.attacker;
    const didWin = pvpBattleLog?.winnerId === pvpAttacker.id;

    return (
      <main className="min-h-screen bg-gray-950 text-white p-4 pb-32 max-w-2xl mx-auto">
        <h1 className="text-xl font-mono font-bold mb-1 text-center">PvP Battle</h1>
        <p className="font-mono text-xs text-center text-gray-500 mb-3">
          vs {pvpOpponent.name} ({pvpOpponent.role})
        </p>

        <TacticalBattle
          sessionId={pvpTactical.sessionId}
          initialState={pvpTactical.state}
          attacker={pvpAttacker}
          defender={pvpOpponent}
          walletAddress={publicKey.toBase58()}
          onFinished={handlePvpFinished}
        />

        {pvpBattleLog && (
          <div className="mt-3 space-y-3">
            <div className={`text-center py-3 rounded-lg font-mono font-bold text-lg ${
              didWin
                ? "bg-green-900/30 border border-green-700/40 text-green-400"
                : "bg-red-900/20 border border-red-800/30 text-red-400"
            }`}>
              {didWin ? "Victory! ⚔" : "Defeat"}
            </div>

            {/* Opponent identity */}
            <p className="text-center font-mono text-xs text-gray-400">
              vs <span className="text-white font-bold">{pvpOpponent.name}</span>
              <span className={`ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-mono ${ROLE_BADGE[pvpOpponent.role]}`}>
                {pvpOpponent.role}
              </span>
            </p>

            <p className="text-center font-mono text-xs text-gray-400">
              Your record:{" "}
              {pvpMyStats ? (
                <>
                  <span className="text-green-400">{pvpMyStats.wins}W</span>
                  {" / "}
                  <span className="text-red-400">{pvpMyStats.losses}L</span>
                </>
              ) : (
                <span className="text-gray-600">—</span>
              )}
            </p>

            {renderMastery(pvpBattleLog)}
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

        <div className="flex justify-center gap-2 mb-6" role="tablist">
          {(["duel", "squad"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={arena === tab}
              onClick={() => setArena(tab)}
              className={`px-5 py-2 min-h-[44px] rounded-lg font-mono text-sm font-bold border ${
                arena === tab ? "border-purple-500 bg-purple-900/30 text-white" : "border-gray-700 text-gray-400"
              }`}
            >
              {tab === "duel" ? "⚔ Duel" : "⛨ Squad 3v3"}
            </button>
          ))}
        </div>

        {arena === "squad" && publicKey ? (
          <SquadArena walletAddress={publicKey.toBase58()} onAgentsChanged={refreshAgents} />
        ) : (
        <>
        {/* PvP Section */}
        <div className="mb-8 bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-3xl">⚔</span>
            <h2 className="text-xl font-mono font-bold text-red-400">PvP Battle</h2>
            <span className="text-3xl">⚔</span>
          </div>
          <p className="font-mono text-xs text-gray-500 text-center mb-4">
            Select an agent — we&apos;ll find a random opponent from another player
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
              disabled={!pvpSelected || pvpLoading || (pvpFightsToday[pvpSelected ?? ""] ?? 0) >= MAX_PVP_FIGHTS}
              className="px-6 py-2.5 bg-gradient-to-r from-red-700 to-red-500 hover:from-red-600 hover:to-red-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono font-bold text-sm rounded-lg transition-all"
            >
              {pvpLoading ? "Searching..." : "Find Opponent and Fight ⚔"}
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
                disabled={starting}
                className="px-5 py-2 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-mono font-bold text-sm rounded-lg transition-all animate-pulseGlow"
              >
                Fight!
              </button>
            )}
          </div>
          {trainingError && (
            <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-700/30 rounded text-red-400 font-mono text-xs text-center">
              {trainingError}
            </div>
          )}
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
        </>
        )}
      </main>
    );
  }

  // --------------------------------------------------
  // Phase 3: Battle Playback & Results
  // --------------------------------------------------
  if (phase === "battle" && tactical && publicKey) {
    const attackerFull = tactical.attacker;
    const defenderFull = tactical.defender;
    return (
      <main className="min-h-screen bg-gray-950 text-white p-4 pb-32 max-w-2xl mx-auto">
        <h1 className="text-xl font-mono font-bold mb-3 text-center">
          Battle Arena
        </h1>

        <TacticalBattle
          sessionId={tactical.sessionId}
          initialState={tactical.state}
          attacker={attackerFull}
          defender={defenderFull}
          walletAddress={publicKey.toBase58()}
          onFinished={handleTrainingFinished}
        />

        {battleLog && (
          <div className="mt-3 space-y-2 animate-fadeIn">
            <div className="text-center font-mono font-bold text-lg text-green-400">
              {battleLog.winnerId === attackerFull.id ? attackerFull.name : defenderFull.name} wins!
            </div>
            {renderMastery(battleLog)}
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
