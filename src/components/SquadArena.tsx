"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PixelSprite } from "@/components/PixelSprite";
import { SquadBattle, type SquadResult } from "@/components/SquadBattle";
import { synergyLabel } from "@/components/tactical/synergyLabel";
import { GENERIC_START_ERROR, NETWORK_ERROR, postStart } from "@/lib/battle-client";
import { DIMENSIONS } from "@/lib/constants";
import type { SquadStats } from "@/lib/squads-read";
import type { Synergy, SquadState } from "@/lib/tactical/squad";
import type { AgentWithDimensions } from "@/lib/types";

interface SquadView {
  squad: AgentWithDimensions[] | null;
  saved: string[] | null;
  synergy: Synergy | null;
  stats: SquadStats;
  battlesToday: number;
  maxBattles: number;
}

interface LiveSquadBattle {
  sessionId: string;
  state: SquadState;
  attackers: AgentWithDimensions[];
  defenders: AgentWithDimensions[];
}

const START_ERRORS: Record<string, string> = {
  no_squad: "You need at least 3 agents to form a squad.",
  squad_limit_reached: "You've used both squad battles today.",
  no_opponent: "No rival squads available yet. Check back soon!",
  network: NETWORK_ERROR,
};

function dimName(id: string) {
  return DIMENSIONS.find((d) => d.id === Number(id))?.name ?? `Dim ${id}`;
}

export function SquadArena({ walletAddress, onAgentsChanged }: { walletAddress: string; onAgentsChanged: () => void }) {
  const [view, setView] = useState<SquadView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveSquadBattle | null>(null);
  const [result, setResult] = useState<SquadResult | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/squad?wallet=${encodeURIComponent(walletAddress)}`);
      if (!res.ok) throw new Error(String(res.status));
      setView(await res.json());
    } catch {
      setError("Couldn't load your squad.");
    }
  }, [walletAddress]);

  useEffect(() => {
    load();
  }, [load]);

  async function start() {
    setStarting(true);
    setError(null);
    const result = await postStart<LiveSquadBattle>({ mode: "squad_pvp", walletAddress });
    setStarting(false);
    if (!result.ok) {
      setError(START_ERRORS[result.error] ?? GENERIC_START_ERROR);
      return;
    }
    setResult(null);
    setLive(result.data);
  }

  const handleFinished = useCallback(
    (r: SquadResult) => {
      setResult(r);
      onAgentsChanged();
    },
    [onAgentsChanged]
  );

  if (live) {
    const won = result?.winner === "attacker";
    const growth = (result?.growth as { attacker?: Record<string, Record<string, number>> } | undefined)?.attacker ?? {};
    return (
      <div className="space-y-3">
        <SquadBattle
          sessionId={live.sessionId}
          initialState={live.state}
          attackers={live.attackers}
          defenders={live.defenders}
          walletAddress={walletAddress}
          onFinished={handleFinished}
        />
        {result && (
          <div className="space-y-2 animate-fadeIn">
            <div className={`text-center py-3 rounded-lg font-mono font-bold text-lg ${won ? "bg-green-900/30 text-green-400" : "bg-red-900/20 text-red-400"}`}>
              {won ? "Squad Victory! ⚔" : "Squad Defeat"}
              {typeof result.ratingDelta === "number" && (
                <span className="block text-xs font-normal mt-1">
                  Rating {won ? "+" : "−"}
                  {result.ratingDelta}
                </span>
              )}
            </div>
            {Object.entries(growth).map(([agentId, g]) => {
              const agent = live.attackers.find((a) => a.id === agentId);
              return (
                <div key={agentId} className="bg-gray-900 border border-gray-800 rounded px-3 py-2 flex flex-wrap gap-1.5 items-center">
                  <span className="font-mono text-xs text-gray-400">{agent?.name}:</span>
                  {Object.entries(g).map(([dim, delta]) => (
                    <span key={dim} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-green-900/50 text-green-400 border border-green-800">
                      +{Number(delta).toFixed(1)} {dimName(dim)}
                    </span>
                  ))}
                </div>
              );
            })}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => {
                  setLive(null);
                  setResult(null);
                  load();
                }}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-mono text-sm rounded min-h-[44px]"
              >
                Back to Squad Arena
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const remaining = view ? Math.max(0, view.maxBattles - view.battlesToday) : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-mono font-bold text-emerald-400">Squad Battle 3v3</h2>
        <p className="font-mono text-xs text-gray-500 mt-1">Your 3 agents vs a rival squad near your rating. Swap with ⇄, tag in with 3 Focus.</p>
      </div>

      {error && <div className="px-3 py-2 bg-red-500/10 border border-red-700/30 rounded text-red-400 font-mono text-xs text-center">{error}</div>}

      {!view ? (
        <p className="text-center font-mono text-xs text-gray-500">Loading squad…</p>
      ) : !view.squad ? (
        <div className="text-center space-y-2">
          <p className="font-mono text-sm text-gray-400">You need at least 3 agents to form a squad.</p>
          <Link href="/summon" className="text-purple-400 font-mono text-sm">
            Summon more agents →
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {view.squad.map((a, i) => (
              <div key={a.id} className="border border-gray-700 rounded-lg p-2 text-center">
                <p className="font-mono text-[9px] text-gray-500">{["Lead", "Second", "Anchor"][i]}</p>
                <div className="flex justify-center">
                  <PixelSprite spriteSeed={a.spriteSeed as Record<string, number>} role={a.role} size={44} />
                </div>
                <p className="font-mono text-xs text-white truncate">{a.name}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-between font-mono text-xs">
            <span className="text-emerald-300">{view.synergy ? synergyLabel(view.synergy) : ""}</span>
            <span className="text-gray-400">
              Rating {view.stats.rating} · {view.stats.wins}W-{view.stats.losses}L
            </span>
          </div>
          {!view.saved && <p className="font-mono text-[10px] text-gray-500 text-center">Auto-picked your strongest 3. Customize it in the squad builder.</p>}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={start}
              disabled={starting || remaining <= 0}
              className="px-6 py-2.5 min-h-[44px] bg-gradient-to-r from-emerald-700 to-emerald-500 disabled:opacity-40 text-white font-mono font-bold text-sm rounded-lg"
            >
              {starting ? "Finding rival…" : `Squad Battle ⚔ (${remaining}/${view.maxBattles} today)`}
            </button>
            <Link href="/squad" className="font-mono text-xs text-gray-400 underline">
              Edit squad
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
