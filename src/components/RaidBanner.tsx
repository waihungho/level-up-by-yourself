"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SlainOverlay } from "@/components/SlainOverlay";
import type { RaidView } from "@/hooks/useRaidLive";

/** Dashboard call-to-action for the weekly boss; shows the kill cinematic once after it falls. */
export function RaidBanner() {
  const [view, setView] = useState<RaidView | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/raid")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setView(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const boss = view?.boss;
  const def = view?.def;
  if (!boss || !def || boss.status === "expired") return null;

  if (boss.status === "defeated") {
    return (
      <>
        <SlainOverlay bossId={boss.id} bossName={def.name} />
        <Link href="/raid" className="block mb-4 rounded-lg border border-yellow-700/60 bg-gray-900 p-3 hover:border-yellow-500 transition-colors">
          <span className="font-mono text-sm font-bold text-yellow-300">🏆 {def.name} was slain by {view?.participants ?? 0} raiders!</span>
          <p className="font-mono text-[10px] text-gray-400 mt-1">See the leaderboard · next boss arrives Monday</p>
        </Link>
      </>
    );
  }

  const pct = Math.round((boss.hpRemaining / boss.maxHp) * 100);
  return (
    <Link
      href="/raid"
      className="block mb-4 rounded-lg border border-red-700/60 bg-gradient-to-r from-red-950 to-gray-900 p-3 hover:border-red-500 transition-colors"
    >
      <div className="flex items-center justify-between font-mono">
        <span className="text-sm font-bold text-red-300">🐉 {def.name} is attacking!</span>
        <span className="text-xs text-gray-300">{pct}% HP</span>
      </div>
      <div className="h-2 mt-2 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-red-600" style={{ width: `${pct}%` }} />
      </div>
      <p className="font-mono text-[10px] text-gray-400 mt-1">{view?.participants ?? 0} raiders · tap to join the raid</p>
    </Link>
  );
}
