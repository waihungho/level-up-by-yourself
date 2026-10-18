"use client";
import { useEffect, useRef } from "react";
import { DIMENSIONS } from "@/lib/constants";
import type { ExpeditionReward } from "@/lib/expeditions/catalog";
import { XP } from "@/lib/pass/season";

interface RewardRevealProps {
  agentName: string;
  reward: ExpeditionReward;
  onClose: () => void;
}

const dimName = (id: number) => DIMENSIONS.find((d) => d.id === id)?.name ?? `Stat ${id}`;

/** Dialog shown after a claim, listing what the agent brought back. */
export function RewardReveal({ agentName, reward, onClose }: RewardRevealProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="expedition-reveal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-gray-900 border border-amber-600 rounded-xl p-5 w-full max-w-sm text-center animate-fadeIn">
        <p className="font-mono text-4xl" aria-hidden="true">
          🎒
        </p>
        <h2 id="expedition-reveal-title" className="font-mono font-bold text-white text-base mt-2">
          {agentName} is back!
        </h2>
        <ul className="mt-3 space-y-1.5 font-mono text-sm">
          {Object.entries(reward.growth).map(([dim, value]) => (
            <li key={dim} className="text-emerald-300">
              +{value} {dimName(Number(dim))}
            </li>
          ))}
          <li className="text-purple-200">💎 +{reward.gems} gems</li>
          {reward.ticket && <li className="text-amber-300 font-bold">🎟 Raid Ticket (+1 raid attempt today)</li>}
          <li className="text-sky-300 text-xs">+{XP.expedition} Season Pass XP</li>
        </ul>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mt-4 w-full min-h-[44px] rounded bg-amber-600 hover:bg-amber-500 font-mono text-sm font-bold text-white"
        >
          Nice!
        </button>
      </div>
    </div>
  );
}
