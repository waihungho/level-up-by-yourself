import { getAgentFightsToday, getAgentWithDimensions, getPlayerAgents, getPlayerByWallet } from "@/lib/db";
import { getWriteClient } from "@/lib/supabase-admin";
import { fail, type ServiceResult } from "@/lib/tactical/service-common";
import { recordRecharge } from "@/lib/tactical/recharge-service";
import type { Player } from "@/lib/types";
import { elixirGrowth, gemPackMemo, GEM_PACKS, getItem, isPackId, SHOP_ITEMS, type ShopItem } from "./catalog";
import { applyGems, getGemBalance, InsufficientGemsError } from "./gems";
import { addAttemptBonus, AlreadyOwnedError, applyGrowthAtomic, getAgentBonusesToday, extendGrowthBuff, getTitles, grantTitle, setCosmetic } from "./shop-db";
import { shopMem } from "./shop-memory";

export interface PaymentVerifier {
  verify: (input: { signature: string; payer: string; minSol: number; memo?: string }) => Promise<boolean>;
}

const SCROLL_DAYS = 7;
const PURCHASE_ID = /^[A-Za-z0-9_-]{8,64}$/;

async function recordPackPurchase(input: { signature: string; playerId: string; packId: string; sol: number; gems: number }): Promise<void> {
  const sb = getWriteClient();
  if (sb) {
    const { error } = await sb.from("levelup_gem_purchases").upsert(
      { tx_signature: input.signature, player_id: input.playerId, pack_id: input.packId, sol: input.sol, gems: input.gems },
      { onConflict: "tx_signature", ignoreDuplicates: true }
    );
    if (error) throw error;
    return;
  }
  shopMem.purchases.add(input.signature);
}

/** Verifies a SOL payment for a gem pack on-chain and credits the gems exactly once per signature. */
export async function buyGemPack(
  input: { walletAddress?: string; packId?: string; signature?: string },
  deps: PaymentVerifier
): Promise<ServiceResult> {
  const { walletAddress, packId, signature } = input;
  if (!walletAddress || !packId || !signature) return fail(400, "missing_fields");
  if (!isPackId(packId)) return fail(400, "invalid_item");
  const player = await getPlayerByWallet(walletAddress);
  if (!player) return fail(403, "not_owner");

  const pack = GEM_PACKS[packId];
  if (!(await deps.verify({ signature, payer: walletAddress, minSol: pack.sol, memo: gemPackMemo(packId) }))) return fail(402, "payment_invalid");

  // The ledger ref makes the credit idempotent; the purchase row is the payment record.
  const { balance, applied } = await applyGems({ playerId: player.id, delta: pack.gems, reason: `pack:${packId}`, ref: `pack:${signature}` });
  await recordPackPurchase({ signature, playerId: player.id, packId, sol: pack.sol, gems: pack.gems });
  if (!applied) return { status: 409, body: { error: "signature_used", balance } };
  return { status: 200, body: { balance, gems: pack.gems } };
}

/** Applies a bought item's effect. Throws to trigger a refund. */
async function applyEffect(item: ShopItem, player: Player, agentId: string | null, purchaseId: string): Promise<string> {
  switch (item.kind) {
    case "elixir":
      await applyGrowthAtomic(agentId!, elixirGrowth(item));
      return item.category ? `+${item.perDim} to every ${item.category} stat` : `+${item.perDim} to all stats`;
    case "scroll": {
      const until = await extendGrowthBuff(agentId!, SCROLL_DAYS);
      return `Double growth until ${until.slice(0, 10)}`;
    }
    case "refill":
      if (item.mode === "training") {
        await recordRecharge({ agentId: agentId!, playerId: player.id, ref: `gems:${purchaseId}` });
        return "Training fights reset";
      }
      await addAttemptBonus({ playerId: player.id, agentId, mode: item.mode!, extra: item.extra! });
      return `+${item.extra} ${item.mode === "pvp" ? "PvP fights" : "attempts"} today`;
    case "ticket":
      await addAttemptBonus({ playerId: player.id, agentId: null, mode: item.mode!, extra: item.extra! });
      return `+${item.extra} ${item.mode === "raid" ? "raid attempt" : "squad battle"} today`;
    case "aura":
    case "namecolor":
      await setCosmetic(agentId!, item.kind, item.value!);
      return `${item.name} equipped`;
    case "title":
      await grantTitle(player.id, item.value!);
      return `${item.name} unlocked`;
  }
}

/**
 * Spends gems on an item. The purchaseId (client-generated) makes the purchase idempotent: a retry
 * with the same id never charges or applies twice. If applying the effect fails, the gems are refunded.
 */
export async function buyItem(input: { walletAddress?: string; itemId?: string; agentId?: string; purchaseId?: string }): Promise<ServiceResult> {
  const { walletAddress, itemId, purchaseId } = input;
  if (!walletAddress || !itemId || !purchaseId || !PURCHASE_ID.test(purchaseId)) return fail(400, "missing_fields");
  const item = getItem(itemId);
  if (!item) return fail(400, "invalid_item");
  const player = await getPlayerByWallet(walletAddress);
  if (!player) return fail(403, "not_owner");

  let agentId: string | null = null;
  if (item.target === "agent") {
    if (!input.agentId) return fail(400, "missing_fields");
    const agent = await getAgentWithDimensions(input.agentId);
    if (!agent || agent.playerId !== player.id) return fail(403, "not_owner");
    agentId = agent.id;
  }
  if (item.kind === "title" && (await getTitles([player.id]))[player.id] === item.value) return fail(409, "already_owned");
  if (item.id === "refill_training" && (await getAgentFightsToday(agentId!)) === 0) return fail(409, "nothing_to_refill");

  let charged: { balance: number; applied: boolean };
  try {
    charged = await applyGems({ playerId: player.id, delta: -item.price, reason: `buy:${item.id}`, ref: `buy:${purchaseId}` });
  } catch (e) {
    if (e instanceof InsufficientGemsError) return { status: 402, body: { error: "insufficient_gems", balance: await getGemBalance(player.id) } };
    throw e;
  }
  if (!charged.applied) return { status: 200, body: { balance: charged.balance, duplicate: true } };

  try {
    const effect = await applyEffect(item, player, agentId, purchaseId);
    return { status: 200, body: { balance: charged.balance, itemId: item.id, agentId, effect } };
  } catch (e) {
    const refund = await applyGems({ playerId: player.id, delta: item.price, reason: `refund:${item.id}`, ref: `refund:${purchaseId}` });
    if (e instanceof AlreadyOwnedError) return { status: 409, body: { error: "already_owned", balance: refund.balance } };
    throw e;
  }
}

export async function getShopView(input: { walletAddress?: string }): Promise<ServiceResult> {
  if (!input.walletAddress) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(input.walletAddress);
  if (!player) return fail(403, "not_owner");
  const [balance, titles] = await Promise.all([getGemBalance(player.id), getTitles([player.id])]);
  return { status: 200, body: { balance, title: titles[player.id] ?? null, packs: GEM_PACKS, items: SHOP_ITEMS } };
}

/** Today's bought PvP fights per agent, so the battle page shows and allows them. */
export async function getLimitsView(input: { walletAddress?: string }): Promise<ServiceResult> {
  if (!input.walletAddress) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(input.walletAddress);
  if (!player) return fail(403, "not_owner");
  const agents = await getPlayerAgents(player.id);
  return { status: 200, body: { pvpBonus: await getAgentBonusesToday(agents.map((a) => a.id), "pvp") } };
}
