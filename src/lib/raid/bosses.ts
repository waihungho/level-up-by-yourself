import { CYCLE } from "@/lib/tactical/constants";
import { toSide } from "@/lib/tactical/engine";
import type { Category } from "@/lib/tactical/types";
import type { AgentWithDimensions, RoleCategory } from "@/lib/types";

export interface BossDef {
  key: string;
  name: string;
  lore: string;
  profile: Record<Category, number>;
  weak: Category;
  p2Weak: Category;
  resist: Category;
  role: RoleCategory;
  spriteSeed: Record<string, number>;
}

export interface BossStats {
  catAvg: Record<Category, number>;
  speed: number;
}

/** Weekly rotation order. */
export const BOSSES: BossDef[] = [
  {
    key: "iron-colossus",
    name: "Iron Colossus",
    lore: "A siege engine that woke up angry. Steel fists, steam lungs, no mercy.",
    profile: { Physical: 1.3, Technical: 1.3, Mental: 0.9, Spiritual: 0.9, Social: 0.8 },
    weak: "Social",
    p2Weak: "Mental",
    resist: "Physical",
    role: "medieval",
    spriteSeed: { bodyType: 3, headType: 7, eyeType: 2, weaponType: 5, auraType: 4, colorSeed: 12 },
  },
  {
    key: "mind-leviathan",
    name: "Mind Leviathan",
    lore: "It thinks in tides. Every thought it has drowns someone else's.",
    profile: { Physical: 0.9, Technical: 1.0, Mental: 1.4, Spiritual: 1.0, Social: 0.9 },
    weak: "Technical",
    p2Weak: "Social",
    resist: "Mental",
    role: "modern",
    spriteSeed: { bodyType: 11, headType: 2, eyeType: 9, weaponType: 1, auraType: 7, colorSeed: 205 },
  },
  {
    key: "hollow-choir",
    name: "Hollow Choir",
    lore: "A thousand voices with no throats. They sing you into agreeing.",
    profile: { Physical: 0.9, Technical: 0.9, Mental: 1.0, Spiritual: 1.0, Social: 1.4 },
    weak: "Spiritual",
    p2Weak: "Physical",
    resist: "Social",
    role: "modern",
    spriteSeed: { bodyType: 6, headType: 14, eyeType: 4, weaponType: 9, auraType: 2, colorSeed: 301 },
  },
  {
    key: "void-oracle",
    name: "Void Oracle",
    lore: "It has already seen how this fight ends. It did not like your part.",
    profile: { Physical: 0.9, Technical: 0.9, Mental: 1.0, Spiritual: 1.4, Social: 1.0 },
    weak: "Mental",
    p2Weak: "Technical",
    resist: "Spiritual",
    role: "medieval",
    spriteSeed: { bodyType: 17, headType: 9, eyeType: 13, weaponType: 3, auraType: 11, colorSeed: 270 },
  },
  {
    key: "rogue-singularity",
    name: "Rogue Singularity",
    lore: "An optimizer that optimized away its off switch. You are inefficient.",
    profile: { Physical: 0.9, Technical: 1.4, Mental: 1.0, Spiritual: 0.9, Social: 1.0 },
    weak: "Physical",
    p2Weak: "Spiritual",
    resist: "Technical",
    role: "future",
    spriteSeed: { bodyType: 8, headType: 18, eyeType: 6, weaponType: 12, auraType: 15, colorSeed: 180 },
  },
];

export function bossForWeek(index: number): BossDef {
  return BOSSES[((index % BOSSES.length) + BOSSES.length) % BOSSES.length];
}

export function bossByKey(key: string): BossDef | undefined {
  return BOSSES.find((b) => b.key === key);
}

const FALLBACK_STAT = 150;

function p75(values: number[]): number {
  if (!values.length) return FALLBACK_STAT;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)]; // nearest-rank
}

/** Boss stats track the stronger end of the current playerbase. */
export function computeBossStats(agents: AgentWithDimensions[], def: BossDef): BossStats {
  const sides = agents.filter((a) => a.dimensions.length).map((a) => toSide(a));
  const catAvg = {} as Record<Category, number>;
  for (const c of CYCLE) catAvg[c] = p75(sides.map((s) => s.catAvg[c])) * def.profile[c];
  return { catAvg, speed: p75(sides.map((s) => s.speed)) };
}
