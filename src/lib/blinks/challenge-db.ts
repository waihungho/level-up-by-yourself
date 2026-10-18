import { getWriteClient } from "@/lib/supabase-admin";
import { blinkMem, mapChallenge, type BlinkChallenge } from "./challenge-read";

export * from "./challenge-read";

const writer = getWriteClient;

/** Challenges a wallet may start per UTC day (all agents together). */
export const BLINK_DAILY_LIMIT = 5;
/** Challenges a wallet may start against one agent per UTC day. */
export const BLINK_PER_AGENT_LIMIT = 1;

const UNIQUE_VIOLATION = "23505";

export async function getChallengeBySignature(signature: string): Promise<BlinkChallenge | null> {
  const sb = writer();
  if (sb) {
    const { data, error } = await sb.from("levelup_blink_challenges").select("*").eq("tx_signature", signature).maybeSingle();
    if (error) throw error;
    return data ? mapChallenge(data) : null;
  }
  const found = blinkMem.challenges.find((c) => c.txSignature === signature);
  return found ? { ...found } : null;
}

/** A wallet's challenges on a UTC day, oldest first (the order the daily limit is applied in). */
export async function challengesOnDay(wallet: string, day: string): Promise<BlinkChallenge[]> {
  const sb = writer();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_blink_challenges")
      .select("*")
      .eq("challenger_wallet", wallet)
      .eq("day", day)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapChallenge);
  }
  return blinkMem.challenges.filter((c) => c.challengerWallet === wallet && c.day === day).map((c) => ({ ...c }));
}

export type NewChallenge = Omit<BlinkChallenge, "id" | "createdAt">;

/**
 * Inserts a challenge. `conflict` when the signature was already recorded or the wallet already
 * challenged this agent that day (both are unique in the table).
 */
export async function insertChallenge(input: NewChallenge): Promise<{ record: BlinkChallenge } | { conflict: true }> {
  const sb = writer();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_blink_challenges")
      .insert({
        agent_id: input.agentId,
        challenger_wallet: input.challengerWallet,
        challenger_player_id: input.challengerPlayerId,
        tx_signature: input.txSignature,
        winner: input.winner,
        summary: input.summary,
        day: input.day,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) return { conflict: true };
      throw error;
    }
    return { record: mapChallenge(data) };
  }
  const taken = blinkMem.challenges.some(
    (c) => c.txSignature === input.txSignature || (c.challengerWallet === input.challengerWallet && c.agentId === input.agentId && c.day === input.day)
  );
  if (taken) return { conflict: true };
  const record: BlinkChallenge = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  blinkMem.challenges.push(record);
  return { record: { ...record } };
}

export async function deleteChallenge(id: string): Promise<void> {
  const sb = writer();
  if (sb) {
    const { error } = await sb.from("levelup_blink_challenges").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  blinkMem.challenges = blinkMem.challenges.filter((c) => c.id !== id);
}
