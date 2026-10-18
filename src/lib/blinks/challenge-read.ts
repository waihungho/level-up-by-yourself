import { getSupabase } from "@/lib/supabase";
import type { RoleCategory } from "@/lib/types";

/*
 * Read-only Blink challenge queries (public anon client). Safe to import from client components;
 * writes live in challenge-db.ts, which needs the service-role client.
 */

export type ChallengeWinner = "challenger" | "defender";

export interface ChallengeSummary {
  challengerName: string;
  challengerRole: RoleCategory;
  /** Null for a guest fighter. */
  challengerAgentId: string | null;
  defenderName: string;
  rounds: number;
  /** Damage the challenger dealt to the shared agent. */
  damageDealt: number;
  damageTaken: number;
}

export interface BlinkChallenge {
  id: string;
  agentId: string;
  challengerWallet: string;
  challengerPlayerId: string | null;
  txSignature: string;
  winner: ChallengeWinner;
  summary: ChallengeSummary;
  /** UTC date (YYYY-MM-DD) the challenge counts against. */
  day: string;
  createdAt: string;
}

/** Demo-mode store; tests reset it with resetBlinkMemory(). */
export const blinkMem = { challenges: [] as BlinkChallenge[] };

export function resetBlinkMemory(): void {
  blinkMem.challenges = [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapChallenge(row: any): BlinkChallenge {
  return {
    id: row.id,
    agentId: row.agent_id,
    challengerWallet: row.challenger_wallet,
    challengerPlayerId: row.challenger_player_id ?? null,
    txSignature: row.tx_signature,
    winner: row.winner,
    summary: row.summary,
    day: row.day,
    createdAt: row.created_at,
  };
}

/** The shared agent's record against challengers: wins = defender won. */
export async function getAgentRecord(agentId: string): Promise<{ wins: number; losses: number }> {
  const sb = getSupabase();
  if (sb) {
    const count = async (winner: ChallengeWinner) => {
      const { count: n, error } = await sb
        .from("levelup_blink_challenges")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId)
        .eq("winner", winner);
      if (error) throw error;
      return n ?? 0;
    };
    const [wins, losses] = await Promise.all([count("defender"), count("challenger")]);
    return { wins, losses };
  }
  const rows = blinkMem.challenges.filter((c) => c.agentId === agentId);
  return { wins: rows.filter((c) => c.winner === "defender").length, losses: rows.filter((c) => c.winner === "challenger").length };
}

/** Latest challenges against an agent, newest first. */
export async function getRecentChallenges(agentId: string, limit = 10): Promise<BlinkChallenge[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_blink_challenges")
      .select("*")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapChallenge);
  }
  return blinkMem.challenges
    .filter((c) => c.agentId === agentId)
    .slice()
    .reverse()
    .slice(0, limit)
    .map((c) => ({ ...c }));
}
