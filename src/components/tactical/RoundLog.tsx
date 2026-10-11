import type { TacticalRound } from "@/lib/tactical/types";

interface RoundLogProps {
  rounds: TacticalRound[];
  attackerName: string;
  defenderName: string;
}

function describe(r: TacticalRound, me: string): string {
  if (r.playerAction === "stunned") return `${me} is stunned`;
  if (r.playerAction === "swap") return r.special ? `Tag! ${r.special}` : "Swapped in";
  if (r.playerAction === "guard") return `${me} guards`;
  if (r.playerAction === "special") return `${me} uses ${r.special}`;
  return `${me} strikes ${r.actionCategory}`;
}

export function RoundLog({ rounds, attackerName, defenderName }: RoundLogProps) {
  if (!rounds.length) return null;
  return (
    <ol className="space-y-1 max-h-40 overflow-y-auto" aria-label="Round log">
      {[...rounds].reverse().map((r) => (
          <li key={r.roundNumber} className="font-mono text-[10px] text-gray-400 bg-gray-900/60 border border-gray-800 rounded px-2 py-1">
            <span className="text-gray-600">R{r.roundNumber}</span> {describe(r, attackerName)} · {defenderName}: {r.opponentAction}
            {r.feint && <span className="ml-1 text-amber-400">(feint!)</span>}
            {r.countered && <span className="ml-1 px-1 rounded bg-yellow-500/20 text-yellow-300 font-bold">COUNTER!</span>}
            {r.counteredBy && <span className="ml-1 px-1 rounded bg-red-500/20 text-red-300 font-bold">COUNTERED</span>}
          </li>
      ))}
    </ol>
  );
}
