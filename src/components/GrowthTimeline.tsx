"use client";
import type { GrowthLog } from "@/lib/types";
import { DIMENSIONS } from "@/lib/constants";

export function GrowthTimeline({ logs, totalCount }: { logs: GrowthLog[]; totalCount: number }) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 font-mono">No growth yet. Growth happens daily!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-gray-500">
        Total: {totalCount} growth record{totalCount !== 1 ? "s" : ""} · Showing latest {logs.length}
      </p>
      {logs.map((log, i) => {
        const changes = Object.entries(log.dimensionChanges).map(([dimId, delta]) => {
          const dim = DIMENSIONS.find((d) => d.id === Number(dimId));
          return { name: dim?.name ?? `Dim ${dimId}`, delta: delta as number };
        });

        return (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded p-4">
            <div className="text-sm text-gray-500 font-mono mb-2">{log.date}</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {changes.map((c) => (
                <span key={c.name} className="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-green-400">
                  +{c.delta} {c.name}
                </span>
              ))}
            </div>
            {log.narrative && (
              <p className="text-sm text-gray-400 italic">{log.narrative}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
