"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EXPEDITION_DURATIONS, EXPEDITION_REWARDS, type ExpeditionDuration, type ExpeditionReward } from "@/lib/expeditions/catalog";
import { announceGemBalance, postJson } from "@/lib/shop-client";
import { ExpeditionAgentList } from "./ExpeditionAgentList";
import { ExpeditionSlot } from "./ExpeditionSlot";
import { RewardReveal } from "./RewardReveal";
import type { ExpeditionAgent, ExpeditionItem, ExpeditionsView } from "./types";

const ERRORS: Record<string, string> = {
  agent_away: "That agent is already on an expedition.",
  expedition_limit: "All 3 slots are in use. Claim one first.",
  not_ready: "Not back yet.",
  already_claimed: "That loot was already claimed.",
  not_owner: "That agent isn't yours.",
  invalid_duration: "Pick 4h, 8h or 12h.",
  network: "Network error. Please try again.",
};
const GENERIC_ERROR = "Something went wrong. Please try again.";

interface ExpeditionsBoardProps {
  walletAddress: string;
  /** Called after a claim (stats changed) so the caller can refresh agents. */
  onClaimed?: () => void;
}

export function ExpeditionsBoard({ walletAddress, onClaimed }: ExpeditionsBoardProps) {
  const [view, setView] = useState<ExpeditionsView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ agentName: string; reward: ExpeditionReward } | null>(null);
  /** Server clock minus device clock, so countdowns match the server's "ready" check. */
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/expeditions?wallet=${encodeURIComponent(walletAddress)}`);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = (await res.json()) as ExpeditionsView;
      setOffset(Date.parse(data.serverNow) - Date.now());
      setNow(Date.now());
      setView(data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [walletAddress]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    refresh();
  }, [refresh]);

  const expeditions = useMemo(() => view?.expeditions ?? [], [view]);
  const serverNow = now + offset;
  const anyRunning = expeditions.some((e) => Date.parse(e.endsAt) > serverNow);

  // One ticking clock for every countdown; it stops once nothing is running.
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyRunning]);

  const agentsById = useMemo(() => new Map((view?.agents ?? []).map((a) => [a.id, a])), [view]);
  const awayIds = useMemo(() => new Set(expeditions.map((e) => e.agentId)), [expeditions]);
  const maxActive = view?.maxActive ?? 3;
  const slotsFull = expeditions.length >= maxActive;

  async function start(agent: ExpeditionAgent, duration: ExpeditionDuration) {
    setStarting(true);
    setError(null);
    try {
      const res = await postJson("/api/expeditions/start", { walletAddress, agentId: agent.id, duration });
      if (!res.ok) setError(ERRORS[res.data.error as string] ?? GENERIC_ERROR);
    } catch {
      setError(ERRORS.network);
    }
    await refresh();
    setStarting(false);
  }

  async function claim(expedition: ExpeditionItem) {
    setClaimingId(expedition.id);
    setError(null);
    try {
      const res = await postJson("/api/expeditions/claim", { walletAddress, expeditionId: expedition.id });
      if (res.ok) {
        const reward = res.data.reward as ExpeditionReward;
        if (typeof res.data.balance === "number") announceGemBalance(res.data.balance);
        setReveal({ agentName: agentsById.get(expedition.agentId)?.name ?? "Your agent", reward });
        onClaimed?.();
      } else if (res.data.error !== "already_claimed") {
        setError(ERRORS[res.data.error as string] ?? GENERIC_ERROR);
      }
    } catch {
      setError(ERRORS.network);
    }
    await refresh();
    setClaimingId(null);
  }

  const closeReveal = useCallback(() => setReveal(null), []);

  if (!view) {
    return (
      <p className="text-center font-mono text-sm text-gray-500 py-12" role="status">
        {loadError ? "Couldn't load expeditions. Pull to refresh or try again later." : "Loading expeditions…"}
      </p>
    );
  }

  const slots = Array.from({ length: maxActive }, (_, i) => expeditions[i] ?? null);

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="px-3 py-2 rounded font-mono text-xs border border-red-700 bg-red-900/20 text-red-300">
          {error}
        </div>
      )}

      <section aria-labelledby="exp-slots">
        <div className="flex items-baseline justify-between mb-2">
          <h2 id="exp-slots" className="font-mono text-sm font-bold text-gray-200">
            Away
          </h2>
          <span className="font-mono text-[10px] text-gray-500">
            {expeditions.length}/{maxActive} slots
          </span>
        </div>
        <ul className="space-y-2">
          {slots.map((e, i) => (
            <ExpeditionSlot
              key={e?.id ?? `empty-${i}`}
              index={i}
              expedition={e}
              agent={e ? agentsById.get(e.agentId) : undefined}
              now={serverNow}
              claiming={claimingId === e?.id}
              onClaim={claim}
            />
          ))}
        </ul>
      </section>

      <section aria-labelledby="exp-agents">
        <h2 id="exp-agents" className="font-mono text-sm font-bold text-gray-200 mb-1">
          Send an agent
        </h2>
        <ul className="grid grid-cols-3 gap-1.5 mb-1" aria-label="Rewards by duration">
          {EXPEDITION_DURATIONS.map((h) => {
            const r = EXPEDITION_REWARDS[h];
            return (
              <li key={h} className="border border-gray-800 rounded px-2 py-1.5 font-mono text-[10px] text-gray-400 leading-tight">
                <span className="block text-xs font-bold text-white">{h}h</span>+{r.growth} stats · 💎 {r.gems}
                {r.ticketChance > 0 && <span className="block text-amber-300">{Math.round(r.ticketChance * 100)}% 🎟 ticket</span>}
              </li>
            );
          })}
        </ul>
        <p className="font-mono text-[10px] text-gray-500 mb-2">Stats grow in the agent&apos;s role category. Agents can still fight while away.</p>
        <ExpeditionAgentList agents={view.agents} awayIds={awayIds} slotsFull={slotsFull} busy={starting} onStart={start} />
      </section>

      {reveal && <RewardReveal agentName={reveal.agentName} reward={reveal.reward} onClose={closeReveal} />}
    </div>
  );
}
