"use client";
import Link from "next/link";
import type { Agent, AgentDimension } from "@/lib/types";
import { DIMENSIONS } from "@/lib/constants";
import { PixelSprite } from "@/components/PixelSprite";

interface AgentCardProps {
  agent: Agent;
  dimensions?: AgentDimension[];
}

const ROLE_COLORS = {
  future: "bg-purple-900 border-purple-700",
  modern: "bg-blue-900 border-blue-700",
  medieval: "bg-amber-900 border-amber-700",
};

const ROLE_BADGE_COLORS = {
  future: "bg-purple-700 text-purple-200",
  modern: "bg-blue-700 text-blue-200",
  medieval: "bg-amber-700 text-amber-200",
};

export function AgentCard({ agent, dimensions }: AgentCardProps) {
  const top5 = dimensions
    ?.sort((a, b) => b.value - a.value)
    .slice(0, 5) ?? [];

  return (
    <Link href={`/agents/${agent.id}`} className="block bg-gray-900 border border-gray-800 rounded p-4 hover:border-gray-600 transition-colors">
      <div className="flex gap-4">
        <PixelSprite spriteSeed={agent.spriteSeed as Record<string, number>} role={agent.role} size={80} />
        <div className="flex-1 min-w-0">
          <div className="font-mono font-bold text-white truncate">{agent.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-400 font-mono">{agent.roleTitle}</span>
            <span className={`text-xs px-2 py-0.5 rounded font-mono ${ROLE_BADGE_COLORS[agent.role]}`}>
              {agent.role}
            </span>
          </div>
          {top5.length > 0 && (
            <div className="mt-2 space-y-1">
              {top5.map((d) => {
                const dim = DIMENSIONS.find((x) => x.id === d.dimensionId);
                return (
                  <div key={d.dimensionId} className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-gray-500 w-20 truncate">{dim?.name}</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                      <div
                        className="bg-purple-500 rounded-full h-1.5"
                        style={{ width: `${Math.min(d.value / 40 * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-gray-400 w-8 text-right">{Math.round(d.value)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
