/** "✦ SHINY" tag for agents whose id makes them shiny (see `@/lib/shiny`). Cosmetic only. */
export function ShinyBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Shiny variant: 1 in 64 agents. Cosmetic only."
      className={`text-xs px-2 py-0.5 rounded font-mono font-bold bg-yellow-900/60 text-yellow-300 border border-yellow-600/60 ${className}`}
    >
      ✦ SHINY
    </span>
  );
}
