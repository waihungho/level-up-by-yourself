"use client";
import { useEffect, useRef } from "react";
import { DIMENSIONS } from "@/lib/constants";
import { XP } from "@/lib/pass/season";
import type { ExpeditionGrant } from "./types";

interface RewardRevealProps {
  agentName: string;
  granted: ExpeditionGrant;
  /** Called once the dialog has closed (button, Escape or backdrop). */
  onClose: () => void;
}

const dimName = (id: number) => DIMENSIONS.find((d) => d.id === id)?.name ?? `Stat ${id}`;

/** Modal shown after a claim, listing only what was actually granted. */
export function RewardReveal({ agentName, granted, onClose }: RewardRevealProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Native modal: focus trap, Escape and inert background. Older WebViews fall back to a plain open dialog.
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
    };
  }, []);

  const growth = Object.entries(granted.growth);

  return (
    <dialog
      ref={ref}
      aria-labelledby="expedition-reveal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-sm bg-gray-900 text-white border border-amber-600 rounded-xl p-5 text-center backdrop:bg-black/80"
    >
      <p className="font-mono text-4xl" aria-hidden="true">
        🎒
      </p>
      <h2 id="expedition-reveal-title" className="font-mono font-bold text-white text-base mt-2">
        {agentName} is back!
      </h2>
      <ul className="mt-3 space-y-1.5 font-mono text-sm">
        {growth.map(([dim, value]) => (
          <li key={dim} className="text-emerald-300">
            +{value} {dimName(Number(dim))}
          </li>
        ))}
        {granted.gems > 0 && <li className="text-purple-200">💎 +{granted.gems} gems</li>}
        {granted.ticket && <li className="text-amber-300 font-bold">🎟 Raid Ticket: +1 raid attempt today</li>}
        {granted.xp && <li className="text-sky-300 text-xs">+{XP.expedition} Season Pass XP</li>}
      </ul>
      <button
        type="button"
        autoFocus
        onClick={onClose}
        className="mt-4 w-full min-h-[44px] rounded bg-amber-600 hover:bg-amber-500 font-mono text-sm font-bold text-white"
      >
        Nice!
      </button>
    </dialog>
  );
}
