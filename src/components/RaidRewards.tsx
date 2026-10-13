import { EXPIRED_REWARD_FACTOR, LAST_HIT_ABILITY, REWARD_TIERS, REWARDS, tierForRank, type RewardTier } from "@/lib/raid/rewards";
import type { Category } from "@/lib/tactical/types";

export const TIER_ICON: Record<RewardTier, string> = { champion: "👑", elite: "🥈", vanguard: "🛡", participant: "🎖" };

/** What each damage rank earns when the boss falls (half if it escapes). */
export function RaidRewards({ weakness, myRank }: { weakness: Category; myRank: number | null }) {
  const myTier = myRank ? tierForRank(myRank) : null;
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg p-4" aria-labelledby="raid-rewards">
      <h2 id="raid-rewards" className="font-mono font-bold text-sm mb-2">
        Rewards
      </h2>
      <ul className="space-y-1">
        {REWARD_TIERS.map(({ tier, label, ranks }) => {
          const r = REWARDS[tier];
          const mine = tier === myTier;
          return (
            <li
              key={tier}
              className={`flex flex-wrap justify-between gap-x-2 font-mono text-xs px-2 py-1 rounded ${mine ? "bg-purple-900/30 text-white" : "text-gray-300"}`}
            >
              <span>
                <span aria-hidden="true">{TIER_ICON[tier]}</span> {label} <span className="text-gray-500">{ranks}</span>
                {mine && <span className="ml-1 text-purple-300">(you)</span>}
              </span>
              <span className="text-right">
                +{r.ability} Ability · <span className="text-green-300">+{r.growthTotal} {weakness}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="font-mono text-[10px] text-gray-500 mt-2 leading-relaxed">
        🗡 Last hit: +{LAST_HIT_ABILITY} Ability and a Slayer trophy. Top 10 earn a trophy. {weakness} growth goes to every agent in your
        squad. If the boss escapes, everyone gets {EXPIRED_REWARD_FACTOR * 100}%.
      </p>
    </section>
  );
}
