"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { BossStage } from "@/components/BossStage";
import { SquadBattle, type SquadResult } from "@/components/SquadBattle";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { useRaidLive } from "@/hooks/useRaidLive";
import { GENERIC_START_ERROR, NETWORK_ERROR, postStart } from "@/lib/battle-client";
import { titleLabel } from "@/lib/shop/catalog";
import type { RaidState } from "@/lib/raid/raid-engine";
import type { AgentWithDimensions } from "@/lib/types";

interface LiveAttempt {
  sessionId: string;
  state: RaidState;
  attackers: AgentWithDimensions[];
  defenders: AgentWithDimensions[];
}

const START_ERRORS: Record<string, string> = {
  no_active_boss: "The boss has left. A new one arrives Monday 00:00 UTC.",
  raid_limit_reached: "You've used all 3 raid attempts today.",
  no_agents: "Summon an agent to join the raid.",
  network: NETWORK_ERROR,
};

function untilNextMonday(now: Date): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  next.setUTCDate(next.getUTCDate() + ((8 - next.getUTCDay()) % 7 || 7));
  const ms = next.getTime() - now.getTime();
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${d}d ${h}h ${m}m`;
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function RaidPage() {
  const { player, loading, refreshAgents } = useGame();
  const { publicKey } = useUnifiedWallet();
  const router = useRouter();
  const wallet = publicKey?.toBase58() ?? null;
  const { view, error: liveError, refresh } = useRaidLive(wallet);
  const [attempt, setAttempt] = useState<LiveAttempt | null>(null);
  const [result, setResult] = useState<SquadResult | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (!loading && !player) router.push("/");
  }, [loading, player, router]);

  useEffect(() => {
    const tick = () => setCountdown(untilNextMonday(new Date()));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  const handleFinished = useCallback(
    (r: SquadResult) => {
      setResult(r);
      refresh();
      refreshAgents();
    },
    [refresh, refreshAgents]
  );

  async function attack() {
    if (!wallet) return;
    setStarting(true);
    setStartError(null);
    const res = await postStart<LiveAttempt>({ mode: "raid", walletAddress: wallet });
    setStarting(false);
    if (!res.ok) {
      setStartError(START_ERRORS[res.error] ?? GENERIC_START_ERROR);
      return;
    }
    setResult(null);
    setAttempt(res.data);
  }

  if (loading || !player) return null;
  if (!wallet) {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-6 pb-32 max-w-2xl mx-auto text-center">
        <p className="font-mono text-4xl mt-12">🐉</p>
        <p className="font-mono text-sm text-gray-300 mt-3">Connect your wallet to join the raid.</p>
      </main>
    );
  }

  if (attempt) {
    const damage = (result?.damage as number | undefined) ?? 0;
    return (
      <main className="min-h-screen bg-gray-950 text-white p-4 pb-32 max-w-2xl mx-auto">
        <h1 className="text-xl font-mono font-bold mb-3 text-center">Raid: {attempt.defenders[0]?.name}</h1>
        <SquadBattle
          sessionId={attempt.sessionId}
          initialState={attempt.state}
          attackers={attempt.attackers}
          defenders={attempt.defenders}
          walletAddress={wallet}
          onFinished={handleFinished}
        />
        {result && (
          <div className="mt-4 space-y-3 animate-fadeIn text-center">
            {result.killed ? (
              <p className="font-mono text-3xl font-black text-yellow-400 animate-vsSlam">BOSS SLAIN!</p>
            ) : (
              <p className="font-mono text-lg font-bold text-red-300">Attempt over</p>
            )}
            <p className="font-mono text-sm text-gray-300">
              You dealt <span className="text-white font-bold">{damage.toLocaleString()}</span> damage
              {attempt.state.raid.solo && <span className="text-gray-500"> (solo ×1.5)</span>}
            </p>
            {view?.myRank && <p className="font-mono text-xs text-gray-400">Your rank this week: #{view.myRank}</p>}
            <button
              type="button"
              onClick={() => {
                setAttempt(null);
                setResult(null);
              }}
              className="px-5 py-2 min-h-[44px] bg-red-700 hover:bg-red-600 text-white font-mono text-sm rounded"
            >
              Back to the raid
            </button>
          </div>
        )}
      </main>
    );
  }

  const boss = view?.boss ?? null;
  const def = view?.def ?? null;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 pb-32 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-mono font-bold">World Boss</h1>
        {boss?.status === "active" && <span className="font-mono text-xs text-gray-400">Leaves in {countdown}</span>}
      </div>

      {liveError && <p className="font-mono text-xs text-yellow-400 text-center">{liveError}</p>}

      {!view ? (
        <p className="text-center font-mono text-sm text-gray-500 py-12">Summoning the boss…</p>
      ) : !boss || !def ? (
        <div className="text-center py-12 space-y-2">
          <p className="font-mono text-4xl">🐉</p>
          <p className="font-mono text-sm text-gray-300">The next boss arrives soon.</p>
          <p className="font-mono text-xs text-gray-500">New bosses spawn every Monday 00:00 UTC.</p>
        </div>
      ) : (
        <>
          <BossStage def={def} boss={boss} phase={view.phase ?? 1} weakness={view.weakness ?? def.weak} />

          {boss.status === "active" ? (
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={attack}
                disabled={starting || (view.attemptsLeft ?? 0) <= 0}
                className="px-8 py-3 min-h-[48px] bg-gradient-to-r from-red-700 to-orange-500 hover:from-red-600 hover:to-orange-400 disabled:opacity-40 text-white font-mono font-black text-base rounded-lg"
              >
                {starting ? "Charging…" : `ATTACK ⚔ (${view.attemptsLeft ?? 0}/${view.maxAttempts ?? 3} today)`}
              </button>
              <p className="font-mono text-[10px] text-gray-500">10 rounds per attempt · Guard the ULTIMATE · strike the weakness</p>
              {startError && <p className="font-mono text-xs text-red-400">{startError}</p>}
            </div>
          ) : (
            <p className="text-center font-mono text-sm text-gray-400">
              {boss.status === "defeated" ? "Defeated! Rewards have been paid." : "This boss escaped."} Next boss in {countdown}.
            </p>
          )}

          <section className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex justify-between items-baseline mb-2">
              <h2 className="font-mono font-bold text-sm">Top damage</h2>
              <span className="font-mono text-[10px] text-gray-500">{view.participants ?? 0} raiders</span>
            </div>
            {view.contributions?.length ? (
              <ol className="space-y-1">
                {view.contributions.map((c) => (
                  <li key={c.playerId} className={`flex justify-between font-mono text-xs px-2 py-1 rounded ${c.isMe ? "bg-purple-900/30 text-white" : "text-gray-300"}`}>
                    <span>
                      <span className="text-gray-500 mr-2">#{c.rank}</span>
                      {c.label || "Raider"}
                      {view.titles?.[c.playerId] && (
                        <span className="ml-1 px-1 rounded text-[9px] bg-yellow-900/40 text-yellow-300 border border-yellow-700/50">
                          {titleLabel(view.titles[c.playerId])}
                        </span>
                      )}
                      {c.isMe && <span className="ml-1 text-purple-300">(you)</span>}
                    </span>
                    <span>{c.damage.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="font-mono text-xs text-gray-500">No hits yet. Strike first!</p>
            )}
            {view.myRank && view.myRank > 20 && (
              <p className="font-mono text-xs text-purple-300 mt-2">
                You: #{view.myRank} · {view.myDamage?.toLocaleString()}
              </p>
            )}
          </section>

          <section className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h2 className="font-mono font-bold text-sm mb-2">Live feed</h2>
            {view.recentHits?.length ? (
              <ul className="space-y-1" aria-live="polite">
                {view.recentHits.map((h) => (
                  <li key={h.id} className="font-mono text-[11px] text-gray-400 animate-fadeIn">
                    <span className="text-white">{h.label || "A raider"}</span>&apos;s squad hit for{" "}
                    <span className="text-red-300 font-bold">{h.damage.toLocaleString()}</span>
                    {h.counters > 0 && <span className="text-yellow-300"> · {h.counters} counters</span>}
                    <span className="text-gray-600"> · {timeAgo(h.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-mono text-xs text-gray-500">Quiet… for now.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
