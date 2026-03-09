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

const CATEGORY_STROKE: Record<string, string> = {
  Physical: "#ef4444",
  Mental: "#3b82f6",
  Social: "#22c55e",
  Spiritual: "#a855f7",
  Technical: "#06b6d4",
};

const CATEGORIES = ["Physical", "Mental", "Social", "Spiritual", "Technical"];

function getCategoryAverage(
  category: string,
  dimMap: Map<number, number>
): number {
  const categoryDims = DIMENSIONS.filter((d) => d.category === category);
  const total = categoryDims.reduce((sum, d) => sum + (dimMap.get(d.id) ?? 10), 0);
  return total / categoryDims.length;
}

export function MiniRadar({ dimMap, size = 120 }: { dimMap: Map<number, number>; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size * 0.33;
  const maxValue = 50;

  const averages = CATEGORIES.map((cat) => getCategoryAverage(cat, dimMap));
  const totalScore = Math.round(averages.reduce((s, v) => s + v, 0));

  const getPoint = (index: number, radius: number) => {
    const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  };

  const polygonPath = (radius: number) =>
    CATEGORIES.map((_, i) => {
      const p = getPoint(i, radius);
      return `${i === 0 ? "M" : "L"}${p.x},${p.y}`;
    }).join(" ") + " Z";

  const dataPath = averages
    .map((val, i) => {
      const r = (val / maxValue) * maxRadius;
      const p = getPoint(i, r);
      return `${i === 0 ? "M" : "L"}${p.x},${p.y}`;
    })
    .join(" ") + " Z";

  return (
    <svg width={size} height={size} className="block shrink-0">
      <path d={polygonPath(maxRadius)} fill="none" stroke="#374151" strokeWidth={1} />
      <path d={polygonPath(maxRadius * 0.5)} fill="none" stroke="#374151" strokeWidth={0.5} />
      {CATEGORIES.map((_, i) => {
        const p = getPoint(i, maxRadius);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#374151" strokeWidth={0.5} />;
      })}
      <path d={dataPath} fill="rgba(6,182,212,0.15)" stroke="#06b6d4" strokeWidth={1.5} />
      {averages.map((val, i) => {
        const r = (val / maxValue) * maxRadius;
        const p = getPoint(i, r);
        return <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={CATEGORY_STROKE[CATEGORIES[i]]} stroke="#111827" strokeWidth={1} />;
      })}
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="text-xs font-mono font-bold" fill="white">
        {totalScore}
      </text>
    </svg>
  );
}

function OverallRadar({ dimMap }: { dimMap: Map<number, number> }) {
  const padding = 50;
  const innerSize = 300;
  const size = innerSize + padding * 2;
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = 100;
  const levels = 4;

  const averages = CATEGORIES.map((cat) => getCategoryAverage(cat, dimMap));
  const maxValue = 50;
  const totalScore = Math.round(averages.reduce((s, v) => s + v, 0));

  // Pentagon points for a given radius
  const getPoint = (index: number, radius: number) => {
    const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  };

  const polygonPath = (radius: number) =>
    CATEGORIES.map((_, i) => {
      const p = getPoint(i, radius);
      return `${i === 0 ? "M" : "L"}${p.x},${p.y}`;
    }).join(" ") + " Z";

  const dataPath = averages
    .map((val, i) => {
      const r = (val / maxValue) * maxRadius;
      const p = getPoint(i, r);
      return `${i === 0 ? "M" : "L"}${p.x},${p.y}`;
    })
    .join(" ") + " Z";

  return (
    <div className="flex flex-col items-center mb-6">
      <svg width={size} height={size} className="block">
        {/* Grid levels */}
        {Array.from({ length: levels }, (_, i) => {
          const r = (maxRadius * (i + 1)) / levels;
          return (
            <path
              key={i}
              d={polygonPath(r)}
              fill="none"
              stroke="#374151"
              strokeWidth={1}
            />
          );
        })}
        {/* Axis lines */}
        {CATEGORIES.map((_, i) => {
          const p = getPoint(i, maxRadius);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="#374151"
              strokeWidth={1}
            />
          );
        })}
        {/* Data polygon */}
        <path d={dataPath} fill="rgba(6,182,212,0.15)" stroke="#06b6d4" strokeWidth={2} />
        {/* Data points */}
        {averages.map((val, i) => {
          const r = (val / maxValue) * maxRadius;
          const p = getPoint(i, r);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={4}
              fill={CATEGORY_STROKE[CATEGORIES[i]]}
              stroke="#111827"
              strokeWidth={2}
            />
          );
        })}
        {/* Labels */}
        {CATEGORIES.map((cat, i) => {
          const p = getPoint(i, maxRadius + 35);
          return (
            <text
              key={cat}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="text-xs font-mono"
              fill={CATEGORY_STROKE[cat]}
            >
              {cat}
            </text>
          );
        })}
        {/* Center total score */}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          className="text-lg font-mono font-bold"
          fill="white"
        >
          {totalScore}
        </text>
      </svg>
      {/* Category averages */}
      <div className="flex gap-4 mt-2 flex-wrap justify-center">
        {CATEGORIES.map((cat, i) => (
          <span key={cat} className={`text-xs font-mono ${CATEGORY_TEXT[cat]}`}>
            {cat}: {averages[i].toFixed(1)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DimensionChart({ dimensions }: { dimensions: AgentDimension[] }) {
  const dimMap = new Map(dimensions.map((d) => [d.dimensionId, d.value]));

  return (
    <div className="space-y-6">
      {/* Overall radar chart */}
      <OverallRadar dimMap={dimMap} />

      {/* Detailed bars per category */}
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
                    <span className="text-gray-400 w-10 text-right">{value % 1 === 0 ? value : value.toFixed(1)}</span>
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
