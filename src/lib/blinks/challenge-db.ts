import { getWriteClient } from "@/lib/supabase-admin";
import type { RoleCategory } from "@/lib/types";

/*
 * Blink challenge records. Server-only: the table links wallets to player ids and signatures,
 * so it has no public policy and every read and write goes through the service role.
 * Demo mode and tests use the in-memory store.
 */

const writer = getWriteClient;

/** Challenges a wallet may record per UTC day (all agents together). */
export const BLINK_DAILY_LIMIT = 5;

export type ChallengeWinner = "challenger" | "defender";

export type ChallengeSummary = {
  challengerName: string;
  challengerRole: RoleCategory;
  /** Null for a guest fighter. */
  challengerAgentId: string | null;
  defenderName: string;
  rounds: number;
  /** Damage the challenger dealt to the shared agent. */
  damageDealt: number;
  damageTaken: number;
};

export type BlinkChallenge = {
  id: string;
  agentId: string;
  defenderPlayerId: string;
  challengerWallet: string;
  challengerPlayerId: string | null;
  txSignature: string;
  winner: ChallengeWinner;
  summary: ChallengeSummary;
  /** UTC date (YYYY-MM-DD) the challenge counts against. */
  day: string;
  createdAt: string;
};

/** What the public challenge page may show: no player ids, no signatures, shortened wallets. */
export type ChallengeListItem = {
  id: string;
  winner: ChallengeWinner;
  challengerName: string;
  challengerLabel: string;
  rounds: number;
  damageDealt: number;
  damageTaken: number;
  createdAt: string;
};

type ChallengeRow = {
  id: string;
  agent_id: string;
  defender_player_id: string;
  challenger_wallet: string;
  challenger_player_id: string | null;
  tx_signature: string;
  winner: string;
  summary: ChallengeSummary;
  day: string;
  created_at: string;
};

/** Demo-mode store, in insertion order; tests reset it with resetBlinkMemory(). */
export const blinkMem = { challenges: [] as BlinkChallenge[] };

export function resetBlinkMemory(): void {
  blinkMem.challenges = [];
}

const narrowWinner = (w: string): ChallengeWinner => (w === "challenger" ? "challenger" : "defender");

function mapChallenge(row: ChallengeRow): BlinkChallenge {
  return {
    id: row.id,
    agentId: row.agent_id,
    defenderPlayerId: row.defender_player_id,
    challengerWallet: row.challenger_wallet,
    challengerPlayerId: row.challenger_player_id,
    txSignature: row.tx_signature,
    winner: narrowWinner(row.winner),
    summary: row.summary,
    day: row.day,
    createdAt: row.created_at,
  };
}

export const shortWallet = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export async function getChallengeBySignature(signature: string): Promise<BlinkChallenge | null> {
  const sb = writer();
  if (sb) {
    const { data, error } = await sb.from("levelup_blink_challenges").select("*").eq("tx_signature", signature).maybeSingle<ChallengeRow>();
    if (error) throw error;
    return data ? mapChallenge(data) : null;
  }
  const found = blinkMem.challenges.find((c) => c.txSignature === signature);
  return found ? { ...found } : null;
}

/** Agents a wallet challenged on a UTC day (the cheap pre-check before touching the chain). */
export async function agentsChallengedOnDay(wallet: string, day: string): Promise<string[]> {
  const sb = writer();
  if (sb) {
    const { data, error } = await sb.from("levelup_blink_challenges").select("agent_id").eq("challenger_wallet", wallet).eq("day", day);
    if (error) throw error;
    return (data ?? []).map((r: { agent_id: string }) => r.agent_id);
  }
  return blinkMem.challenges.filter((c) => c.challengerWallet === wallet && c.day === day).map((c) => c.agentId);
}

export type NewChallenge = Omit<BlinkChallenge, "id" | "createdAt">;
export type RecordStatus = "duplicate_signature" | "agent_limit" | "daily_limit";

/**
 * Records a challenge and applies both daily limits atomically (levelup_blink_record_challenge
 * holds a per-wallet-and-day lock; the memory store checks and inserts without awaiting).
 */
export async function recordChallenge(input: NewChallenge): Promise<{ status: "ok"; record: BlinkChallenge } | { status: RecordStatus }> {
  const sb = writer();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_blink_record_challenge", {
      p_agent: input.agentId,
      p_defender_player: input.defenderPlayerId,
      p_wallet: input.challengerWallet,
      p_player: input.challengerPlayerId,
      p_signature: input.txSignature,
      p_winner: input.winner,
      p_summary: input.summary,
      p_day: input.day,
      p_daily_limit: BLINK_DAILY_LIMIT,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { status: string; challenge_id: string | null } | null;
    if (!row) throw new Error("levelup_blink_record_challenge returned no row");
    if (row.status === "ok" && row.challenge_id) {
      return { status: "ok", record: { ...input, id: row.challenge_id, createdAt: new Date().toISOString() } };
    }
    if (row.status === "duplicate_signature" || row.status === "agent_limit" || row.status === "daily_limit") return { status: row.status };
    throw new Error(`levelup_blink_record_challenge: unexpected status ${row.status}`);
  }
  // Synchronous from here on: no await between the checks and the push.
  const sameDay = blinkMem.challenges.filter((c) => c.challengerWallet === input.challengerWallet && c.day === input.day);
  if (blinkMem.challenges.some((c) => c.txSignature === input.txSignature)) return { status: "duplicate_signature" };
  if (sameDay.some((c) => c.agentId === input.agentId)) return { status: "agent_limit" };
  if (sameDay.length >= BLINK_DAILY_LIMIT) return { status: "daily_limit" };
  const record: BlinkChallenge = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  blinkMem.challenges.push(record);
  return { status: "ok", record: { ...record } };
}

/**
 * Position (0-based) of a challenge among the defender owner's XP-eligible challenges that day
 * (challenger is a registered player), oldest first. Stable, so a retried grant reuses its slot.
 */
export async function defenderAwardSlot(defenderPlayerId: string, day: string, challengeId: string): Promise<number> {
  const sb = writer();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_blink_challenges")
      .select("id")
      .eq("defender_player_id", defenderPlayerId)
      .eq("day", day)
      .not("challenger_player_id", "is", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;
    return (data ?? []).findIndex((r: { id: string }) => r.id === challengeId);
  }
  return blinkMem.challenges
    .filter((c) => c.defenderPlayerId === defenderPlayerId && c.day === day && c.challengerPlayerId !== null)
    .findIndex((c) => c.id === challengeId);
}

/** The shared agent's record against challengers: wins = defender won. */
export async function getAgentRecord(agentId: string): Promise<{ wins: number; losses: number }> {
  const sb = writer();
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

type ListRow = Pick<ChallengeRow, "id" | "challenger_wallet" | "winner" | "summary" | "created_at">;

function toListItem(r: ListRow): ChallengeListItem {
  return {
    id: r.id,
    winner: narrowWinner(r.winner),
    challengerName: r.summary.challengerName,
    challengerLabel: shortWallet(r.challenger_wallet),
    rounds: r.summary.rounds,
    damageDealt: r.summary.damageDealt,
    damageTaken: r.summary.damageTaken,
    createdAt: r.created_at,
  };
}

/** Latest challenges against an agent, newest first, in the page-safe shape. */
export async function getRecentChallenges(agentId: string, limit = 10): Promise<ChallengeListItem[]> {
  const sb = writer();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_blink_challenges")
      .select("id, challenger_wallet, winner, summary, created_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<ListRow[]>();
    if (error) throw error;
    return (data ?? []).map(toListItem);
  }
  return blinkMem.challenges
    .filter((c) => c.agentId === agentId)
    .reverse()
    .slice(0, limit)
    .map((c) => toListItem({ id: c.id, challenger_wallet: c.challengerWallet, winner: c.winner, summary: c.summary, created_at: c.createdAt }));
}
