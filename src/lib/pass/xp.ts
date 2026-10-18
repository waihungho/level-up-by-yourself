import { getWriteClient } from "@/lib/supabase-admin";
import { seasonOf, type XpSource } from "./season";

/** Demo-mode store; tests reset it with resetPassXpMemory(). */
export const passXpMem = {
  xp: new Map<string, number>(),
  events: new Map<string, { playerId: string; season: number; source: XpSource; xp: number; createdAt: string }>(),
};

export function resetPassXpMemory(): void {
  passXpMem.xp.clear();
  passXpMem.events.clear();
}

/**
 * Adds Season Pass XP once per `ref` (e.g. `fight:<sessionId>`, `login:<date>`).
 * A repeated ref is a no-op (applied=false). Returns the player's season XP afterwards.
 */
export async function awardPassXp(input: { playerId: string; source: XpSource; ref: string; xp: number; now?: Date }): Promise<{ xp: number; applied: boolean }> {
  const season = seasonOf(input.now);
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_pass_add_xp", {
      p_player: input.playerId,
      p_season: season,
      p_source: input.source,
      p_ref: input.ref,
      p_xp: input.xp,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { xp: Number(row.xp), applied: !!row.applied };
  }
  const key = `${input.playerId}:${season}`;
  const current = passXpMem.xp.get(key) ?? 0;
  if (passXpMem.events.has(input.ref)) return { xp: current, applied: false };
  passXpMem.events.set(input.ref, { playerId: input.playerId, season, source: input.source, xp: input.xp, createdAt: (input.now ?? new Date()).toISOString() });
  passXpMem.xp.set(key, current + input.xp);
  return { xp: current + input.xp, applied: true };
}

/** Fire-and-forget wrapper for gameplay hooks: XP must never break or slow a fight. */
export async function awardPassXpSafe(input: Parameters<typeof awardPassXp>[0]): Promise<void> {
  try {
    await awardPassXp(input);
  } catch (e) {
    console.error("[pass xp]", input.ref, e);
  }
}

export async function getPassXp(playerId: string, season: number): Promise<number> {
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.from("levelup_pass_xp").select("xp").eq("player_id", playerId).eq("season", season).maybeSingle();
    if (error) throw error;
    return data?.xp ?? 0;
  }
  return passXpMem.xp.get(`${playerId}:${season}`) ?? 0;
}
