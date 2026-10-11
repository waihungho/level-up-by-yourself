const AURA_COLORS: Record<string, string> = {
  ember: "rgba(249,115,22,0.9)",
  frost: "rgba(56,189,248,0.9)",
  venom: "rgba(74,222,128,0.9)",
  storm: "rgba(250,204,21,0.9)",
  holy: "rgba(255,255,255,0.95)",
  void: "rgba(168,85,247,0.95)",
};

const NAME_COLORS: Record<string, string> = {
  gold: "text-yellow-300",
  crimson: "text-red-400",
  azure: "text-sky-300",
  emerald: "text-emerald-300",
  violet: "text-violet-300",
  rainbow: "bg-gradient-to-r from-red-400 via-yellow-300 to-sky-400 bg-clip-text text-transparent",
};

/** CSS filter for an agent's aura (glow around the sprite), or undefined when it has none. */
export function auraStyle(aura: string | undefined): string | undefined {
  const color = aura ? AURA_COLORS[aura] : undefined;
  return color ? `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color})` : undefined;
}

/** Tailwind classes for a bought name colour ("" when none). */
export function nameColorClass(color: string | undefined): string {
  return (color && NAME_COLORS[color]) || "";
}

export const AURA_SWATCH = AURA_COLORS;
