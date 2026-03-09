"use client";

import { useState, useEffect } from "react";
import { useGame } from "@/components/GameProvider";
import { SummonForm } from "@/components/SummonForm";
import { SUMMON_COOLDOWN_DAYS, SUMMON_COST_SOL } from "@/lib/constants";
import { useRouter } from "next/navigation";

function formatCountdown(ms: number) {
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((ms % (60 * 1000)) / 1000);
  return { days, hours, minutes, seconds };
}

export default function SummonPage() {
  const { player, loading } = useGame();
  const router = useRouter();
  const [bypassCooldown, setBypassCooldown] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!loading && !player) router.push("/");
  }, [loading, player, router]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading || !player) return null;

  const cooldownMs = SUMMON_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const canSummon =
    !player.lastSummonAt ||
    now - new Date(player.lastSummonAt).getTime() > cooldownMs;

  if (!canSummon && !bypassCooldown) {
    const timeLeft =
      new Date(player.lastSummonAt!).getTime() + cooldownMs - now;
    const { days, hours, minutes, seconds } = formatCountdown(timeLeft);

    return (
      <main className="min-h-screen bg-gray-950 text-white p-6 pb-24 max-w-2xl mx-auto">
        <h1 className="text-2xl font-mono font-bold mb-6 text-center">Summon New Agent</h1>

        <div className="space-y-4">
          {/* Option 1: Wait */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
            <p className="text-[10px] font-mono text-gray-500 tracking-wider uppercase mb-2">Option 1</p>
            <h2 className="text-lg font-mono font-bold text-white mb-3">Wait for Free Summon</h2>
            <p className="text-gray-400 font-mono text-xs mb-4">
              Free summon every {SUMMON_COOLDOWN_DAYS} days
            </p>

            {/* Countdown Timer */}
            <div className="flex items-center justify-center gap-3">
              {[
                { value: days, label: "DAYS" },
                { value: hours, label: "HRS" },
                { value: minutes, label: "MIN" },
                { value: seconds, label: "SEC" },
              ].map(({ value, label }) => (
                <div key={label} className="flex flex-col items-center">
                  <div className="w-14 h-14 bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center">
                    <span className="text-yellow-400 font-mono text-xl font-bold">
                      {String(value).padStart(2, "0")}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-gray-600 mt-1 tracking-wider">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 border-t border-gray-800" />
            <span className="text-gray-600 font-mono text-xs">OR</span>
            <div className="flex-1 border-t border-gray-800" />
          </div>

          {/* Option 2: Pay SOL */}
          <div className="bg-gray-900 border border-purple-900/30 rounded-lg p-6 text-center">
            <p className="text-[10px] font-mono text-gray-500 tracking-wider uppercase mb-2">Option 2</p>
            <h2 className="text-lg font-mono font-bold text-white mb-2">Pay to Summon Now</h2>
            <p className="text-gray-400 font-mono text-sm mb-4">
              Skip the cooldown and summon immediately
            </p>
            <button
              onClick={() => setBypassCooldown(true)}
              className="px-6 py-3 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-lg font-mono font-bold text-sm tracking-wider hover:bg-purple-500/20 hover:border-purple-500/50 active:scale-[0.98] transition-all"
            >
              Summon Agent ({SUMMON_COST_SOL} SOL)
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 pb-24 max-w-2xl mx-auto">
      <h1 className="text-2xl font-mono font-bold mb-2">Summon New Agent</h1>
      {canSummon && (
        <p className="text-green-400 font-mono text-xs mb-6 animate-pulse">
          Free summon available!
        </p>
      )}
      <SummonForm free={canSummon} />
    </main>
  );
}
