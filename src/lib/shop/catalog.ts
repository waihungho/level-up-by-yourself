import { DIMENSIONS } from "@/lib/constants";
import { CYCLE, ROLE_CATEGORY } from "@/lib/tactical/constants";
import type { Category } from "@/lib/tactical/types";
import type { RoleCategory } from "@/lib/types";

// ---------------------------------------------------------------------------
// Gem packs (bought with SOL, verified on-chain)
// ---------------------------------------------------------------------------

export type PackId = "starter" | "standard" | "big" | "whale";

export const GEM_PACKS: Record<PackId, { sol: number; gems: number; label: string }> = {
  starter: { sol: 0.05, gems: 50, label: "Starter" },
  standard: { sol: 0.1, gems: 110, label: "Standard" },
  big: { sol: 0.25, gems: 300, label: "Big" },
  whale: { sol: 0.5, gems: 650, label: "Whale" },
};

export function isPackId(id: string): id is PackId {
  return Object.hasOwn(GEM_PACKS, id);
}

// ---------------------------------------------------------------------------
// Items (bought with gems)
// ---------------------------------------------------------------------------

export type ItemKind = "elixir" | "scroll" | "refill" | "ticket" | "aura" | "namecolor" | "title";
export type AttemptMode = "training" | "pvp" | "squad_pvp" | "raid";

export interface ShopItem {
  id: string;
  name: string;
  kind: ItemKind;
  target: "agent" | "player";
  price: number;
  description: string;
  /** Elixirs: the category boosted (absent = all categories, the grand elixir). */
  category?: Category;
  /** Elixirs: stat points added to each affected dimension. */
  perDim?: number;
  /** Refills/tickets: which daily limit they raise, and by how much. */
  mode?: AttemptMode;
  extra?: number;
  /** Cosmetics/titles: the stored value. */
  value?: string;
}

const CATEGORY_ELIXIRS: ShopItem[] = CYCLE.map((c) => ({
  id: `elixir_${c.toLowerCase()}`,
  name: `${c} Elixir`,
  kind: "elixir",
  target: "agent",
  price: 30,
  category: c,
  perDim: 3,
  description: `+3 to every ${c} stat, permanently.`,
}));

export const AURA_STYLES = ["ember", "frost", "venom", "storm", "holy", "void"] as const;
export const NAME_COLORS = ["gold", "crimson", "azure", "emerald", "violet", "rainbow"] as const;
export const TITLES = { patron: "Patron", dragon_slayer: "Dragon Slayer", whale: "Whale" } as const;

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export const SHOP_ITEMS: ShopItem[] = [
  ...CATEGORY_ELIXIRS,
  { id: "elixir_grand", name: "Grand Elixir", kind: "elixir", target: "agent", price: 80, perDim: 2, description: "+2 to all 50 stats, permanently." },
  { id: "scroll_growth", name: "Training Scroll", kind: "scroll", target: "agent", price: 60, description: "Doubles daily growth for 7 days. Stacks by extending." },
  { id: "refill_training", name: "Training Refill", kind: "refill", target: "agent", price: 40, mode: "training", description: "Resets today's 3 training fights." },
  { id: "refill_pvp", name: "PvP Refill", kind: "refill", target: "agent", price: 40, mode: "pvp", extra: 3, description: "+3 PvP fights today." },
  { id: "ticket_squad", name: "Squad Ticket", kind: "ticket", target: "player", price: 30, mode: "squad_pvp", extra: 1, description: "+1 squad battle today." },
  { id: "ticket_raid", name: "Raid Ticket", kind: "ticket", target: "player", price: 50, mode: "raid", extra: 1, description: "+1 raid attempt today." },
  ...AURA_STYLES.map<ShopItem>((s) => ({ id: `aura_${s}`, name: `${cap(s)} Aura`, kind: "aura", target: "agent", price: 100, value: s, description: "A permanent glow around your agent." })),
  ...NAME_COLORS.map<ShopItem>((c) => ({ id: `namecolor_${c}`, name: `${cap(c)} Name`, kind: "namecolor", target: "agent", price: 50, value: c, description: "Your agent's name in colour, everywhere." })),
  ...(Object.entries(TITLES) as [string, string][]).map<ShopItem>(([id, label]) => ({
    id: `title_${id}`,
    name: `Title: ${label}`,
    kind: "title",
    target: "player",
    price: 150,
    value: id,
    description: "Shown next to your wallet on rankings and raid boards.",
  })),
];

const BY_ID = new Map(SHOP_ITEMS.map((i) => [i.id, i]));

export function getItem(id: string): ShopItem | undefined {
  return BY_ID.get(id);
}

/** Dimension deltas an elixir applies: perDim to each dimension of its category (or all, for the grand elixir). */
export function elixirGrowth(item: ShopItem): Record<number, number> {
  const dims = item.category ? DIMENSIONS.filter((d) => d.category === item.category) : DIMENSIONS;
  return Object.fromEntries(dims.map((d) => [d.id, item.perDim ?? 0]));
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

export const GEAR_SLOTS = ["weapon", "armor", "relic"] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];
/** Level per slot; a missing slot means no gear. */
export type Gear = Partial<Record<GearSlot, number>>;
export type GearTier = "bronze" | "silver" | "gold" | "mythic";

/** Gems to reach `nextLevel` (no level cap). */
export function gearUpgradeCost(nextLevel: number): number {
  return 20 + 10 * nextLevel;
}

export function gearTier(level: number): GearTier | null {
  if (level <= 0) return null;
  if (level < 5) return "bronze";
  if (level < 10) return "silver";
  if (level < 20) return "gold";
  return "mythic";
}

export function isGearSlot(s: string): s is GearSlot {
  return (GEAR_SLOTS as readonly string[]).includes(s);
}

/**
 * Battle-time bonuses: weapon +3·L to the role category, armor +1·L to every category,
 * relic +2·L speed and +1·L Social (feint chance; still clamped by FEINT_MAX).
 */
export function gearBonus(role: RoleCategory, gear: Gear): { catAvg: Record<Category, number>; speed: number } {
  const weapon = gear.weapon ?? 0;
  const armor = gear.armor ?? 0;
  const relic = gear.relic ?? 0;
  const catAvg = Object.fromEntries(CYCLE.map((c) => [c, armor])) as Record<Category, number>;
  catAvg[ROLE_CATEGORY[role]] += 3 * weapon;
  catAvg.Social += relic;
  return { catAvg, speed: 2 * relic };
}
