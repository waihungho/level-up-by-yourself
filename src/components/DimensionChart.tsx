"use client";
import type { AgentDimension } from "@/lib/types";
import { DIMENSIONS } from "@/lib/constants";

const CATEGORY_COLORS: Record<string, string> = {
  Physical: "bg-red-500",
  Mental: "bg-blue-500",
  Social: "bg-green-500",
  Spiritual: "bg-purple-500",
  Technical: "bg-cyan-500",
};

const CATEGORY_TEXT: Record<string, string> = {
  Physical: "text-red-400",
  Mental: "text-blue-400",
  Social: "text-green-400",
  Spiritual: "text-purple-400",
  Technical: "text-cyan-400",
};

const CATEGORIES = ["Physical", "Mental", "Social", "Spiritual", "Technical"];

export function DimensionChart({ dimensions }: { dimensions: AgentDimension[] }) {
  const dimMap = new Map(dimensions.map((d) => [d.dimensionId, d.value]));

  return (
    <div className="space-y-6">
      {CATEGORIES.map((category) => {
        const categoryDims = DIMENSIONS.filter((d) => d.category === category);
        return (
          <div key={category}>
            <h3 className={`font-mono font-bold text-sm mb-2 ${CATEGORY_TEXT[category]}`}>
              {category}
            </h3>
            <div className="space-y-1">
              {categoryDims.map((dim) => {
                const value = dimMap.get(dim.id) ?? 10;
                return (
                  <div key={dim.id} className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-gray-500 w-24 truncate">{dim.name}</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-2">
                      <div
                        className={`${CATEGORY_COLORS[category]} rounded-full h-2 transition-all`}
                        style={{ width: `${Math.min((value / 50) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-gray-400 w-8 text-right">{Math.round(value)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
