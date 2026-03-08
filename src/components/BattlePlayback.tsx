"use client";
import { useEffect, useState } from "react";
import { PixelSprite } from "@/components/PixelSprite";
import type { AgentWithDimensions, BattleLog } from "@/lib/types";

interface BattlePlaybackProps {
  battleLog: BattleLog;
  attacker: AgentWithDimensions;
  defender: AgentWithDimensions;
  onComplete: () => void;
}

function hpColor(pct: number): string {
  if (pct > 50) return "bg-green-500";
  if (pct > 25) return "bg-yellow-500";
  return "bg-red-500";
}

export function BattlePlayback({
  battleLog,
  attacker,
  defender,
  onComplete,
}: BattlePlaybackProps) {
  const [visibleRounds, setVisibleRounds] = useState(0);
  const [showVictory, setShowVictory] = useState(false);

  const totalRounds = battleLog.rounds.length;

  // Calculate initial HP from round data (round 0 = full HP)
  // We can derive it: initial HP = round1.attackerHpAfter + damage taken in round 1
  // Simpler: sum all damage taken across rounds + final HP
  const attackerMaxHp = (() => {
    let totalDmg = 0;
    for (const r of battleLog.rounds) {
      if (r.firstAttacker === attacker.id) {
        totalDmg += r.secondDamage;
      } else {
        totalDmg += r.firstDamage;
      }
    }
    const finalHp = battleLog.rounds[totalRounds - 1]?.attackerHpAfter ?? 0;
    return totalDmg + finalHp;
  })();

  const defenderMaxHp = (() => {
    let totalDmg = 0;
    for (const r of battleLog.rounds) {
      if (r.firstAttacker === attacker.id) {
        totalDmg += r.firstDamage;
      } else {
        totalDmg += r.secondDamage;
      }
    }
    const finalHp = battleLog.rounds[totalRounds - 1]?.defenderHpAfter ?? 0;
    return totalDmg + finalHp;
  })();

  // Current HP based on visible rounds
  const currentAttackerHp =
    visibleRounds === 0
      ? attackerMaxHp
      : battleLog.rounds[visibleRounds - 1].attackerHpAfter;
  const currentDefenderHp =
    visibleRounds === 0
      ? defenderMaxHp
      : battleLog.rounds[visibleRounds - 1].defenderHpAfter;

  const attackerHpPct = Math.max(
    0,
    (currentAttackerHp / attackerMaxHp) * 100
  );
  const defenderHpPct = Math.max(
    0,
    (currentDefenderHp / defenderMaxHp) * 100
  );

  useEffect(() => {
    if (visibleRounds < totalRounds) {
      const timer = setTimeout(() => {
        setVisibleRounds((prev) => prev + 1);
      }, 1500);
      return () => clearTimeout(timer);
    } else if (visibleRounds === totalRounds && totalRounds > 0) {
      const timer = setTimeout(() => {
        setShowVictory(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [visibleRounds, totalRounds]);

  useEffect(() => {
    if (showVictory) {
      const timer = setTimeout(() => {
        onComplete();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showVictory, onComplete]);

  const winner =
    battleLog.winnerId === attacker.id ? attacker : defender;

  return (
    <div className="space-y-6">
      {/* Agent displays */}
      <div className="grid grid-cols-2 gap-4">
        {/* Attacker */}
        <div className="bg-gray-900 border border-gray-800 rounded p-4 text-center">
          <div className="flex justify-center mb-2">
            <PixelSprite
              spriteSeed={attacker.spriteSeed as Record<string, number>}
              role={attacker.role}
              size={64}
            />
          </div>
          <p className="font-mono text-sm font-bold text-white truncate">
            {attacker.name}
          </p>
          <div className="mt-2">
            <div className="flex justify-between text-xs font-mono text-gray-400 mb-1">
              <span>HP</span>
              <span>
                {Math.round(currentAttackerHp)}/{Math.round(attackerMaxHp)}
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${hpColor(attackerHpPct)}`}
                style={{ width: `${attackerHpPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Defender */}
        <div className="bg-gray-900 border border-gray-800 rounded p-4 text-center">
          <div className="flex justify-center mb-2">
            <PixelSprite
              spriteSeed={defender.spriteSeed as Record<string, number>}
              role={defender.role}
              size={64}
            />
          </div>
          <p className="font-mono text-sm font-bold text-white truncate">
            {defender.name}
          </p>
          <div className="mt-2">
            <div className="flex justify-between text-xs font-mono text-gray-400 mb-1">
              <span>HP</span>
              <span>
                {Math.round(currentDefenderHp)}/{Math.round(defenderMaxHp)}
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${hpColor(defenderHpPct)}`}
                style={{ width: `${defenderHpPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* VS divider */}
      <div className="text-center font-mono text-gray-600 text-lg">VS</div>

      {/* Round log */}
      <div className="space-y-3">
        {battleLog.rounds.slice(0, visibleRounds).map((round) => {
          const firstIsAttacker = round.firstAttacker === attacker.id;
          const firstName = firstIsAttacker ? attacker.name : defender.name;
          const secondName = firstIsAttacker ? defender.name : attacker.name;

          return (
            <div
              key={round.roundNumber}
              className="bg-gray-900 border border-gray-800 rounded p-3 animate-fadeIn"
            >
              <div className="font-mono text-xs text-purple-400 mb-1">
                Round {round.roundNumber} &mdash; {round.category}
              </div>
              <div className="font-mono text-sm text-gray-300 space-y-1">
                <p>
                  <span className="text-white">{firstName}</span> strikes for{" "}
                  <span className="text-red-400">{round.firstDamage} dmg</span>
                </p>
                {round.secondDamage > 0 && (
                  <p>
                    <span className="text-white">{secondName}</span> counters
                    for{" "}
                    <span className="text-red-400">
                      {round.secondDamage} dmg
                    </span>
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Victory banner */}
      {showVictory && (
        <div className="text-center py-6 animate-fadeIn">
          <div className="text-3xl font-mono font-bold text-yellow-400 mb-2">
            VICTORY
          </div>
          <p className="font-mono text-lg text-white">{winner.name} wins!</p>
        </div>
      )}
    </div>
  );
}
