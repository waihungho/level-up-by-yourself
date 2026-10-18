"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { announceGemBalance, postJson } from "@/lib/shop-client";
import type { PassReward, PassTrack } from "@/lib/pass/rewards";
import { PassTierList } from "./PassTierList";
import { PremiumUnlock, type PassMessage } from "./PremiumUnlock";

export interface PassView {
  season: number;
  endsAt: string;
  xp: number;
  tier: number;
  tiers: number;
  xpPerTier: number;
  premium: boolean;
  premiumPriceSol: number;
  claimed: string[];
  streak: number;
  checkedInToday: boolean;
}

interface SeasonPassProps {
  walletAddress: string;
  pay: (sol: number, memo: string) => Promise<string>;
  retryDelayMs?: number;
}

const PASS_ERRORS: Record<string, string> = {
  already_claimed: "Already claimed.",
  tier_locked: "Reach that tier first.",
  premium_required: "Unlock Premium to claim premium rewards.",
  grant_failed: "Some rewards couldn't be delivered. Try again.",
  not_owner: "Connect the wallet that owns this account.",
  network: "Network error. Please try again.",
};

function timeLeft(endsAt: string): string {
  const ms = Math.max(0, Date.parse(endsAt) - Date.now());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${d}d ${h}h ${m}m`;
}

function claimedText(claimed: { reward: PassReward }[]): string {
  const gems = claimed.reduce((s, c) => s + c.reward.gems, 0);
  const tickets = claimed.reduce((s, c) => s + c.reward.tickets, 0);
  const parts = [`+${gems} gems`];
  if (tickets) parts.push(`+${tickets} Raid Ticket${tickets > 1 ? "s" : ""} (today)`);
  if (claimed.some((c) => c.reward.title)) parts.push("new title");
  return parts.join(", ");
}

export function SeasonPass({ walletAddress, pay, retryDelayMs }: SeasonPassProps) {
  const [view, setView] = useState<PassView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<PassMessage | null>(null);
  const [countdown, setCountdown] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pass?wallet=${encodeURIComponent(walletAddress)}`);
      if (!res.ok) throw new Error(String(res.status));
      setView((await res.json()) as PassView);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [walletAddress]);

  useEffect(() => {
    load();
  }, [load]);

  const endsAt = view?.endsAt;
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setCountdown(timeLeft(endsAt));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [endsAt]);

  const claimed = useMemo(() => new Set(view?.claimed ?? []), [view?.claimed]);
  const claimable = useMemo(() => {
    if (!view) return 0;
    let n = 0;
    for (let t = 1; t <= view.tier; t++) {
      if (!claimed.has(`${t}:free`)) n++;
      if (view.premium && !claimed.has(`${t}:premium`)) n++;
    }
    return n;
  }, [view, claimed]);

  async function claim(body: { tier?: number; track?: PassTrack; all?: boolean }) {
    setBusy(true);
    setMessage(null);
    try {
      // Claims are idempotent server-side (409 on a repeat), so a retried request can't pay out twice.
      const { data } = await postJson("/api/pass/claim", { walletAddress, ...body });
      const got = (data.claimed as ({ tier: number; track: PassTrack; reward: PassReward })[] | undefined) ?? [];
      if (typeof data.balance === "number") announceGemBalance(data.balance);
      if (got.length) {
        setView((v) => (v ? { ...v, claimed: [...v.claimed, ...got.map((c) => `${c.tier}:${c.track}`)] } : v));
      }
      if (data.error) {
        setMessage({ ok: false, text: PASS_ERRORS[data.error as string] ?? "Something went wrong. Please try again." });
        await load();
      } else {
        setMessage({ ok: true, text: got.length ? claimedText(got) : "Nothing to claim yet." });
      }
    } catch {
      setMessage({ ok: false, text: PASS_ERRORS.network });
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    setBusy(true);
    setMessage(null);
    try {
      const { ok, data } = await postJson("/api/pass/checkin", { walletAddress });
      if (!ok) throw new Error(String(data.error));
      const awarded = Number(data.awarded ?? 0);
      setMessage({ ok: true, text: awarded > 0 ? `+${awarded} XP · ${data.streak}-day streak` : "Already checked in today." });
      await load();
    } catch {
      setMessage({ ok: false, text: PASS_ERRORS.network });
    } finally {
      setBusy(false);
    }
  }

  if (!view) {
    return (
      <p className="text-center font-mono text-sm text-gray-500 py-12">
        {loadError ? (
          <>
            Couldn&apos;t load the pass.{" "}
            <button type="button" onClick={load} className="underline min-h-[44px]">
              Retry
            </button>
          </>
        ) : (
          "Loading the pass…"
        )}
      </p>
    );
  }

  const maxed = view.tier >= view.tiers;
  const intoTier = maxed ? view.xpPerTier : view.xp - view.tier * view.xpPerTier;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-mono font-bold">Season {view.season}</h1>
        <span className="font-mono text-xs text-gray-400">Ends in {countdown}</span>
      </div>

      <section className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
        <div className="flex items-baseline justify-between font-mono">
          <span className="text-lg font-black text-cyan-300">
            Tier {view.tier}
            <span className="text-xs font-normal text-gray-500"> / {view.tiers}</span>
          </span>
          <span className="text-xs text-gray-400">{view.xp.toLocaleString()} XP</span>
        </div>
        <div
          role="progressbar"
          aria-label={maxed ? "Pass complete" : `XP toward tier ${view.tier + 1}`}
          aria-valuemin={0}
          aria-valuemax={view.xpPerTier}
          aria-valuenow={intoTier}
          className="h-3 rounded-full bg-gray-800 overflow-hidden"
        >
          <div className="h-full bg-gradient-to-r from-cyan-600 to-emerald-400" style={{ width: `${(intoTier / view.xpPerTier) * 100}%` }} />
        </div>
        <p className="font-mono text-[11px] text-gray-500">
          {maxed ? "Pass complete!" : `${view.xpPerTier - intoTier} XP to tier ${view.tier + 1}`} · Fights, raids, squads and daily check-ins give XP.
        </p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="font-mono text-sm text-orange-300">🔥 {view.streak}-day streak</span>
          {view.checkedInToday ? (
            <span className="font-mono text-[11px] text-emerald-400">✓ Checked in today</span>
          ) : (
            <button
              type="button"
              onClick={checkIn}
              disabled={busy}
              className="min-h-[44px] px-4 rounded-lg bg-orange-600 hover:bg-orange-500 font-mono text-sm font-bold disabled:opacity-50"
            >
              Check in
            </button>
          )}
        </div>
      </section>

      {message && (
        <div role="status" className={`font-mono text-xs ${message.ok ? "text-emerald-300" : "text-red-300"}`}>
          {message.text}
          {message.signature && <code className="block mt-1 break-all select-all text-[10px] text-gray-300">{message.signature}</code>}
        </div>
      )}

      <button
        type="button"
        onClick={() => claim({ all: true })}
        disabled={busy || claimable === 0}
        className="w-full min-h-[48px] rounded-lg bg-gradient-to-r from-emerald-700 to-cyan-600 font-mono text-sm font-black disabled:opacity-40"
      >
        {busy ? "Working…" : claimable > 0 ? `Claim all (${claimable})` : "Nothing to claim yet"}
      </button>

      {!view.premium && <PremiumUnlock walletAddress={walletAddress} season={view.season} pay={pay} onUnlocked={load} onMessage={setMessage} retryDelayMs={retryDelayMs} />}

      <PassTierList
        season={view.season}
        tiers={view.tiers}
        reached={view.tier}
        premium={view.premium}
        claimed={claimed}
        busy={busy}
        onClaim={(tier, track) => claim({ tier, track })}
      />
    </div>
  );
}
