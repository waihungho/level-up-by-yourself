"use client";
import type { BattleLog } from "@/lib/types";
import { DIMENSIONS } from "@/lib/constants";

export function BattleHistory({ logs, agentId, totalCount }: { logs: BattleLog[]; agentId: string; totalCount: number }) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 font-mono">No battles yet. Challenge your agents in the Battle Arena!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-gray-500">
        Total: {totalCount} battle{totalCount !== 1 ? "s" : ""} · Showing latest {logs.length}
      </p>
      {logs.map((log) => {
        const isWinner = log.winnerId === agentId;
        const opponentId = log.attackerId === agentId ? log.defenderId : log.attackerId;
        const opponentLabel = opponentId.slice(0, 8);
        const growth = log.attackerId === agentId ? log.attackerGrowth : log.defenderGrowth;
        const date = new Date(log.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });

        const gains = Object.entries(growth).map(([dimId, delta]) => {
          const dim = DIMENSIONS.find((d) => d.id === Number(dimId));
          return { name: dim?.name ?? `Dim ${dimId}`, delta: delta as number };
        }).filter((g) => g.delta > 0);

        return (
          <div key={log.id} className="bg-gray-900 border border-gray-800 rounded p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-500 font-mono">{date}</div>
              <span
                className={`text-xs font-mono font-bold px-2 py-1 rounded ${
                  isWinner
                    ? "bg-green-900/40 text-green-400"
                    : "bg-red-900/40 text-red-400"
                }`}
              >
                {isWinner ? "Victory" : "Defeat"}
              </span>
            </div>
            <div className="text-sm text-gray-400 font-mono mb-2">
              vs {opponentLabel}&hellip; &middot; {log.rounds.length} round{log.rounds.length !== 1 ? "s" : ""}
            </div>
            {gains.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {gains.map((g) => (
                  <span key={g.name} className="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-green-400">
                    +{g.delta} {g.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
