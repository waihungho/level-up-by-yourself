import { getSupabase } from "./supabase";
import { utcDayStartISO } from "./time";

/** Paid fight recharges (levelup_fight_recharges). Reads are public; writes happen in recharge-service. */
export interface FightRecharge {
  agentId: string;
  playerId: string;
  txSignature: string;
  createdAt: string;
}

const memRecharges: FightRecharge[] = [];

/** Demo-mode write; returns false if the signature was already used. */
export function memRecordRecharge(r: FightRecharge): boolean {
  if (memRecharges.some((x) => x.txSignature === r.txSignature)) return false;
  memRecharges.push(r);
  return true;
}

/** Time of the agent's latest recharge today (UTC), or null. Training fights are counted from then. */
export async function getLatestRechargeToday(agentId: string): Promise<string | null> {
  const since = utcDayStartISO();
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("levelup_fight_recharges")
      .select("created_at")
      .eq("agent_id", agentId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data?.created_at ?? null;
  }
  const latest = memRecharges.filter((r) => r.agentId === agentId && r.createdAt >= since).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return latest?.createdAt ?? null;
}
