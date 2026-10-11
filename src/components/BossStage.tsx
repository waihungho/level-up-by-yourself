"use client";
import { useEffect, useRef, useState } from "react";
import { PixelSprite } from "@/components/PixelSprite";
import { CATEGORY_STYLE } from "@/components/tactical/categoryStyle";
import type { BossDef } from "@/lib/raid/bosses";
import type { RaidBoss } from "@/lib/raid/raid-db";
import type { RaidPhase } from "@/lib/raid/raid-engine";
import type { Category } from "@/lib/tactical/types";

const PHASE_GLOW: Record<RaidPhase, string> = {
  1: "drop-shadow(0 0 18px rgba(168,85,247,0.55))",
  2: "drop-shadow(0 0 22px rgba(249,115,22,0.7))",
  3: "drop-shadow(0 0 30px rgba(239,68,68,0.9))",
};
const PHASE_LABEL: Record<RaidPhase, string> = { 1: "Phase I", 2: "Phase II — ULTIMATE every 4th round", 3: "Phase III — ENRAGED" };

function slainKey(id: string) {
  return `raid_slain_seen_${id}`;
}

interface BossStageProps {
  def: BossDef;
  boss: RaidBoss;
  phase: RaidPhase;
  weakness: Category;
}

export function BossStage({ def, boss, phase, weakness }: BossStageProps) {
  const [flash, setFlash] = useState(false);
  const [showSlain, setShowSlain] = useState(false);
  const prevHp = useRef(boss.hpRemaining);
  const pct = boss.maxHp > 0 ? (boss.hpRemaining / boss.maxHp) * 100 : 0;
  const defeated = boss.status === "defeated";

  useEffect(() => {
    if (boss.hpRemaining < prevHp.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- flash reacts to a live HP drop
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 300);
      prevHp.current = boss.hpRemaining;
      return () => clearTimeout(t);
    }
    prevHp.current = boss.hpRemaining;
  }, [boss.hpRemaining]);

  useEffect(() => {
    if (!defeated) return;
    try {
      if (localStorage.getItem(slainKey(boss.id))) return;
      localStorage.setItem(slainKey(boss.id), "1");
    } catch {
      // storage unavailable: show the cinematic anyway
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time cinematic after reading storage
    setShowSlain(true);
    const t = setTimeout(() => setShowSlain(false), 3500);
    return () => clearTimeout(t);
  }, [defeated, boss.id]);

  return (
    <div className="relative bg-gradient-to-b from-gray-900 to-black border border-gray-800 rounded-xl p-5 overflow-hidden">
      <div className="text-center mb-2">
        <h2 className="font-mono text-2xl font-black text-white tracking-wide">{def.name}</h2>
        <p className="font-mono text-[11px] text-gray-400 italic">{def.lore}</p>
      </div>

      <div className="flex justify-center my-3">
        <div
          className={`${defeated ? "grayscale opacity-60" : "animate-idleBounce"} ${flash ? "animate-flashWhite" : ""}`}
          style={{ filter: defeated ? undefined : PHASE_GLOW[phase] }}
        >
          <PixelSprite spriteSeed={def.spriteSeed} role={def.role} size={176} />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between font-mono text-xs">
          <span className={phase === 3 ? "text-red-400 font-bold" : phase === 2 ? "text-orange-300" : "text-purple-300"}>{defeated ? "DEFEATED" : PHASE_LABEL[phase]}</span>
          <span className="text-gray-300">
            {boss.hpRemaining.toLocaleString()} / {boss.maxHp.toLocaleString()}
          </span>
        </div>
        <div className="h-4 bg-gray-800 rounded-full overflow-hidden border border-gray-700" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Boss HP">
          <div
            className={`h-full transition-all duration-700 ${phase === 3 ? "bg-red-600" : phase === 2 ? "bg-orange-500" : "bg-purple-600"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {!defeated && (
        <div className="flex justify-center gap-3 mt-3 font-mono text-xs">
          <span className={`px-2 py-1 rounded border ${CATEGORY_STYLE[weakness].border} ${CATEGORY_STYLE[weakness].bg} ${CATEGORY_STYLE[weakness].text}`}>
            Weak: {CATEGORY_STYLE[weakness].icon} {weakness} ×1.5
          </span>
          <span className={`px-2 py-1 rounded border border-gray-700 bg-gray-900 ${CATEGORY_STYLE[def.resist].text}`}>
            Resists: {def.resist} ×0.5
          </span>
        </div>
      )}

      {showSlain && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center animate-fadeIn" role="status">
          <p className="font-mono text-5xl font-black text-yellow-400 animate-vsSlam">SLAIN</p>
          <p className="font-mono text-sm text-gray-300 mt-2">{def.name} has fallen. Rewards are on their way.</p>
        </div>
      )}
    </div>
  );
}
