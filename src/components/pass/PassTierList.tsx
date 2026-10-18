"use client";
import { useState } from "react";
import { claimKey, PASS_TRACKS, passTitleId, rewardFor, type PassReward, type PassTrack } from "@/lib/pass/rewards";
import { titleLabel } from "@/lib/shop/catalog";

function rewardText(reward: PassReward, season: number): string {
  const parts = [`${reward.gems} gems`];
  if (reward.tickets) parts.push(`${reward.tickets} Raid Ticket (use today)`);
  if (reward.title) parts.push(`${titleLabel(passTitleId(season))} title`);
  return parts.join(" + ");
}

interface PassTierListProps {
  season: number;
  tiers: number;
  reached: number;
  premium: boolean;
  claimed: ReadonlySet<string>;
  /** Claiming the season title would replace the player's current title. */
  titleWouldReplace: boolean;
  currentTitle: string | null;
  busy: boolean;
  onClaim: (tier: number, track: PassTrack) => void;
}

export function PassTierList({ season, tiers, reached, premium, claimed, titleWouldReplace, currentTitle, busy, onClaim }: PassTierListProps) {
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <section aria-label="Tiers">
      <div className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 px-1 mb-1 font-mono text-[10px] uppercase tracking-wide text-gray-500">
        <span>Tier</span>
        <span>Free</span>
        <span className="text-amber-300/80">Premium</span>
      </div>
      <ol className="space-y-1.5">
        {Array.from({ length: tiers }, (_, i) => i + 1).map((tier) => {
          const isReached = tier <= reached;
          return (
            <li
              key={tier}
              aria-label={`Tier ${tier}`}
              className={`grid grid-cols-[2.5rem_1fr_1fr] gap-2 items-stretch rounded-lg p-1 ${
                tier === reached + 1 ? "bg-cyan-950/40 ring-1 ring-cyan-700/60" : ""
              }`}
            >
              <span className={`self-center text-center font-mono text-sm font-black ${isReached ? "text-white" : "text-gray-600"}`}>{tier}</span>
              {PASS_TRACKS.map((track) => {
                const key = claimKey(tier, track);
                const reward = rewardFor(tier, track);
                const text = rewardText(reward, season);
                const base = "min-h-[44px] rounded-md px-2 py-1.5 font-mono text-[11px] leading-tight text-left";
                if (claimed.has(key)) {
                  return (
                    <div key={track} className={`${base} border border-gray-800 bg-gray-900/60 text-gray-500`}>
                      <span className="block">✓ Claimed</span>
                      <span className="block text-[10px] line-through">{text}</span>
                    </div>
                  );
                }
                const owned = track === "free" || premium;
                if (isReached && owned && confirming === key) {
                  return (
                    <div key={track} className={`${base} border border-amber-500/70 bg-gray-900 text-amber-100 space-y-1`}>
                      <span className="block">This replaces your current title ({currentTitle ? titleLabel(currentTitle) : "none"}).</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setConfirming(null);
                          onClaim(tier, track);
                        }}
                        className="w-full min-h-[44px] rounded bg-amber-600 font-bold text-gray-950 disabled:opacity-50"
                      >
                        Replace title and claim
                      </button>
                      <button type="button" onClick={() => setConfirming(null)} className="w-full min-h-[44px] rounded border border-gray-700 text-gray-300">
                        Cancel
                      </button>
                    </div>
                  );
                }
                if (isReached && owned) {
                  return (
                    <button
                      key={track}
                      type="button"
                      disabled={busy}
                      onClick={() => (reward.title && titleWouldReplace ? setConfirming(key) : onClaim(tier, track))}
                      aria-label={`Claim tier ${tier} ${track} reward: ${text}`}
                      className={`${base} font-bold text-white disabled:opacity-50 ${
                        track === "premium"
                          ? "border border-amber-500/70 bg-gradient-to-br from-amber-700/60 to-gray-900"
                          : "border border-emerald-600/70 bg-gradient-to-br from-emerald-800/60 to-gray-900"
                      }`}
                    >
                      <span className="block">Claim</span>
                      <span className="block text-[10px] font-normal text-gray-200">{text}</span>
                    </button>
                  );
                }
                return (
                  <div
                    key={track}
                    className={`${base} border border-gray-800 ${track === "premium" ? "bg-amber-950/20 text-amber-200/50" : "bg-gray-900 text-gray-500"} ${
                      tier % 5 === 0 ? "font-bold" : ""
                    }`}
                  >
                    <span className="block">{owned ? "🔒" : "🔒 Premium"}</span>
                    <span className="block text-[10px]">{text}</span>
                  </div>
                );
              })}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
