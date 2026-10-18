"use client";
import { PixelSprite } from "@/components/PixelSprite";
import { EXPEDITION_REWARDS } from "@/lib/expeditions/catalog";
import { formatCountdown, type ExpeditionAgent, type ExpeditionItem } from "./types";

interface ExpeditionSlotProps {
  index: number;
  expedition: ExpeditionItem | null;
  agent: ExpeditionAgent | undefined;
  now: number;
  claiming: boolean;
  onClaim: (expedition: ExpeditionItem) => void;
}

export function ExpeditionSlot({ index, expedition, agent, now, claiming, onClaim }: ExpeditionSlotProps) {
  if (!expedition) {
    return (
      <li
        aria-label={`Slot ${index + 1}: empty`}
        className="border border-dashed border-gray-800 rounded-lg p-3 flex items-center justify-center min-h-[88px] font-mono text-xs text-gray-600"
      >
        Empty slot · send an agent below
      </li>
    );
  }

  const name = agent?.name ?? "Agent";
  const ends = Date.parse(expedition.endsAt);
  const total = ends - Date.parse(expedition.startedAt);
  const left = ends - now;
  const ready = left <= 0;
  const progress = ready ? 100 : Math.min(100, Math.max(0, ((total - left) / total) * 100));
  const base = EXPEDITION_REWARDS[expedition.durationH];

  return (
    <li
      aria-label={`Slot ${index + 1}: ${name}, ${ready ? "back" : "away"}`}
      className={`border rounded-lg p-3 flex items-center gap-3 min-h-[88px] ${ready ? "border-amber-500 bg-amber-900/20" : "border-gray-800 bg-gray-900"}`}
    >
      <div className="shrink-0">{agent && <PixelSprite spriteSeed={agent.spriteSeed} role={agent.role} size={48} />}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-sm font-bold text-white truncate">{name}</span>
          <span className="font-mono text-[10px] text-gray-500 shrink-0">{expedition.durationH}h trip</span>
        </div>
        {ready ? (
          <p className="font-mono text-xs text-amber-300 mt-0.5">Back with loot!</p>
        ) : (
          <p className="font-mono text-xs text-gray-300 mt-0.5">
            Back in <span className="tabular-nums text-white">{formatCountdown(left)}</span>
          </p>
        )}
        <div className="mt-1.5 h-1.5 rounded bg-gray-800 overflow-hidden" aria-hidden="true">
          <div className={`h-full ${ready ? "bg-amber-400" : "bg-sky-500"}`} style={{ width: `${progress}%` }} />
        </div>
        {!ready && (
          <p className="font-mono text-[10px] text-gray-500 mt-1">
            💎 {base.gems}
            {base.ticketChance > 0 && ` · ${Math.round(base.ticketChance * 100)}% 🎟`} · stats
          </p>
        )}
      </div>
      {ready && (
        <button
          type="button"
          onClick={() => onClaim(expedition)}
          disabled={claiming}
          aria-label={`Claim ${name}'s loot`}
          className="shrink-0 min-h-[44px] min-w-[72px] px-3 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 font-mono text-xs font-bold text-white"
        >
          {claiming ? "…" : "Claim"}
        </button>
      )}
    </li>
  );
}
