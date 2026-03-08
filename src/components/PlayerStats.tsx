"use client";
import { useGame } from "@/components/GameProvider";
import { SUMMON_COOLDOWN_DAYS } from "@/lib/constants";

export function PlayerStats() {
  const { player, agents } = useGame();
  if (!player) return null;

  const canSummon = !player.lastSummonAt ||
    Date.now() - new Date(player.lastSummonAt).getTime() > SUMMON_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

  const timeUntilSummon = player.lastSummonAt
    ? new Date(player.lastSummonAt).getTime() + SUMMON_COOLDOWN_DAYS * 24 * 60 * 60 * 1000 - Date.now()
    : 0;
  const daysLeft = Math.floor(timeUntilSummon / (24 * 60 * 60 * 1000));
  const hoursLeft = Math.floor((timeUntilSummon % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-gray-900 border border-gray-800 rounded p-4 text-center">
        <div className="text-3xl font-mono font-bold text-purple-400">{player.abilityScore}</div>
        <div className="text-sm text-gray-500 font-mono mt-1">Ability Score</div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded p-4 text-center">
        <div className="text-3xl font-mono font-bold text-green-400">{agents.length}</div>
        <div className="text-sm text-gray-500 font-mono mt-1">Agents</div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded p-4 text-center">
        <div className="text-lg font-mono font-bold text-yellow-400">
          {canSummon ? "Ready!" : `${daysLeft}d ${hoursLeft}h`}
        </div>
        <div className="text-sm text-gray-500 font-mono mt-1">Next Summon</div>
      </div>
    </div>
  );
}
