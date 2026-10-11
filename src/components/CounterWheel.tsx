import { useId } from "react";
import { CYCLE } from "@/lib/tactical/constants";
import type { Category } from "@/lib/tactical/types";
import { CATEGORY_STYLE } from "./tactical/categoryStyle";

/** Pentagon of the category cycle; each arrow points at the category it beats. */
export function CounterWheel({ highlight = null, size = 160 }: { highlight?: Category | null; size?: number }) {
  const markerId = `cw-arrow-${useId().replace(/:/g, "")}`;
  const c = size / 2;
  const r = size * 0.36;
  const pts = CYCLE.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / CYCLE.length;
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Counter wheel: each category beats the next one clockwise">
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#6b7280" />
        </marker>
      </defs>
      {pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length];
        const k = 0.22;
        return (
          <line
            key={i}
            x1={p.x + (q.x - p.x) * k}
            y1={p.y + (q.y - p.y) * k}
            x2={q.x - (q.x - p.x) * k}
            y2={q.y - (q.y - p.y) * k}
            stroke={highlight === CYCLE[i] ? "#facc15" : "#4b5563"}
            strokeWidth={highlight === CYCLE[i] ? 2.5 : 1.5}
            markerEnd={`url(#${markerId})`}
          />
        );
      })}
      {pts.map((p, i) => {
        const cat = CYCLE[i];
        const s = CATEGORY_STYLE[cat];
        return (
          <g key={cat}>
            <circle cx={p.x} cy={p.y} r={size * 0.09} fill="#111827" stroke={highlight === cat ? "#facc15" : s.hex} strokeWidth={2} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={size * 0.09} fill={s.hex}>
              {s.icon}
            </text>
            <text x={p.x} y={p.y + size * 0.16} textAnchor="middle" fontSize={size * 0.065} fill="#9ca3af" fontFamily="monospace">
              {cat}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
