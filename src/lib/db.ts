import { getSupabase, isSupabaseConfigured } from "./supabase";
import type {
  Agent,
  AgentDimension,
  AgentWithDimensions,
  BattleLog,
  GrowthLog,
  Player,
  RoleCategory,
} from "./types";

// ---------------------------------------------------------------------------
// In-memory stores (demo mode)
// ---------------------------------------------------------------------------
let localPlayers: Player[] = [];
let localAgents: Agent[] = [];
let localDimensions: AgentDimension[] = [];
let localTaskCompletions: { playerId: string; taskName: string; completedAt: string }[] = [];
let localGrowthLogs: GrowthLog[] = [];
const localBattleLogs: BattleLog[] = [];

// ---------------------------------------------------------------------------
// Row mappers (snake_case DB rows → camelCase TS types)
// ---------------------------------------------------------------------------
function mapPlayerRow(row: any): Player {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    abilityScore: row.ability_score,
    lastSummonAt: row.last_summon_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAgentRow(row: any): Agent {
  return {
    id: row.id,
    playerId: row.player_id,
    name: row.name,
    role: row.role,
    roleTitle: row.role_title,
    character: row.character,
    objective: row.objective,
    spriteSeed: row.sprite_seed,
    createdAt: row.created_at,
  };
}

function mapAgentDimensionRow(row: any): AgentDimension {
  return {
    agentId: row.agent_id,
    dimensionId: row.dimension_id,
    value: row.value,
  };
}

function mapGrowthLogRow(row: any): GrowthLog {
  return {
    agentId: row.agent_id,
    date: row.date,
    dimensionChanges: row.dimension_changes,
    narrative: row.narrative,
  };
}

// ---------------------------------------------------------------------------
// getOrCreatePlayer
// ---------------------------------------------------------------------------
export async function getOrCreatePlayer(walletAddress: string): Promise<Player> {
  const sb = getSupabase();

  if (sb) {
    // Check for existing player
    const { data: existing } = await sb
      .from("levelup_players")
      .select("*")
      .eq("wallet_address", walletAddress)
      .single();

    if (existing) return mapPlayerRow(existing);

    // Create new player
    const { data: created, error } = await sb
      .from("levelup_players")
      .insert({ wallet_address: walletAddress })
      .select("*")
      .single();

    if (error) throw error;
    return mapPlayerRow(created);
  }

  // Demo mode
  const found = localPlayers.find((p) => p.walletAddress === walletAddress);
  if (found) return { ...found };

  const now = new Date().toISOString();
  const player: Player = {
    id: crypto.randomUUID(),
    walletAddress,
    abilityScore: 0,
    lastSummonAt: null,
    createdAt: now,
    updatedAt: now,
  };
  localPlayers.push(player);
  return player;
}

// ---------------------------------------------------------------------------
// getPlayerAgents
// ---------------------------------------------------------------------------
export async function getPlayerAgents(playerId: string): Promise<Agent[]> {
  const sb = getSupabase();

  if (sb) {
    const { data, error } = await sb
      .from("levelup_agents")
      .select("*")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(mapAgentRow);
  }

  // Demo mode
  return localAgents.filter((a) => a.playerId === playerId);
}

// ---------------------------------------------------------------------------
// getAgentWithDimensions
// ---------------------------------------------------------------------------
export async function getAgentWithDimensions(
  agentId: string
): Promise<AgentWithDimensions | null> {
  const sb = getSupabase();

  if (sb) {
    const { data: agentRow, error: agentError } = await sb
      .from("levelup_agents")
      .select("*")
      .eq("id", agentId)
      .single();

    if (agentError || !agentRow) return null;

    const { data: dimRows } = await sb
      .from("levelup_agent_dimensions")
      .select("*")
      .eq("agent_id", agentId);

    return {
      ...mapAgentRow(agentRow),
      dimensions: (dimRows ?? []).map(mapAgentDimensionRow),
    };
  }

  // Demo mode
  const agent = localAgents.find((a) => a.id === agentId);
  if (!agent) return null;

  const dimensions = localDimensions.filter((d) => d.agentId === agentId);
  return { ...agent, dimensions };
}

// ---------------------------------------------------------------------------
// summonAgent
// ---------------------------------------------------------------------------
export async function summonAgent(params: {
  playerId: string;
  name: string;
  role: RoleCategory;
  roleTitle: string;
  character: string;
  objective: string;
  spriteSeed: Record<string, unknown>;
  initialDimensions: { dimensionId: number; value: number }[];
}): Promise<Agent> {
  const sb = getSupabase();

  if (sb) {
    const { data, error } = await sb.rpc("levelup_summon_agent", {
      p_player_id: params.playerId,
      p_name: params.name,
      p_role: params.role,
      p_role_title: params.roleTitle,
      p_character: params.character,
      p_objective: params.objective,
      p_sprite_seed: params.spriteSeed,
      p_initial_dimensions: params.initialDimensions.map((d) => ({
        dimension_id: d.dimensionId,
        value: d.value,
      })),
    });

    if (error) throw error;
    return mapAgentRow(data);
  }

  // Demo mode
  const now = new Date().toISOString();
  const agent: Agent = {
    id: crypto.randomUUID(),
    playerId: params.playerId,
    name: params.name,
    role: params.role,
    roleTitle: params.roleTitle,
    character: params.character,
    objective: params.objective,
    spriteSeed: params.spriteSeed,
    createdAt: now,
  };
  localAgents.push(agent);

  for (const dim of params.initialDimensions) {
    localDimensions.push({
      agentId: agent.id,
      dimensionId: dim.dimensionId,
      value: dim.value,
    });
  }

  // Update player's lastSummonAt
  const player = localPlayers.find((p) => p.id === params.playerId);
  if (player) {
    player.lastSummonAt = now;
    player.updatedAt = now;
  }

  return agent;
}

// ---------------------------------------------------------------------------
// completeTask
// ---------------------------------------------------------------------------
export async function completeTask(
  playerId: string,
  taskName: string
): Promise<void> {
  const sb = getSupabase();

  if (sb) {
    const { error: insertError } = await sb
      .from("levelup_player_task_completions")
      .insert({ player_id: playerId, task_name: taskName });

    if (insertError) throw insertError;

    // Increment ability_score by looking up the task's points
    const { DAILY_TASKS } = await import("./constants");
    const task = DAILY_TASKS.find((t) => t.name === taskName);
    const points = task?.abilityPoints ?? 0;

    const { error: updateError } = await sb.rpc("increment_ability_score", {
      p_player_id: playerId,
      p_points: points,
    });

    if (updateError) {
      // Fallback: read-then-write
      const { data: player } = await sb
        .from("levelup_players")
        .select("ability_score")
        .eq("id", playerId)
        .single();

      if (player) {
        await sb
          .from("levelup_players")
          .update({ ability_score: player.ability_score + points })
          .eq("id", playerId);
      }
    }

    return;
  }

  // Demo mode
  const now = new Date().toISOString();
  localTaskCompletions.push({ playerId, taskName, completedAt: now });

  const { DAILY_TASKS } = await import("./constants");
  const task = DAILY_TASKS.find((t) => t.name === taskName);
  const points = task?.abilityPoints ?? 0;

  const player = localPlayers.find((p) => p.id === playerId);
  if (player) {
    player.abilityScore += points;
    player.updatedAt = now;
  }
}

// ---------------------------------------------------------------------------
// getCompletedTasksToday
// ---------------------------------------------------------------------------
export async function getCompletedTasksToday(
  playerId: string
): Promise<string[]> {
  const sb = getSupabase();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  if (sb) {
    const { data, error } = await sb
      .from("levelup_player_task_completions")
      .select("task_name")
      .eq("player_id", playerId)
      .gte("created_at", todayISO);

    if (error) throw error;
    return (data ?? []).map((r: any) => r.task_name);
  }

  // Demo mode
  return localTaskCompletions
    .filter((c) => c.playerId === playerId && c.completedAt >= todayISO)
    .map((c) => c.taskName);
}

// ---------------------------------------------------------------------------
// getGrowthLogs
// ---------------------------------------------------------------------------
export async function getGrowthLogs(
  agentId: string,
  limit = 30
): Promise<GrowthLog[]> {
  const sb = getSupabase();

  if (sb) {
    const { data, error } = await sb
      .from("levelup_growth_logs")
      .select("*")
      .eq("agent_id", agentId)
      .order("date", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []).map(mapGrowthLogRow);
  }

  // Demo mode
  return localGrowthLogs
    .filter((g) => g.agentId === agentId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// saveBattleLog
// ---------------------------------------------------------------------------
export async function saveBattleLog(log: BattleLog): Promise<void> {
  const sb = getSupabase();

  if (sb) {
    // Supabase mode: demo-only for now
    localBattleLogs.push(log);
    return;
  }

  // Demo mode
  localBattleLogs.push(log);

  // Apply dimension growth for attacker
  for (const [dimIdStr, delta] of Object.entries(log.attackerGrowth)) {
    const dimId = Number(dimIdStr);
    const dim = localDimensions.find(
      (d) => d.agentId === log.attackerId && d.dimensionId === dimId
    );
    if (dim) {
      dim.value += delta;
    }
  }

  // Apply dimension growth for defender
  for (const [dimIdStr, delta] of Object.entries(log.defenderGrowth)) {
    const dimId = Number(dimIdStr);
    const dim = localDimensions.find(
      (d) => d.agentId === log.defenderId && d.dimensionId === dimId
    );
    if (dim) {
      dim.value += delta;
    }
  }
}

// ---------------------------------------------------------------------------
// getBattleLogs
// ---------------------------------------------------------------------------
export async function getBattleLogs(
  agentId: string,
  limit = 20
): Promise<BattleLog[]> {
  const sb = getSupabase();

  if (sb) {
    // Supabase mode: demo-only for now
    return localBattleLogs
      .filter((l) => l.attackerId === agentId || l.defenderId === agentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  // Demo mode
  return localBattleLogs
    .filter((l) => l.attackerId === agentId || l.defenderId === agentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// getAgentFightsToday
// ---------------------------------------------------------------------------
export async function getAgentFightsToday(
  agentId: string
): Promise<number> {
  const sb = getSupabase();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  if (sb) {
    // Supabase mode: demo-only for now
    return localBattleLogs.filter(
      (l) =>
        (l.attackerId === agentId || l.defenderId === agentId) &&
        l.createdAt >= todayISO
    ).length;
  }

  // Demo mode
  return localBattleLogs.filter(
    (l) =>
      (l.attackerId === agentId || l.defenderId === agentId) &&
      l.createdAt >= todayISO
  ).length;
}
