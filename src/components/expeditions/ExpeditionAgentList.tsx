"use client";
import { PixelSprite } from "@/components/PixelSprite";
import { EXPEDITION_DURATIONS, type ExpeditionDuration } from "@/lib/expeditions/catalog";
import type { ExpeditionAgent } from "./types";

interface ExpeditionAgentListProps {
  agents: ExpeditionAgent[];
  awayIds: Set<string>;
  slotsFull: boolean;
  busy: boolean;
  onStart: (agent: ExpeditionAgent, duration: ExpeditionDuration) => void;
}

export function ExpeditionAgentList({ agents, awayIds, slotsFull, busy, onStart }: ExpeditionAgentListProps) {
  if (agents.length === 0) return <p className="font-mono text-xs text-gray-500">Summon an agent to send on expeditions.</p>;

  return (
    <ul className="space-y-2">
      {agents.map((a) => {
        const away = awayIds.has(a.id);
        return (
          <li key={a.id} className="border border-gray-800 bg-gray-900 rounded-lg p-2.5 flex items-center gap-2.5">
            <div className="shrink-0">
              <PixelSprite spriteSeed={a.spriteSeed as Record<string, number>} role={a.role} size={40} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-xs font-bold text-white truncate">{a.name}</p>
              <p className="font-mono text-[10px] text-gray-500 truncate">{away ? "On an expedition" : a.roleTitle}</p>
            </div>
            <div className="flex gap-1.5 shrink-0" role="group" aria-label={`Send ${a.name}`}>
              {EXPEDITION_DURATIONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-label={`Send ${a.name} for ${h} hours`}
                  disabled={busy || away || slotsFull}
                  onClick={() => onStart(a, h)}
                  className="min-h-[44px] min-w-[44px] px-2 rounded bg-sky-800 hover:bg-sky-700 disabled:opacity-30 disabled:hover:bg-sky-800 font-mono text-xs font-bold text-white"
                >
                  {h}h
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
