"use client";
import { useGame } from "@/components/GameProvider";

export function PlayerStats() {
  const { player, agents } = useGame();
  if (!player) return null;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-gray-900 border border-gray-800 rounded p-4 text-center">
        <div className="text-3xl font-mono font-bold text-purple-400">{player.abilityScore}</div>
        <div className="text-sm text-gray-500 font-mono mt-1">Ability Score</div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded p-4 text-center">
        <div className="text-3xl font-mono font-bold text-green-400">{agents.length}</div>
        <div className="text-sm text-gray-500 font-mono mt-1">Agents</div>
      </div>
    </div>
  );
}
