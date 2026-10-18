"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXPEDITION_DURATIONS, EXPEDITION_REWARDS, MAX_ACTIVE, type ExpeditionDuration } from "@/lib/expeditions/catalog";
import { announceGemBalance, postJson } from "@/lib/shop-client";
import { ExpeditionAgentList } from "./ExpeditionAgentList";
import { ExpeditionSlot } from "./ExpeditionSlot";
import { RewardReveal } from "./RewardReveal";
import type { ExpeditionAgent, ExpeditionGrant, ExpeditionItem, ExpeditionsView } from "./types";

const ERRORS: Record<string, string> = {
  expedition_limit: `All ${MAX_ACTIVE} slots are in use. Claim one first.`,
  not_ready: "Not back yet.",
  not_owner: "That agent isn't yours.",
  not_found: "That expedition no longer exists.",
  invalid_duration: "Pick 4h, 8h or 12h.",
  network: "Network error. Please try again.",
};
const GENERIC_ERROR = "Something went wrong. Please try again.";

interface ExpeditionsBoardProps {
  walletAddress: string;
  /** Called when a claim changed stats or gems (or another tab already claimed), so the caller can refresh them. */
  onRewardsChanged?: () => void;
  retryDelayMs?: number;
}

export function ExpeditionsBoard({ walletAddress, onRewardsChanged, retryDelayMs }: ExpeditionsBoardProps) {
  const [view, setView] = useState<ExpeditionsView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [claimingIds, setClaimingIds] = useState<ReadonlySet<string>>(new Set());
  const [reveal, setReveal] = useState<{ agentName: string; granted: ExpeditionGrant } | null>(null);
  /** Server clock minus device clock, so countdowns match the server's "ready" check. */
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const slotsHeadingRef = useRef<HTMLHeadingElement>(null);

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
  const maxActive = view?.maxActive ?? MAX_ACTIVE;
  const slotsFull = expeditions.length >= maxActive;

  async function start(agent: ExpeditionAgent, duration: ExpeditionDuration) {
    setStarting(true);
    setError(null);
    try {
      const res = await postJson("/api/expeditions/start", { walletAddress, agentId: agent.id, duration }, retryDelayMs);
      // agent_away after a lost response means our own retried start already went through: the refresh shows it.
      if (!res.ok && res.data.error !== "agent_away") setError(ERRORS[res.data.error as string] ?? GENERIC_ERROR);
    } catch {
      setError(ERRORS.network);
    }
    await refresh();
    setStarting(false);
  }

  async function claim(expedition: ExpeditionItem) {
    setClaimingIds((s) => new Set(s).add(expedition.id));
    setError(null);
    try {
      const res = await postJson("/api/expeditions/claim", { walletAddress, expeditionId: expedition.id }, retryDelayMs);
      if (res.ok) {
        if (typeof res.data.balance === "number") announceGemBalance(res.data.balance);
        setReveal({ agentName: agentsById.get(expedition.agentId)?.name ?? "Your agent", granted: res.data.granted as ExpeditionGrant });
        onRewardsChanged?.();
      } else if (res.data.error === "already_claimed") {
        // Claimed by a retried request or another tab: rewards are in, just resync gems and stats.
        onRewardsChanged?.();
      } else {
        setError(ERRORS[res.data.error as string] ?? GENERIC_ERROR);
      }
    } catch {
      setError(ERRORS.network);
    }
    await refresh();
    setClaimingIds((s) => {
      const next = new Set(s);
      next.delete(expedition.id);
      return next;
    });
  }

  const closeReveal = useCallback(() => {
    setReveal(null);
    slotsHeadingRef.current?.focus();
  }, []);

  if (!view) {
    return loadError ? (
      <div className="text-center py-12 space-y-3" role="alert">
        <p className="font-mono text-sm text-gray-400">Couldn&apos;t load expeditions.</p>
        <button type="button" onClick={refresh} className="min-h-[44px] px-5 rounded bg-gray-800 hover:bg-gray-700 font-mono text-sm text-white">
          Retry
        </button>
      </div>
    ) : (
      <p className="text-center font-mono text-sm text-gray-500 py-12" role="status">
        Loading expeditions…
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
          <h2 id="exp-slots" ref={slotsHeadingRef} tabIndex={-1} className="font-mono text-sm font-bold text-gray-200 outline-none">
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
              claiming={!!e && claimingIds.has(e.id)}
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
        <p className="font-mono text-[10px] text-gray-500 mb-2">
          Stats grow in the agent&apos;s role category. A Raid Ticket is +1 raid attempt on the day you claim it. Agents can still fight while away.
        </p>
        <ExpeditionAgentList agents={view.agents} awayIds={awayIds} slotsFull={slotsFull} busy={starting} onStart={start} />
      </section>

      {reveal && <RewardReveal agentName={reveal.agentName} granted={reveal.granted} onClose={closeReveal} />}
    </div>
  );
}
