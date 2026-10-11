import type { TrophyTier } from "@/lib/raid/raid-db";

const TIERS: { tier: TrophyTier; icon: string; name: string; style: string }[] = [
  { tier: "champion", icon: "👑", name: "Champion", style: "border-yellow-500/60 bg-yellow-900/30 text-yellow-300" },
  { tier: "slayer", icon: "🗡", name: "Slayer", style: "border-red-500/60 bg-red-900/30 text-red-300" },
  { tier: "elite", icon: "🥈", name: "Elite", style: "border-gray-400/60 bg-gray-800 text-gray-200" },
  { tier: "vanguard", icon: "🛡", name: "Vanguard", style: "border-cyan-600/60 bg-cyan-900/30 text-cyan-300" },
];

export function TrophyBadges({ trophies }: { trophies: { tier: TrophyTier }[] }) {
  const counts = TIERS.map((t) => ({ ...t, n: trophies.filter((x) => x.tier === t.tier).length })).filter((t) => t.n > 0);
  if (!counts.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {counts.map((t) => (
        <span
          key={t.tier}
          aria-label={`${t.n} ${t.name} ${t.n === 1 ? "trophy" : "trophies"}`}
          title={`${t.name} (raid)`}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[10px] ${t.style}`}
        >
          {t.icon} {t.n}
        </span>
      ))}
    </div>
  );
}
