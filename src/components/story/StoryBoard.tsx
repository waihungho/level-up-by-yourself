"use client";
import { useCallback, useEffect, useState } from "react";
import { TacticalBattle } from "@/components/TacticalBattle";
import { DIMENSIONS } from "@/lib/constants";
import { GENERIC_START_ERROR, NETWORK_ERROR, postStart } from "@/lib/battle-client";
import { announceGemBalance } from "@/lib/shop-client";
import type { StageEnemy, StageReward } from "@/lib/story/catalog";
import type { TacticalState } from "@/lib/tactical/types";
import type { AgentWithDimensions } from "@/lib/types";

type StageStatus = "cleared" | "open" | "locked";
interface StageItem {
  id: string;
  title: string;
  intro: string;
  enemy: StageEnemy;
  reward: StageReward;
  status: StageStatus;
}
interface StoryView {
  chapters: { id: string; title: string; blurb: string; stages: StageItem[] }[];
  events: { id: string; name: string; tagline: string; emoji: string; theme: string; endsAt: string; stages: StageItem[] }[];
  nextEvent: { name: string; emoji: string; startsAt: string };
  clearedCount: number;
  totalStages: number;
  agents: { id: string; name: string; roleTitle: string }[];
}
interface Fight {
  sessionId: string;
  state: TacticalState;
  attacker: AgentWithDimensions;
  defender: AgentWithDimensions;
  stage: StageItem;
}
interface StoryResult {
  won: boolean;
  firstClear: boolean;
  gems?: number;
  growth?: Record<string, number>;
  balance?: number;
}

const START_ERRORS: Record<string, string> = {
  stage_locked: "That stage is locked. Clear the one before it first.",
  not_owner: "Pick one of your own agents.",
  network: NETWORK_ERROR,
};

function daysLeft(iso: string): string {
  const days = Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
  return days <= 1 ? "ends today" : `${days} days left`;
}

function StageRow({ stage, busy, onFight }: { stage: StageItem; busy: boolean; onFight: (s: StageItem) => void }) {
  const locked = stage.status === "locked";
  return (
    <li className={`border rounded p-3 space-y-1 ${locked ? "border-gray-800 opacity-50" : "border-gray-700"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold text-white">
            {stage.status === "cleared" ? "✓ " : locked ? "🔒 " : ""}
            {stage.title}
          </p>
          <p className="font-mono text-[11px] text-gray-400">{stage.intro}</p>
          <p className="font-mono text-[11px] text-gray-500">
            vs {stage.enemy.name} · {stage.enemy.roleTitle} · power {stage.enemy.power}
          </p>
        </div>
        <button
          className="shrink-0 px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 font-mono text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={busy || locked}
          onClick={() => onFight(stage)}
          aria-label={`Fight ${stage.title}`}
        >
          {stage.status === "cleared" ? "Replay" : "Fight"}
        </button>
      </div>
      {stage.status !== "cleared" && (
        <p className="font-mono text-[11px] text-amber-300">
          First clear: 💎 {stage.reward.gems} · +{stage.reward.growth} stats
        </p>
      )}
    </li>
  );
}

export function StoryBoard({ walletAddress, onRewards }: { walletAddress: string; onRewards?: () => void }) {
  const [view, setView] = useState<StoryView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fight, setFight] = useState<Fight | null>(null);
  const [result, setResult] = useState<StoryResult | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/story?wallet=${encodeURIComponent(walletAddress)}`);
      if (!res.ok) return setLoadError(true);
      const data = (await res.json()) as StoryView;
      setView(data);
      setAgentId((cur) => (cur && data.agents.some((a) => a.id === cur) ? cur : (data.agents[0]?.id ?? null)));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [walletAddress]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    refresh();
  }, [refresh]);

  const start = async (stage: StageItem) => {
    if (!agentId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const r = await postStart<Omit<Fight, "stage">>({ mode: "story", walletAddress, agentId, stageId: stage.id });
    setBusy(false);
    if (!r.ok) return setError(START_ERRORS[r.error] ?? GENERIC_START_ERROR);
    setFight({ ...r.data, stage });
  };

  const onFinished = useCallback(async () => {
    if (!fight) return;
    try {
      const res = await fetch(`/api/battle/session/${fight.sessionId}?wallet=${encodeURIComponent(walletAddress)}`);
      const data = await res.json();
      const story = (data.result?.story ?? null) as StoryResult | null;
      setResult(story ?? { won: false, firstClear: false });
      if (story?.firstClear) {
        if (typeof story.balance === "number") announceGemBalance(story.balance);
        onRewards?.();
      }
    } catch {
      setResult(null);
    }
    refresh();
  }, [fight, walletAddress, refresh, onRewards]);

  if (fight) {
    return (
      <div className="space-y-3">
        <p className="font-mono text-xs text-gray-400">{fight.stage.title}</p>
        <TacticalBattle sessionId={fight.sessionId} initialState={fight.state} attacker={fight.attacker} defender={fight.defender} walletAddress={walletAddress} onFinished={onFinished} />
        {result && (
          <div className={`rounded p-3 text-center font-mono ${result.won ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"}`} role="status">
            <p className="font-bold text-lg">{result.won ? "Stage cleared!" : "Defeated. Grow stronger and try again."}</p>
            {result.firstClear && (
              <p className="text-xs mt-1">
                💎 +{result.gems} ·{" "}
                {Object.entries(result.growth ?? {})
                  .map(([id, v]) => `${DIMENSIONS.find((d) => d.id === Number(id))?.name} +${v}`)
                  .join(", ")}
              </p>
            )}
            {result.won && !result.firstClear && <p className="text-xs mt-1">Replay: no rewards, just glory.</p>}
          </div>
        )}
        {result && (
          <button className="w-full py-2 rounded bg-gray-800 hover:bg-gray-700 font-mono text-sm" onClick={() => setFight(null)}>
            ← Back to the campaign
          </button>
        )}
      </div>
    );
  }

  if (loadError && !view) {
    return (
      <p className="font-mono text-sm text-red-400">
        Couldn&apos;t load the campaign.{" "}
        <button className="underline" onClick={refresh}>
          Retry
        </button>
      </p>
    );
  }
  if (!view) return <p className="font-mono text-sm text-gray-500">Loading…</p>;
  if (!view.agents.length) return <p className="font-mono text-sm text-gray-400">Summon an agent to start the campaign.</p>;

  return (
    <div className="space-y-5">
      <label className="flex items-center gap-2 font-mono text-xs text-gray-400">
        Fighter
        <select value={agentId ?? ""} onChange={(e) => setAgentId(e.target.value)} className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white">
          {view.agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.roleTitle})
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="font-mono text-xs text-red-400" role="alert">
          {error}
        </p>
      )}

      {view.events.map((e) => (
        <section key={e.id} className={`border rounded-lg p-4 space-y-3 ${e.theme}`} aria-labelledby={`ev-${e.id}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 id={`ev-${e.id}`} className="font-mono font-bold">
              {e.emoji} {e.name}
            </h2>
            <span className="font-mono text-[11px]">{daysLeft(e.endsAt)}</span>
          </div>
          <p className="font-mono text-xs">{e.tagline}</p>
          <ul className="space-y-2">
            {e.stages.map((s) => (
              <StageRow key={s.id} stage={s} busy={busy} onFight={start} />
            ))}
          </ul>
        </section>
      ))}
      {!view.events.length && (
        <p className="font-mono text-xs text-gray-500">
          Next event: {view.nextEvent.emoji} {view.nextEvent.name} on {view.nextEvent.startsAt.slice(0, 10)}
        </p>
      )}

      <p className="font-mono text-xs text-gray-400">
        Campaign progress: {view.clearedCount} / {view.totalStages} stages
      </p>
      {view.chapters.map((c) => (
        <section key={c.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3" aria-labelledby={`ch-${c.id}`}>
          <h2 id={`ch-${c.id}`} className="font-mono font-bold text-white">
            {c.title}
          </h2>
          <p className="font-mono text-[11px] text-gray-400">{c.blurb}</p>
          <ul className="space-y-2">
            {c.stages.map((s) => (
              <StageRow key={s.id} stage={s} busy={busy} onFight={start} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
