import { getAgentWithDimensions, getPlayerByWallet } from "@/lib/db";
import { memRecordRecharge } from "@/lib/recharges";
import { getWriteClient } from "@/lib/supabase-admin";
import { RECHARGE_COST_SOL } from "@/lib/constants";
import { fail, type ServiceResult } from "./service-common";

export interface RechargeDeps {
  /** Confirms on-chain that the signature paid RECHARGE_COST_SOL from the wallet to the treasury. */
  verify: (input: { signature: string; payer: string; minSol: number }) => Promise<boolean>;
}

/** Records a paid recharge after verifying the payment; training fights then count from this moment. */
export async function rechargeFights(
  input: { walletAddress?: string; agentId?: string; signature?: string },
  deps: RechargeDeps
): Promise<ServiceResult> {
  const { walletAddress, agentId, signature } = input;
  if (!walletAddress || !agentId || !signature) return fail(400, "missing_fields");

  const player = await getPlayerByWallet(walletAddress);
  const agent = player ? await getAgentWithDimensions(agentId) : null;
  if (!player || !agent || agent.playerId !== player.id) return fail(403, "not_owner");

  if (!(await deps.verify({ signature, payer: walletAddress, minSol: RECHARGE_COST_SOL }))) return fail(402, "payment_invalid");

  const createdAt = await recordRecharge({ agentId, playerId: player.id, ref: signature });
  if (!createdAt) return fail(409, "signature_used");
  return { status: 200, body: { rechargedAt: createdAt } };
}

/**
 * Records a training-fight reset for an agent (paid SOL recharge or a gem Training Refill).
 * `ref` is unique (payment signature or `gems:<purchaseId>`); returns the reset time, or null if already used.
 */
export async function recordRecharge(input: { agentId: string; playerId: string; ref: string }): Promise<string | null> {
  const createdAt = new Date().toISOString();
  const sb = getWriteClient();
  if (sb) {
    const { error } = await sb
      .from("levelup_fight_recharges")
      .insert({ agent_id: input.agentId, player_id: input.playerId, tx_signature: input.ref, created_at: createdAt });
    if (error) {
      if ((error as { code?: string }).code === "23505") return null;
      throw error;
    }
    return createdAt;
  }
  return memRecordRecharge({ agentId: input.agentId, playerId: input.playerId, txSignature: input.ref, createdAt }) ? createdAt : null;
}
