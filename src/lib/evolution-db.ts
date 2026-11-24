import { getWriteClient } from "@/lib/supabase-admin";

/** Demo-mode (no Supabase) store: agent id → path id. */
export const evolutionMem = new Map<string, string>();

export function resetEvolutionMemory(): void {
  evolutionMem.clear();
}

/** Postgres "undefined table" or PostgREST "table not in schema cache". */
function isMissingTable(error: { code?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205";
}

/** Evolution path per agent (agents without one are absent). */
export async function getEvolutions(agentIds: string[]): Promise<Record<string, string>> {
  if (!agentIds.length) return {};
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.from("levelup_agent_evolutions").select("agent_id, path").in("agent_id", agentIds);
    // Every battle start reads this: until migration 015 is applied, fight on without evolutions.
    if (error && isMissingTable(error)) return {};
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r) => [r.agent_id, r.path]));
  }
  return Object.fromEntries(agentIds.flatMap((id) => (evolutionMem.has(id) ? [[id, evolutionMem.get(id)!]] : [])));
}

/** Records the agent's evolution; false if it already evolved (the primary key makes this race-free). */
export async function insertEvolution(agentId: string, path: string): Promise<boolean> {
  const sb = getWriteClient();
  if (sb) {
    const { error } = await sb.from("levelup_agent_evolutions").insert({ agent_id: agentId, path });
    if (error) {
      if (error.code === "23505") return false;
      throw error;
    }
    return true;
  }
  if (evolutionMem.has(agentId)) return false;
  evolutionMem.set(agentId, path);
  return true;
}
