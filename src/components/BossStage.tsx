"use client";
import { useEffect, useRef, useState } from "react";
import { PixelSprite } from "@/components/PixelSprite";
import { SlainOverlay } from "@/components/SlainOverlay";
import { CATEGORY_STYLE } from "@/components/tactical/categoryStyle";
import type { BossDef } from "@/lib/raid/bosses";
import type { RaidBoss } from "@/lib/raid/raid-db";
import type { RaidPhase } from "@/lib/raid/raid-engine";
import type { Category } from "@/lib/tactical/types";

const PHASE_STYLE: Record<RaidPhase, { label: string; text: string; bar: string; glow: string }> = {
  1: { label: "Phase I", text: "text-purple-300", bar: "bg-purple-600", glow: "drop-shadow(0 0 18px rgba(168,85,247,0.55))" },
  2: { label: "Phase II — ULTIMATE every 4th round", text: "text-orange-300", bar: "bg-orange-500", glow: "drop-shadow(0 0 22px rgba(249,115,22,0.7))" },
  3: { label: "Phase III — ENRAGED", text: "text-red-400 font-bold", bar: "bg-red-600", glow: "drop-shadow(0 0 30px rgba(239,68,68,0.9))" },
};

interface BossStageProps {
  def: BossDef;
  boss: RaidBoss;
  phase: RaidPhase;
  weakness: Category;
}

export function BossStage({ def, boss, phase, weakness }: BossStageProps) {
  const [flash, setFlash] = useState(false);
  const prevHp = useRef(boss.hpRemaining);
  const pct = boss.maxHp > 0 ? (boss.hpRemaining / boss.maxHp) * 100 : 0;
  const defeated = boss.status === "defeated";
  const style = PHASE_STYLE[phase];
  const weak = CATEGORY_STYLE[weakness];

  useEffect(() => {
    const dropped = boss.hpRemaining < prevHp.current;
    prevHp.current = boss.hpRemaining;
    if (!dropped) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flash reacts to a live HP drop
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 300);
    return () => clearTimeout(t);
  }, [boss.hpRemaining]);

  return (
    <div className="relative bg-gradient-to-b from-gray-900 to-black border border-gray-800 rounded-xl p-5 overflow-hidden">
      <div className="text-center mb-2">
        <h2 className="font-mono text-2xl font-black text-white tracking-wide">{def.name}</h2>
        <p className="font-mono text-[11px] text-gray-400 italic">{def.lore}</p>
      </div>

      <div className="flex justify-center my-3">
        <div
          className={`${defeated ? "grayscale opacity-60" : "animate-idleBounce"} ${flash ? "animate-flashWhite" : ""}`}
          style={{ filter: defeated ? undefined : style.glow }}
        >
          <PixelSprite spriteSeed={def.spriteSeed} role={def.role} size={176} />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between font-mono text-xs">
          <span className={defeated ? "text-gray-400" : style.text}>{defeated ? "DEFEATED" : style.label}</span>
          <span className="text-gray-300">
            {boss.hpRemaining.toLocaleString()} / {boss.maxHp.toLocaleString()}
          </span>
        </div>
        <div className="h-4 bg-gray-800 rounded-full overflow-hidden border border-gray-700" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Boss HP">
          <div className={`h-full transition-all duration-700 ${style.bar}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {!defeated && (
        <div className="flex justify-center gap-3 mt-3 font-mono text-xs">
          <span className={`px-2 py-1 rounded border ${weak.border} ${weak.bg} ${weak.text}`}>
            Weak: {weak.icon} {weakness} ×1.5
          </span>
          <span className={`px-2 py-1 rounded border border-gray-700 bg-gray-900 ${CATEGORY_STYLE[def.resist].text}`}>Resists: {def.resist} ×0.5</span>
        </div>
      )}

      {defeated && <SlainOverlay bossId={boss.id} bossName={def.name} />}
    </div>
  );
}
