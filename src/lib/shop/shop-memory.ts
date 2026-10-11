import type { AttemptMode, Gear } from "./catalog";
import type { Cosmetics } from "./shop-read";

/** Demo-mode (no Supabase) stores for the shop; tests reset them with resetShopMemory(). */
export const shopMem = {
  balances: new Map<string, number>(),
  refs: new Set<string>(),
  purchases: new Set<string>(),
  /** agentId → growth buff expiry (ISO) */
  buffs: new Map<string, string>(),
  bonuses: [] as { playerId: string; agentId: string | null; mode: AttemptMode; extra: number; day: string }[],
  cosmetics: new Map<string, Cosmetics>(),
  /** playerId → title id */
  titles: new Map<string, string>(),
  gear: new Map<string, Gear>(),
};

export function resetShopMemory(): void {
  shopMem.balances.clear();
  shopMem.refs.clear();
  shopMem.purchases.clear();
  shopMem.buffs.clear();
  shopMem.bonuses = [];
  shopMem.cosmetics.clear();
  shopMem.titles.clear();
  shopMem.gear.clear();
}
