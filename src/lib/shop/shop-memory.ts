/** Demo-mode (no Supabase) stores for the shop; tests reset them with resetShopMemory(). */
export const shopMem = {
  balances: new Map<string, number>(),
  refs: new Set<string>(),
  purchases: new Set<string>(),
  buffs: new Map<string, string>(), // agentId -> growth buff expires_at ISO
  bonuses: [] as { playerId: string; agentId: string | null; mode: string; extra: number; day: string }[],
  cosmetics: new Map<string, Record<string, string>>(), // agentId -> { aura, namecolor }
  titles: new Map<string, string>(), // playerId -> title id
  gear: new Map<string, Record<string, number>>(), // agentId -> { weapon, armor, relic }
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
