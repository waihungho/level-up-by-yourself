import { getAgentWithDimensions, getPlayerByWallet } from "@/lib/db";
import { fail, type ServiceResult } from "@/lib/tactical/service-common";
import { gearUpgradeCost, isGearSlot, isValidPurchaseId } from "./catalog";
import { readGearLevel, upgradeGearLevel } from "./gear-db";
import { applyGems, getGemBalance, InsufficientGemsError } from "./gems";
import { refundGems } from "./shop-service";

/**
 * Buys the next level of a gear slot (no cap). The purchaseId makes it idempotent; if another
 * upgrade of the same slot wins the race, this one is refunded.
 */
export async function upgradeGear(input: { walletAddress?: string; agentId?: string; slot?: string; purchaseId?: string }): Promise<ServiceResult> {
  const { walletAddress, agentId, slot, purchaseId } = input;
  if (!walletAddress || !agentId || !slot || !isValidPurchaseId(purchaseId)) return fail(400, "missing_fields");
  if (!isGearSlot(slot)) return fail(400, "invalid_item");
  const player = await getPlayerByWallet(walletAddress);
  const agent = player ? await getAgentWithDimensions(agentId) : null;
  if (!player || !agent || agent.playerId !== player.id) return fail(403, "not_owner");

  const current = await readGearLevel(agentId, slot);
  const next = current + 1;
  const cost = gearUpgradeCost(next);

  let charged: { balance: number; applied: boolean };
  try {
    charged = await applyGems({ playerId: player.id, delta: -cost, reason: `gear:${slot}:${next}`, ref: `buy:${purchaseId}` });
  } catch (e) {
    if (e instanceof InsufficientGemsError) return { status: 402, body: { error: "insufficient_gems", balance: await getGemBalance(player.id) } };
    throw e;
  }
  if (!charged.applied) return { status: 200, body: { balance: charged.balance, level: current, duplicate: true } };

  if (!(await upgradeGearLevel(agentId, slot, current))) {
    const balance = await refundGems(player.id, cost, `refund:gear:${slot}`, purchaseId);
    return { status: 409, body: { error: "upgrade_conflict", balance } };
  }
  return { status: 200, body: { balance: charged.balance, slot, level: next, nextCost: gearUpgradeCost(next + 1) } };
}
