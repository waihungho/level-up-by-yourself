"use client";
import Link from "next/link";
import type { Agent, AgentDimension } from "@/lib/types";
import { PixelSprite } from "@/components/PixelSprite";
import { MiniRadar } from "@/components/DimensionChart";

interface AgentCardProps {
  agent: Agent;
  dimensions?: AgentDimension[];
}

const ROLE_BADGE_COLORS = {
  future: "bg-purple-700 text-purple-200",
  modern: "bg-blue-700 text-blue-200",
  medieval: "bg-amber-700 text-amber-200",
};

export function AgentCard({ agent, dimensions }: AgentCardProps) {
  const dimMap = dimensions
    ? new Map(dimensions.map((d) => [d.dimensionId, d.value]))
    : new Map<number, number>();

  return (
    <Link href={`/agents/${agent.id}`} className="block bg-gray-900 border border-gray-800 rounded p-4 hover:border-gray-600 transition-colors">
      <div className="flex gap-4 items-center">
        <PixelSprite spriteSeed={agent.spriteSeed as Record<string, number>} role={agent.role} size={80} />
        <div className="flex-1 min-w-0">
          <div className="font-mono font-bold text-white truncate">{agent.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-400 font-mono">{agent.roleTitle}</span>
            <span className={`text-xs px-2 py-0.5 rounded font-mono ${ROLE_BADGE_COLORS[agent.role]}`}>
              {agent.role}
            </span>
          </div>
        </div>
        {dimensions && dimensions.length > 0 && (
          <MiniRadar dimMap={dimMap} size={100} />
        )}
      </div>
    </Link>
  );
}
