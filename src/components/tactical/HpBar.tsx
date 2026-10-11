"use client";

interface HpBarProps {
  name: string;
  hp: number;
  maxHp: number;
  align?: "left" | "right";
  shake?: boolean;
  floater?: number | null;
  compact?: boolean;
}

function color(pct: number) {
  if (pct > 50) return "bg-green-500";
  if (pct > 25) return "bg-yellow-500";
  return "bg-red-500";
}

export function HpBar({ name, hp, maxHp, align = "left", shake, floater, compact }: HpBarProps) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  return (
    <div className={`relative ${shake ? "animate-shakeHit" : ""}`}>
      <div className={`flex justify-between font-mono ${compact ? "text-[9px]" : "text-[11px]"} mb-0.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <span className="text-white font-bold truncate">{name}</span>
        <span className="text-gray-400">{Math.round(hp).toLocaleString()} HP</span>
      </div>
      <div className={`${compact ? "h-1.5" : "h-2.5"} bg-gray-800 rounded-full overflow-hidden`}>
        <div className={`h-full ${color(pct)} transition-all duration-500 ${align === "right" ? "ml-auto" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      {floater ? (
        <span className="absolute -top-4 left-1/2 -translate-x-1/2 font-mono font-bold text-red-400 text-sm animate-floatDamage pointer-events-none">
          -{floater.toLocaleString()}
        </span>
      ) : null}
    </div>
  );
}
