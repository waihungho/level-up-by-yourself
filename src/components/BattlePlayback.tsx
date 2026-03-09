"use client";
import { useEffect, useState, useRef } from "react";
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

function hpBarGlow(pct: number): string {
  if (pct > 50) return "";
  if (pct > 25) return "shadow-[0_0_8px_rgba(234,179,8,0.5)]";
  return "shadow-[0_0_8px_rgba(239,68,68,0.6)]";
}

type SubPhase = "idle" | "attack-left" | "attack-right" | "flash";

export function BattlePlayback({
  battleLog,
  attacker,
  defender,
  onComplete,
}: BattlePlaybackProps) {
  const [visibleRounds, setVisibleRounds] = useState(0);
  const [showVictory, setShowVictory] = useState(false);
  const [entered, setEntered] = useState(false);
  const [subPhase, setSubPhase] = useState<SubPhase>("idle");
  const [shakeLeft, setShakeLeft] = useState(false);
  const [shakeRight, setShakeRight] = useState(false);
  const [damageLeft, setDamageLeft] = useState<number | null>(null);
  const [damageRight, setDamageRight] = useState<number | null>(null);
  const [flashScreen, setFlashScreen] = useState(false);
  const roundLogRef = useRef<HTMLDivElement>(null);

  const totalRounds = battleLog.rounds.length;

  // Entrance animation delay
  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Calculate max HP
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

  // Current HP
  const currentAttackerHp =
    visibleRounds === 0
      ? attackerMaxHp
      : battleLog.rounds[visibleRounds - 1].attackerHpAfter;
  const currentDefenderHp =
    visibleRounds === 0
      ? defenderMaxHp
      : battleLog.rounds[visibleRounds - 1].defenderHpAfter;

  const attackerHpPct = Math.max(0, (currentAttackerHp / attackerMaxHp) * 100);
  const defenderHpPct = Math.max(0, (currentDefenderHp / defenderMaxHp) * 100);

  // Animate rounds with sub-phases
  useEffect(() => {
    if (!entered) return;
    if (visibleRounds >= totalRounds) {
      if (totalRounds > 0) {
        const timer = setTimeout(() => setShowVictory(true), 400);
        return () => clearTimeout(timer);
      }
      return;
    }

    const round = battleLog.rounds[visibleRounds];
    const firstIsAttacker = round.firstAttacker === attacker.id;

    // First strike animation
    const t1 = setTimeout(() => {
      setSubPhase(firstIsAttacker ? "attack-left" : "attack-right");

      // Shake the defender
      if (firstIsAttacker) {
        setShakeRight(true);
        setDamageRight(round.firstDamage);
      } else {
        setShakeLeft(true);
        setDamageLeft(round.firstDamage);
      }
      setFlashScreen(true);
    }, 100);

    // Clear first strike effects
    const t2 = setTimeout(() => {
      setShakeLeft(false);
      setShakeRight(false);
      setDamageLeft(null);
      setDamageRight(null);
      setFlashScreen(false);
      setSubPhase("idle");
    }, 350);

    // Counter-attack animation
    const t3 = setTimeout(() => {
      if (round.secondDamage > 0) {
        setSubPhase(firstIsAttacker ? "attack-right" : "attack-left");

        if (firstIsAttacker) {
          setShakeLeft(true);
          setDamageLeft(round.secondDamage);
        } else {
          setShakeRight(true);
          setDamageRight(round.secondDamage);
        }
        setFlashScreen(true);
      }
    }, 450);

    // Clear counter effects + advance round
    const t4 = setTimeout(() => {
      setShakeLeft(false);
      setShakeRight(false);
      setDamageLeft(null);
      setDamageRight(null);
      setFlashScreen(false);
      setSubPhase("idle");
      setVisibleRounds((prev) => prev + 1);
    }, 700);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [visibleRounds, totalRounds, entered, battleLog.rounds, attacker.id]);

  // Auto-scroll round log
  useEffect(() => {
    if (roundLogRef.current) {
      roundLogRef.current.scrollTop = roundLogRef.current.scrollHeight;
    }
  }, [visibleRounds]);

  // Victory callback
  useEffect(() => {
    if (showVictory) {
      const timer = setTimeout(() => onComplete(), 800);
      return () => clearTimeout(timer);
    }
  }, [showVictory, onComplete]);

  const winner = battleLog.winnerId === attacker.id ? attacker : defender;
  const loser = battleLog.winnerId === attacker.id ? defender : attacker;
  const winnerIsLeft = winner.id === attacker.id;

  return (
    <div className="relative">
      {/* Screen flash overlay */}
      {flashScreen && (
        <div className="absolute inset-0 bg-white/10 rounded-lg animate-flashWhite pointer-events-none z-20" />
      )}

      {/* Battle arena background */}
      <div className="relative bg-gradient-to-b from-gray-900 via-gray-950 to-gray-900 border border-gray-800 rounded-lg p-4 overflow-hidden">
        {/* Ambient particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute w-1 h-1 bg-purple-500/30 rounded-full top-[20%] left-[15%] animate-idleBounce" style={{ animationDelay: "0s" }} />
          <div className="absolute w-1 h-1 bg-red-500/30 rounded-full top-[60%] left-[80%] animate-idleBounce" style={{ animationDelay: "0.5s" }} />
          <div className="absolute w-1 h-1 bg-cyan-500/20 rounded-full top-[40%] left-[50%] animate-idleBounce" style={{ animationDelay: "1s" }} />
        </div>

        {/* Fighters */}
        <div className="flex items-center justify-between gap-2 mb-3">
          {/* Attacker (left) */}
          <div
            className={`flex-1 text-center transition-transform duration-200 ${
              entered ? "animate-slideInLeft" : "opacity-0"
            } ${shakeLeft ? "animate-shakeHit" : ""} ${
              showVictory && !winnerIsLeft ? "animate-defeatFade" : ""
            }`}
          >
            <div className="relative inline-block">
              <div
                className={`transition-transform duration-200 ${
                  subPhase === "attack-left"
                    ? "translate-x-6 scale-110"
                    : showVictory && winnerIsLeft
                    ? "animate-idleBounce"
                    : ""
                }`}
              >
                <PixelSprite
                  spriteSeed={attacker.spriteSeed as Record<string, number>}
                  role={attacker.role}
                  size={56}
                />
              </div>
              {/* Damage number */}
              {damageLeft !== null && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 animate-floatDamage">
                  <span className="font-mono font-bold text-lg text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">
                    -{damageLeft}
                  </span>
                </div>
              )}
              {/* Victory sparkles */}
              {showVictory && winnerIsLeft && (
                <>
                  <div className="absolute -top-3 -left-1 text-yellow-400 animate-sparkle" style={{ animationDelay: "0.1s" }}>&#10022;</div>
                  <div className="absolute -top-1 -right-2 text-yellow-400 animate-sparkle" style={{ animationDelay: "0.3s" }}>&#10022;</div>
                  <div className="absolute top-1/2 -left-3 text-yellow-400 animate-sparkle" style={{ animationDelay: "0.5s" }}>&#10022;</div>
                </>
              )}
            </div>
            <p className="font-mono text-xs font-bold text-white mt-1 truncate">
              {attacker.name}
            </p>
            <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-mono bg-gray-800 text-gray-400">
              {attacker.role}
            </span>
            {/* HP bar */}
            <div className="mt-1 px-1">
              <div className="flex justify-between text-[10px] font-mono text-gray-500 mb-0.5">
                <span>HP</span>
                <span>
                  {Math.round(currentAttackerHp)}/{Math.round(attackerMaxHp)}
                </span>
              </div>
              <div className={`w-full bg-gray-700 rounded-full h-2 overflow-hidden ${hpBarGlow(attackerHpPct)}`}>
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${hpColor(attackerHpPct)}`}
                  style={{ width: `${attackerHpPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* VS */}
          <div className={`shrink-0 ${entered ? "animate-vsSlam" : "opacity-0"}`}>
            <div className="relative">
              <span className="font-mono font-black text-xl text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.6)]">
                VS
              </span>
            </div>
          </div>

          {/* Defender (right) */}
          <div
            className={`flex-1 text-center transition-transform duration-200 ${
              entered ? "animate-slideInRight" : "opacity-0"
            } ${shakeRight ? "animate-shakeHit" : ""} ${
              showVictory && winnerIsLeft ? "" : showVictory ? "animate-defeatFade" : ""
            }`}
          >
            <div className="relative inline-block">
              <div
                className={`transition-transform duration-200 ${
                  subPhase === "attack-right"
                    ? "-translate-x-6 scale-110"
                    : showVictory && !winnerIsLeft
                    ? ""
                    : showVictory && !winnerIsLeft
                    ? ""
                    : ""
                } ${showVictory && !winnerIsLeft ? "" : showVictory ? "animate-idleBounce" : ""}`}
              >
                <PixelSprite
                  spriteSeed={defender.spriteSeed as Record<string, number>}
                  role={defender.role}
                  size={56}
                />
              </div>
              {/* Damage number */}
              {damageRight !== null && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 animate-floatDamage">
                  <span className="font-mono font-bold text-lg text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">
                    -{damageRight}
                  </span>
                </div>
              )}
              {/* Victory sparkles */}
              {showVictory && !winnerIsLeft && (
                <>
                  <div className="absolute -top-3 -left-1 text-yellow-400 animate-sparkle" style={{ animationDelay: "0.1s" }}>&#10022;</div>
                  <div className="absolute -top-1 -right-2 text-yellow-400 animate-sparkle" style={{ animationDelay: "0.3s" }}>&#10022;</div>
                  <div className="absolute top-1/2 -right-3 text-yellow-400 animate-sparkle" style={{ animationDelay: "0.5s" }}>&#10022;</div>
                </>
              )}
            </div>
            <p className="font-mono text-xs font-bold text-white mt-1 truncate">
              {defender.name}
            </p>
            <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-mono bg-gray-800 text-gray-400">
              {defender.role}
            </span>
            {/* HP bar */}
            <div className="mt-1 px-1">
              <div className="flex justify-between text-[10px] font-mono text-gray-500 mb-0.5">
                <span>HP</span>
                <span>
                  {Math.round(currentDefenderHp)}/{Math.round(defenderMaxHp)}
                </span>
              </div>
              <div className={`w-full bg-gray-700 rounded-full h-2 overflow-hidden ${hpBarGlow(defenderHpPct)}`}>
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${hpColor(defenderHpPct)}`}
                  style={{ width: `${defenderHpPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Round log */}
        <div
          ref={roundLogRef}
          className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1 scrollbar-thin"
        >
          {battleLog.rounds.slice(0, visibleRounds).map((round) => {
            const firstIsAttacker = round.firstAttacker === attacker.id;
            const firstName = firstIsAttacker ? attacker.name : defender.name;
            const secondName = firstIsAttacker ? defender.name : attacker.name;

            return (
              <div
                key={round.roundNumber}
                className="bg-gray-800/60 border border-gray-700/50 rounded px-2 py-1.5 animate-fadeIn"
              >
                <div className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="font-bold text-purple-400 bg-purple-900/30 px-1 py-0.5 rounded shrink-0">
                    R{round.roundNumber}
                  </span>
                  <span className="text-gray-500 shrink-0">{round.category}</span>
                  <span className="text-gray-300">
                    <span className="text-white">{firstName}</span>{" "}
                    <span className="text-red-400">-{round.firstDamage}</span>
                    {round.secondDamage > 0 && (
                      <>
                        <span className="text-gray-600"> / </span>
                        <span className="text-white">{secondName}</span>{" "}
                        <span className="text-red-400">-{round.secondDamage}</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Victory banner */}
      {showVictory && (
        <div className="mt-3 text-center animate-victoryBounce">
          <span className="font-mono font-black text-2xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400 drop-shadow-lg">
            VICTORY
          </span>
          <span className="font-mono text-sm text-white ml-2">
            <span className="text-yellow-400">{winner.name}</span> wins!
          </span>
        </div>
      )}
    </div>
  );
}
