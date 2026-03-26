import { getSupabase, isSupabaseConfigured } from "./supabase";
import type {
  Agent,
  AgentDimension,
  AgentWithDimensions,
  BattleLog,
  GrowthLog,
  Player,
  PvpStats,
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
const localPvpBattleLogs: BattleLog[] = [];  // const — mutated via .push, not reassigned
const localPvpStats: PvpStats[] = [];

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

  // Auto-seed 10 demo agents for new players
  seedDemoAgents(player.id);

  return player;
}

// ---------------------------------------------------------------------------
// seedDemoAgents (demo mode only)
// ---------------------------------------------------------------------------
function seedDemoAgents(playerId: string) {
  const roles: RoleCategory[] = ["medieval", "modern", "future"];
  const names = [
    "Aldric", "Seraph", "Nova", "Kael", "Zephyr",
    "Riven", "Lyra", "Onyx", "Vega", "Drake",
  ];
  const titles = [
    "Knight", "Hacker", "Pilot", "Mage", "Scout",
    "Ranger", "Healer", "Tank", "Sniper", "Monk",
  ];

  for (let i = 0; i < 10; i++) {
    const role = roles[i % 3];
    const now = new Date().toISOString();
    const agent: Agent = {
      id: crypto.randomUUID(),
      playerId,
      name: names[i],
      role,
      roleTitle: titles[i],
      character: `A brave ${titles[i].toLowerCase()}`,
      objective: "Grow stronger through daily challenges",
      spriteSeed: {
        bodyType: (i * 7 + 3) % 20,
        headType: (i * 11 + 5) % 20,
        eyeType: (i * 3 + 1) % 20,
        weaponType: (i * 5 + 2) % 20,
        auraType: (i * 9 + 4) % 20,
        colorSeed: i * 37 + 10,
      },
      createdAt: now,
    };
    localAgents.push(agent);

    for (let d = 1; d <= 50; d++) {
      localDimensions.push({
        agentId: agent.id,
        dimensionId: d,
        value: 8 + Math.random() * 10,
      });
    }
  }
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
  limit = 10
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
    const { error } = await sb.from("levelup_battle_logs").insert({
      id: log.id,
      attacker_id: log.attackerId,
      defender_id: log.defenderId,
      winner_id: log.winnerId,
      rounds: log.rounds,
      attacker_growth: log.attackerGrowth,
      defender_growth: log.defenderGrowth,
    });
    if (error) throw error;

    // Apply dimension growth
    for (const [dimIdStr, delta] of Object.entries(log.attackerGrowth)) {
      await sb.rpc("levelup_increment_dimension", {
        p_agent_id: log.attackerId,
        p_dimension_id: Number(dimIdStr),
        p_delta: delta,
      });
    }
    for (const [dimIdStr, delta] of Object.entries(log.defenderGrowth)) {
      await sb.rpc("levelup_increment_dimension", {
        p_agent_id: log.defenderId,
        p_dimension_id: Number(dimIdStr),
        p_delta: delta,
      });
    }
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
  limit = 10
): Promise<BattleLog[]> {
  const sb = getSupabase();

  if (sb) {
    const { data, error } = await sb
      .from("levelup_battle_logs")
      .select("*")
      .or(`attacker_id.eq.${agentId},defender_id.eq.${agentId}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: row.id,
      attackerId: row.attacker_id,
      defenderId: row.defender_id,
      winnerId: row.winner_id,
      rounds: row.rounds,
      attackerGrowth: row.attacker_growth,
      defenderGrowth: row.defender_growth,
      createdAt: row.created_at,
    }));
  }

  // Demo mode
  return localBattleLogs
    .filter((l) => l.attackerId === agentId || l.defenderId === agentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// getBattleLogsCount
// ---------------------------------------------------------------------------
export async function getBattleLogsCount(agentId: string): Promise<number> {
  const sb = getSupabase();

  if (sb) {
    const { count, error } = await sb
      .from("levelup_battle_logs")
      .select("*", { count: "exact", head: true })
      .or(`attacker_id.eq.${agentId},defender_id.eq.${agentId}`);
    if (error) return 0;
    return count ?? 0;
  }

  return localBattleLogs.filter(
    (l) => l.attackerId === agentId || l.defenderId === agentId
  ).length;
}

// ---------------------------------------------------------------------------
// getGrowthLogsCount
// ---------------------------------------------------------------------------
export async function getGrowthLogsCount(agentId: string): Promise<number> {
  const sb = getSupabase();

  if (sb) {
    const { count, error } = await sb
      .from("levelup_growth_logs")
      .select("*", { count: "exact", head: true })
      .eq("agent_id", agentId);
    if (error) return 0;
    return count ?? 0;
  }

  return localGrowthLogs.filter((g) => g.agentId === agentId).length;
}

// ---------------------------------------------------------------------------
// getAllAgentsWithDimensions (for rankings)
// ---------------------------------------------------------------------------
export async function getAllAgentsWithDimensions(): Promise<AgentWithDimensions[]> {
  const sb = getSupabase();

  if (sb) {
    const [{ data: agentRows, error: agentError }, { data: allDimRows }] =
      await Promise.all([
        sb.from("levelup_agents").select("*"),
        sb.from("levelup_agent_dimensions").select("*"),
      ]);

    if (agentError || !agentRows) return [];

    const dimsByAgent = new Map<string, typeof allDimRows>();
    for (const row of allDimRows ?? []) {
      const list = dimsByAgent.get(row.agent_id) ?? [];
      list.push(row);
      dimsByAgent.set(row.agent_id, list);
    }

    return agentRows.map((row) => ({
      ...mapAgentRow(row),
      dimensions: (dimsByAgent.get(row.id) ?? []).map(mapAgentDimensionRow),
    }));
  }

  // Demo mode
  return localAgents.map((a) => ({
    ...a,
    dimensions: localDimensions.filter((d) => d.agentId === a.id),
  }));
}

// ---------------------------------------------------------------------------
// getAllPlayers
// ---------------------------------------------------------------------------
export async function getAllPlayers(): Promise<Player[]> {
  const sb = getSupabase();

  if (sb) {
    const { data, error } = await sb
      .from("levelup_players")
      .select("*");

    if (error) throw error;
    return (data ?? []).map(mapPlayerRow);
  }

  // Demo mode
  return [...localPlayers];
}

// ---------------------------------------------------------------------------
// getAgentFightsToday
// ---------------------------------------------------------------------------
export async function getAgentFightsToday(
  agentId: string
): Promise<number> {
  const sb = getSupabase();
  // Count fights since the last recharge (or since midnight if no recharge)
  const sinceISO = getRechargeTimestamp(agentId) ?? (() => {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    return todayStart.toISOString();
  })();

  if (sb) {
    const { count, error } = await sb
      .from("levelup_battle_logs")
      .select("*", { count: "exact", head: true })
      .or(`attacker_id.eq.${agentId},defender_id.eq.${agentId}`)
      .eq("pvp", false)           // exclude PvP battles from training count
      .gte("created_at", sinceISO);
    if (error) return 0;
    return count ?? 0;
  }

  // Demo mode — exclude pvp battles
  return localBattleLogs.filter(
    (l) =>
      !l.pvp &&                                          // exclude PvP battles
      (l.attackerId === agentId || l.defenderId === agentId) &&
      l.createdAt >= sinceISO
  ).length;
}

// ---------------------------------------------------------------------------
// rechargeAgentFights — store timestamp so we only count fights after recharge
// ---------------------------------------------------------------------------
const rechargeTimestamps = new Map<string, string>();

export async function rechargeAgentFights(agentId: string): Promise<void> {
  const todayKey = `${agentId}_${new Date().toISOString().slice(0, 10)}`;
  rechargeTimestamps.set(todayKey, new Date().toISOString());
}

function getRechargeTimestamp(agentId: string): string | undefined {
  const todayKey = `${agentId}_${new Date().toISOString().slice(0, 10)}`;
  return rechargeTimestamps.get(todayKey);
}

// ---------------------------------------------------------------------------
// Seeker Tasks
// ---------------------------------------------------------------------------
interface LocalSeekerTask {
  id: string;
  playerId: string;
  txSignature: string;
  solAmount: number;
  createdAt: string;
}

const localSeekerTasks: LocalSeekerTask[] = [];

export async function recordSeekerTask(
  playerId: string,
  txSignature: string,
  solAmount: number
): Promise<void> {
  const sb = getSupabase();

  if (sb) {
    const { error } = await sb
      .from("levelup_seeker_tasks")
      .insert({
        player_id: playerId,
        tx_signature: txSignature,
        sol_amount: solAmount,
      });
    if (error) throw error;
    return;
  }

  localSeekerTasks.push({
    id: crypto.randomUUID(),
    playerId,
    txSignature,
    solAmount,
    createdAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// saveGrowthLog
// ---------------------------------------------------------------------------
export async function saveGrowthLog(log: GrowthLog): Promise<void> {
  const sb = getSupabase();

  if (sb) {
    const { error } = await sb.from("levelup_growth_logs").insert({
      agent_id: log.agentId,
      date: log.date,
      dimension_changes: log.dimensionChanges,
      narrative: log.narrative ?? null,
    });
    if (error) throw error;

    for (const [dimIdStr, delta] of Object.entries(log.dimensionChanges)) {
      await sb.rpc("levelup_increment_dimension", {
        p_agent_id: log.agentId,
        p_dimension_id: Number(dimIdStr),
        p_delta: delta,
      });
    }
    return;
  }

  // Demo mode
  localGrowthLogs.push(log);
  for (const [dimIdStr, delta] of Object.entries(log.dimensionChanges)) {
    const dimId = Number(dimIdStr);
    const dim = localDimensions.find(
      (d) => d.agentId === log.agentId && d.dimensionId === dimId
    );
    if (dim) dim.value += delta;
  }
}

export async function getSeekerTaskCount(playerId: string): Promise<number> {
  const sb = getSupabase();

  if (sb) {
    const { count, error } = await sb
      .from("levelup_seeker_tasks")
      .select("*", { count: "exact", head: true })
      .eq("player_id", playerId);
    if (error) throw error;
    return count ?? 0;
  }

  return localSeekerTasks.filter((t) => t.playerId === playerId).length;
}

// ---------------------------------------------------------------------------
// getPvpFightsToday
// ---------------------------------------------------------------------------
export async function getPvpFightsToday(agentId: string): Promise<number> {
  const sb = getSupabase();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const sinceISO = todayStart.toISOString();

  if (sb) {
    const { count, error } = await sb
      .from("levelup_battle_logs")
      .select("*", { count: "exact", head: true })
      .or(`attacker_id.eq.${agentId},defender_id.eq.${agentId}`)
      .eq("pvp", true)
      .gte("created_at", sinceISO);
    if (error) return 0;
    return count ?? 0;
  }

  // Demo mode — always uses midnight cutoff (no recharge for PvP)
  return localPvpBattleLogs.filter(
    (l) =>
      (l.attackerId === agentId || l.defenderId === agentId) &&
      l.createdAt >= sinceISO
  ).length;
}

// ---------------------------------------------------------------------------
// savePvpBattleLog
// ---------------------------------------------------------------------------
export async function savePvpBattleLog(log: BattleLog): Promise<void> {
  const sb = getSupabase();

  if (sb) {
    const { error } = await sb.from("levelup_battle_logs").insert({
      id: log.id,
      attacker_id: log.attackerId,
      defender_id: log.defenderId,
      winner_id: log.winnerId,
      rounds: log.rounds,
      attacker_growth: log.attackerGrowth,
      defender_growth: log.defenderGrowth,
      pvp: true,
    });
    if (error) throw error;

    for (const [dimIdStr, delta] of Object.entries(log.attackerGrowth)) {
      await sb.rpc("levelup_increment_dimension", {
        p_agent_id: log.attackerId,
        p_dimension_id: Number(dimIdStr),
        p_delta: delta,
      });
    }
    for (const [dimIdStr, delta] of Object.entries(log.defenderGrowth)) {
      await sb.rpc("levelup_increment_dimension", {
        p_agent_id: log.defenderId,
        p_dimension_id: Number(dimIdStr),
        p_delta: delta,
      });
    }
    return;
  }

  // Demo mode
  localPvpBattleLogs.push({ ...log, pvp: true });

  for (const [dimIdStr, delta] of Object.entries(log.attackerGrowth)) {
    const dimId = Number(dimIdStr);
    const dim = localDimensions.find(
      (d) => d.agentId === log.attackerId && d.dimensionId === dimId
    );
    if (dim) dim.value += delta;
  }
  for (const [dimIdStr, delta] of Object.entries(log.defenderGrowth)) {
    const dimId = Number(dimIdStr);
    const dim = localDimensions.find(
      (d) => d.agentId === log.defenderId && d.dimensionId === dimId
    );
    if (dim) dim.value += delta;
  }
}

// ---------------------------------------------------------------------------
// updatePvpStats
// ---------------------------------------------------------------------------
export async function updatePvpStats(
  winnerId: string,
  loserId: string
): Promise<void> {
  const sb = getSupabase();

  if (sb) {
    // Use atomic RPC for upsert+increment (defined in supabase/migrations/pvp.sql)
    const { error: winError } = await sb.rpc("levelup_pvp_increment", { p_agent_id: winnerId, p_wins: 1, p_losses: 0 });
    if (winError) throw winError;
    const { error: lossError } = await sb.rpc("levelup_pvp_increment", { p_agent_id: loserId, p_wins: 0, p_losses: 1 });
    if (lossError) throw lossError;
    return;
  }

  // Demo mode
  for (const [id, isWinner] of [[winnerId, true], [loserId, false]] as [string, boolean][]) {
    const existing = localPvpStats.find((s) => s.agentId === id);
    if (existing) {
      if (isWinner) existing.wins += 1;
      else existing.losses += 1;
    } else {
      localPvpStats.push({
        agentId: id,
        wins: isWinner ? 1 : 0,
        losses: isWinner ? 0 : 1,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// getPvpStatsForAgents
// ---------------------------------------------------------------------------
export async function getPvpStatsForAgents(
  agentIds: string[]
): Promise<Record<string, PvpStats>> {
  const sb = getSupabase();
  const result: Record<string, PvpStats> = {};

  if (sb) {
    const { data, error } = await sb
      .from("levelup_pvp_stats")
      .select("*")
      .in("agent_id", agentIds);

    const rows = error ? [] : (data ?? []);
    for (const row of rows) {
      result[row.agent_id] = { agentId: row.agent_id, wins: row.wins, losses: row.losses };
    }
  } else {
    // Demo mode
    for (const stat of localPvpStats) {
      if (agentIds.includes(stat.agentId)) {
        result[stat.agentId] = { ...stat };
      }
    }
  }

  // Fill zeros for agents with no history
  for (const id of agentIds) {
    if (!result[id]) result[id] = { agentId: id, wins: 0, losses: 0 };
  }

  return result;
}
