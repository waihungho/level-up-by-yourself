"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { announceGemBalance } from "@/lib/shop-client";
import { inClaimAll, replacesTitle, unclaimed, type PassClaimBody, type PassReward, type PassTrack, type PassViewBody } from "@/lib/pass/rewards";
import { PassTierList } from "./PassTierList";
import { PremiumUnlock, type PassMessage } from "./PremiumUnlock";

interface SeasonPassProps {
  walletAddress: string;
  pay: (sol: number, memo: string) => Promise<string>;
  retryDelayMs?: number;
}

const PASS_ERRORS: Record<string, string> = {
  tier_locked: "Reach that tier first.",
  premium_required: "Unlock Premium to claim premium rewards.",
  not_owner: "Connect the wallet that owns this account.",
  network: "Network error. Please try again.",
};

const DAY_MS = 86_400_000;

function formatLeft(ms: number): string {
  const left = Math.max(0, ms);
  const d = Math.floor(left / DAY_MS);
  const h = Math.floor((left % DAY_MS) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return `${d}d ${h}h ${m}m`;
}

function claimedText(claimed: { reward: PassReward }[]): string {
  const gems = claimed.reduce((s, c) => s + c.reward.gems, 0);
  const tickets = claimed.reduce((s, c) => s + c.reward.tickets, 0);
  const parts = [`+${gems} gems`];
  if (tickets) parts.push(`+${tickets} Raid Ticket${tickets > 1 ? "s" : ""} (use today)`);
  if (claimed.some((c) => c.reward.title)) parts.push("new title");
  return parts.join(", ");
}

async function postPass<T>(url: string, body: unknown): Promise<{ ok: boolean; data: Partial<T> & { error?: string } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data: Partial<T> & { error?: string } = await res.json();
  return { ok: res.ok, data };
}

export function SeasonPass({ walletAddress, pay, retryDelayMs }: SeasonPassProps) {
  const [view, setView] = useState<PassViewBody | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<PassMessage | null>(null);
  const [msLeft, setMsLeft] = useState<number | null>(null);
  // Only the latest request may update the view, so a slow response for a previous wallet can't overwrite it.
  const latest = useRef(0);
  const reloadedAtEnd = useRef<string | null>(null);

  const load = useCallback(async () => {
    const id = ++latest.current;
    try {
      const res = await fetch(`/api/pass?wallet=${encodeURIComponent(walletAddress)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data: PassViewBody = await res.json();
      if (id !== latest.current) return;
      setView(data);
      setLoadError(false);
    } catch {
      if (id === latest.current) setLoadError(true);
    }
  }, [walletAddress]);

  useEffect(() => {
    load();
  }, [load]);

  // Countdown; when the season ends, reload once to move to the new season.
  const endsAt = view?.endsAt;
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => {
      const left = Date.parse(endsAt) - Date.now();
      setMsLeft(left);
      if (left <= 0 && reloadedAtEnd.current !== endsAt) {
        reloadedAtEnd.current = endsAt;
        load();
      }
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [endsAt, load]);

  const claimed = useMemo(() => new Set(view?.claimed ?? []), [view?.claimed]);
  const pending = useMemo(() => (view ? unclaimed(view.tier, view.premium, claimed) : []), [view, claimed]);
  const titleWouldReplace = view ? replacesTitle(view.title, view.season) : false;
  const claimAllCount = pending.filter((c) => inClaimAll(c, titleWouldReplace)).length;

  async function claim(body: { tier?: number; track?: PassTrack; all?: boolean }) {
    setBusy(true);
    setMessage(null);
    try {
      const { ok, data } = await postPass<PassClaimBody>("/api/pass/claim", { walletAddress, ...body });
      if (typeof data.balance === "number") announceGemBalance(data.balance);
      if (ok) {
        const got = data.claimed ?? [];
        setMessage({ ok: true, text: got.length ? claimedText(got) : "Nothing to claim yet." });
      } else if (data.error !== "already_claimed") {
        // already_claimed: an earlier (retried) request got it; the reload below shows it.
        setMessage({ ok: false, text: PASS_ERRORS[data.error ?? ""] ?? "Something went wrong. Please try again." });
      }
    } catch {
      setMessage({ ok: false, text: PASS_ERRORS.network });
    } finally {
      await load();
      setBusy(false);
    }
  }

  async function checkIn() {
    setBusy(true);
    setMessage(null);
    try {
      const { ok, data } = await postPass<{ awarded: number; streak: number }>("/api/pass/checkin", { walletAddress });
      if (!ok) throw new Error(data.error);
      const awarded = data.awarded ?? 0;
      setMessage({ ok: true, text: awarded > 0 ? `+${awarded} XP · ${data.streak}-day streak` : "Already checked in today." });
    } catch {
      setMessage({ ok: false, text: PASS_ERRORS.network });
    } finally {
      await load();
      setBusy(false);
    }
  }

  const status = (
    <div role="status" aria-live="polite" className={`font-mono text-xs ${message?.ok ? "text-emerald-300" : "text-red-300"}`}>
      {message && (
        <>
          {message.text}
          {message.signature && <code className="block mt-1 break-all select-all text-[10px] text-gray-300">{message.signature}</code>}
        </>
      )}
    </div>
  );

  if (!view) {
    return (
      <div className="space-y-2">
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
        {status}
      </div>
    );
  }

  const maxed = view.tier >= view.tiers;
  const intoTier = maxed ? view.xpPerTier : view.xp - view.tier * view.xpPerTier;
  const urgent = pending.length > 0 && msLeft !== null && msLeft < DAY_MS;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-2xl font-mono font-bold">Season {view.season}</h1>
          <span className="font-mono text-xs text-gray-400">Ends in {msLeft === null ? "…" : formatLeft(msLeft)}</span>
        </div>
        <p className={`font-mono text-[11px] ${urgent ? "text-amber-300 font-bold" : "text-gray-500"}`}>
          {urgent && "⚠ "}Unclaimed rewards expire when the season ends.
        </p>
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

      {status}

      <div className="space-y-1">
        <button
          type="button"
          onClick={() => claim({ all: true })}
          disabled={busy || claimAllCount === 0}
          className="w-full min-h-[48px] rounded-lg bg-gradient-to-r from-emerald-700 to-cyan-600 font-mono text-sm font-black disabled:opacity-40"
        >
          {busy ? "Working…" : claimAllCount > 0 ? `Claim all (${claimAllCount})` : "Nothing to claim yet"}
        </button>
        {pending.length > claimAllCount && (
          <p className="font-mono text-[10px] text-gray-500">Raid Ticket tiers (use them the same day) and a title swap are claimed one by one below.</p>
        )}
      </div>

      {!view.premium && <PremiumUnlock walletAddress={walletAddress} season={view.season} pay={pay} onUnlocked={load} onMessage={setMessage} retryDelayMs={retryDelayMs} />}

      <PassTierList
        season={view.season}
        tiers={view.tiers}
        reached={view.tier}
        premium={view.premium}
        claimed={claimed}
        titleWouldReplace={titleWouldReplace}
        currentTitle={view.title}
        busy={busy}
        onClaim={(tier, track) => claim({ tier, track })}
      />
    </div>
  );
}
