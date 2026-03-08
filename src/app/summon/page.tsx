"use client";

import { useGame } from "@/components/GameProvider";
import { SummonForm } from "@/components/SummonForm";
import { SUMMON_COOLDOWN_DAYS } from "@/lib/constants";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SummonPage() {
  const { player, loading } = useGame();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !player) router.push("/");
  }, [loading, player, router]);

  if (loading || !player) return null;

  const canSummon =
    !player.lastSummonAt ||
    Date.now() - new Date(player.lastSummonAt).getTime() >
      SUMMON_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

  if (!canSummon) {
    const timeLeft =
      new Date(player.lastSummonAt!).getTime() +
      SUMMON_COOLDOWN_DAYS * 24 * 60 * 60 * 1000 -
      Date.now();
    const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
    const hours = Math.floor(
      (timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
    );

    return (
      <main className="min-h-screen bg-gray-950 text-white p-6 max-w-2xl mx-auto flex flex-col items-center justify-center">
        <h1 className="text-2xl font-mono font-bold mb-4">Summon Cooldown</h1>
        <p className="text-gray-400 font-mono mb-2">
          You can summon once every {SUMMON_COOLDOWN_DAYS} days.
        </p>
        <p className="text-yellow-400 font-mono text-xl">
          {days}d {hours}h remaining
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 pb-24 max-w-2xl mx-auto">
      <h1 className="text-2xl font-mono font-bold mb-6">Summon New Agent</h1>
      <SummonForm />
    </main>
  );
}
