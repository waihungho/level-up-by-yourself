import Link from "next/link";
import { PixelSprite } from "@/components/PixelSprite";
import type { BlinkChallenge } from "@/lib/blinks/challenge-read";
import { challengePageUrl, dialToUrl, shareText, xIntentUrl } from "@/lib/blinks/links";
import type { RoleCategory } from "@/lib/types";

const ROLE_COLORS: Record<RoleCategory, string> = {
  future: "border-purple-700 bg-purple-900/30",
  modern: "border-blue-700 bg-blue-900/30",
  medieval: "border-amber-700 bg-amber-900/30",
};

export interface ChallengeViewProps {
  agent: { id: string; name: string; role: RoleCategory; roleTitle: string; spriteSeed: Record<string, unknown> };
  weaponTint?: string;
  /** Total Power: sum of all 50 dimensions. */
  power: number;
  record: { wins: number; losses: number };
  recent: BlinkChallenge[];
  origin: string;
  now: number;
}

function timeAgo(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

const shortWallet = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

/** The public challenge page body: agent card, record, recent fights and the share/fight links. */
export function ChallengeView({ agent, weaponTint, power, record, recent, origin, now }: ChallengeViewProps) {
  const pageUrl = challengePageUrl(origin, agent.id);
  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-6 pb-32 max-w-md mx-auto font-mono">
      <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Blink challenge</p>

      <section className={`border rounded p-4 mb-4 ${ROLE_COLORS[agent.role]}`}>
        <div className="flex gap-4 items-center">
          <PixelSprite spriteSeed={agent.spriteSeed as Record<string, number>} role={agent.role} size={80} weaponTint={weaponTint} />
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{agent.name}</h1>
            <p className="text-sm text-gray-400">
              {agent.roleTitle} &middot; {agent.role}
            </p>
            <p className="text-sm mt-1">
              <span className="text-gray-500">Total Power </span>
              <span className="text-yellow-300 font-bold">{power}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-2 mb-6">
        <a
          href={dialToUrl(origin, agent.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center rounded bg-red-600 hover:bg-red-500 py-3 font-bold"
        >
          Fight in Blink ⚔
        </a>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={xIntentUrl(shareText(agent.name), pageUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center rounded border border-gray-700 hover:border-gray-500 py-2 text-sm"
          >
            Share on X
          </a>
          <Link href="/" className="block text-center rounded border border-purple-700 hover:border-purple-500 text-purple-300 py-2 text-sm">
            Play Level Up
          </Link>
        </div>
        <p className="text-xs text-gray-500 text-center">Exhibition fight. You only pay the network fee.</p>
      </section>

      <section className="bg-gray-900 border border-gray-800 rounded p-4 mb-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm text-gray-500">Record vs challengers</h2>
          <span className="font-bold">{`${record.wins}W – ${record.losses}L`}</span>
        </div>
      </section>

      <section className="bg-gray-900 border border-gray-800 rounded p-4">
        <h2 className="text-sm text-gray-500 mb-3">Recent challenges</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-400">No challengers yet. Be the first!</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((c) => {
              const defended = c.winner === "defender";
              return (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className={defended ? "text-green-400" : "text-red-400"}>{defended ? "Won" : "Lost"}</span>
                    <span className="text-gray-400">
                      {" "}vs {c.summary.challengerName} ({shortWallet(c.challengerWallet)})
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {c.summary.rounds}r &middot; {timeAgo(c.createdAt, now)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
