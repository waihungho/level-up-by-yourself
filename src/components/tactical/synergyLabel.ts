import {
  SYNERGY_LEGION,
  SYNERGY_LEGION_OFF,
  SYNERGY_PAIR,
  SYNERGY_TRINITY,
} from "@/lib/tactical/constants";
import type { Synergy } from "@/lib/tactical/squad";

const pct = (m: number) => `${m >= 1 ? "+" : "−"}${Math.round(Math.abs(m - 1) * 100)}%`;

export function synergyLabel(s: Synergy): string {
  if (s.name === "trinity") return `Trinity ${pct(SYNERGY_TRINITY)}`;
  if (s.name === "pair") return `Pair (${s.role}) ${pct(SYNERGY_PAIR)}`;
  if (s.name === "legion") return `Legion (${s.role}) ${pct(SYNERGY_LEGION)} / ${pct(SYNERGY_LEGION_OFF)}`;
  return "No synergy";
}
