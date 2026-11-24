import { getWriteClient } from "@/lib/supabase-admin";
import { applyGems, getGemBalance } from "@/lib/shop/gems";
import { applyGrowthAtomic } from "@/lib/shop/shop-db";

/** Demo-mode (no Supabase) store: player id → cleared stage ids. */
export const storyMem = new Map<string, Set<string>>();

export function resetStoryMemory(): void {
  storyMem.clear();
}

/** Stage ids the player has cleared (story and event stages). */
export async function getClearedStages(playerId: string): Promise<Set<string>> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.from("levelup_story_progress").select("stage_id").eq("player_id", playerId);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.stage_id as string));
  }
  return new Set(storyMem.get(playerId) ?? []);
}

/**
 * Records a stage clear; only the first clear grants the gems and growth, all in one transaction.
 * Returns whether this was the first clear and the gem balance afterwards.
 */
export async function recordClear(input: { playerId: string; stageId: string; agentId: string; gems: number; growth: Record<number, number> }): Promise<{ firstClear: boolean; balance: number }> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_story_clear", {
      p_player: input.playerId,
      p_stage: input.stageId,
      p_agent: input.agentId,
      p_gems: input.gems,
      p_growth: input.growth,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { firstClear: row.first_clear === true, balance: Number(row.balance ?? 0) };
  }

  // Demo mode: mark the clear synchronously (one caller wins) and undo it if a grant throws.
  const cleared = storyMem.get(input.playerId) ?? new Set<string>();
  storyMem.set(input.playerId, cleared);
  if (cleared.has(input.stageId)) return { firstClear: false, balance: await getGemBalance(input.playerId) };
  cleared.add(input.stageId);
  try {
    await applyGrowthAtomic(input.agentId, input.growth);
    const gems = input.gems > 0 ? await applyGems({ playerId: input.playerId, delta: input.gems, reason: "story", ref: `story:${input.playerId}:${input.stageId}` }) : null;
    return { firstClear: true, balance: gems?.balance ?? (await getGemBalance(input.playerId)) };
  } catch (e) {
    cleared.delete(input.stageId);
    throw e;
  }
}
