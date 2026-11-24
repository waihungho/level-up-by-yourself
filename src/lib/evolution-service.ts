import { getAgentWithDimensions, getPlayerByWallet } from "@/lib/db";
import { fail, type ServiceResult } from "@/lib/tactical/service-common";
import { EVOLUTIONS, evolutionProgress } from "./evolution";
import { getEvolutions, insertEvolution } from "./evolution-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The agent's chosen evolution path (null before it evolves). Public. */
export async function getEvolution(agentId: string): Promise<ServiceResult> {
  if (!UUID_RE.test(agentId)) return fail(404, "not_found");
  const paths = await getEvolutions([agentId]);
  return { status: 200, body: { path: paths[agentId] ?? null } };
}

/** Evolves the owner's agent along one of its role's two paths, once, when it's ready. */
export async function evolveAgent(input: { walletAddress?: unknown; agentId?: unknown; path?: unknown }): Promise<ServiceResult> {
  const { walletAddress, agentId, path } = input;
  if (typeof walletAddress !== "string" || !walletAddress || typeof path !== "string" || !path) return fail(400, "missing_fields");
  if (typeof agentId !== "string" || !UUID_RE.test(agentId)) return fail(404, "not_found");
  const [player, agent] = await Promise.all([getPlayerByWallet(walletAddress), getAgentWithDimensions(agentId)]);
  if (!agent) return fail(404, "not_found");
  if (!player || agent.playerId !== player.id) return fail(403, "not_owner");
  if (!EVOLUTIONS[agent.role].some((p) => p.id === path)) return fail(400, "invalid_path");
  if (!evolutionProgress(agent).ready) return fail(409, "not_ready");
  if (!(await insertEvolution(agent.id, path))) return fail(409, "already_evolved");
  return { status: 200, body: { path } };
}
