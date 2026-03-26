import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  getPvpFightsToday,
  savePvpBattleLog,
  updatePvpStats,
  getAgentWithDimensions,
  getAllAgentsWithDimensions,
} from "@/lib/db";
import { resolveBattle } from "@/lib/battle-engine";

const MAX_PVP_FIGHTS_PER_DAY = 3;

export async function POST(req: NextRequest) {
  let body: { agentId?: string; walletAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const { agentId, walletAddress } = body;
  if (!agentId || !walletAddress) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const sb = getSupabase();

  // --- 1. Verify agent ownership ---
  if (sb) {
    const { data: player } = await sb
      .from("levelup_players")
      .select("id")
      .eq("wallet_address", walletAddress)
      .single();

    if (!player) {
      return NextResponse.json({ error: "not_owner" }, { status: 403 });
    }

    const { data: agent } = await sb
      .from("levelup_agents")
      .select("player_id")
      .eq("id", agentId)
      .single();

    if (!agent || agent.player_id !== player.id) {
      return NextResponse.json({ error: "not_owner" }, { status: 403 });
    }

    // --- 2. Check PvP fight limit ---
    const fightsToday = await getPvpFightsToday(agentId);
    if (fightsToday >= MAX_PVP_FIGHTS_PER_DAY) {
      return NextResponse.json({ error: "fight_limit_reached" }, { status: 429 });
    }

    // --- 3. Pick a random opponent from another player ---
    const { data: allAgents } = await sb
      .from("levelup_agents")
      .select("id, player_id")
      .neq("player_id", player.id);

    const eligible = allAgents ?? [];
    if (eligible.length === 0) {
      return NextResponse.json({ error: "no_opponent" }, { status: 409 });
    }

    const opponent = eligible[Math.floor(Math.random() * eligible.length)];

    // --- 4. Load full agent data ---
    const [attacker, defender] = await Promise.all([
      getAgentWithDimensions(agentId),
      getAgentWithDimensions(opponent.id),
    ]);

    if (!attacker || !defender) {
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    // --- 5. Resolve battle ---
    const battleLog = resolveBattle(attacker, defender);

    // --- 6. Save log + apply growth ---
    await savePvpBattleLog(battleLog);

    // --- 7. Update W/L stats ---
    const loserId =
      battleLog.winnerId === attacker.id ? defender.id : attacker.id;
    await updatePvpStats(battleLog.winnerId, loserId);

    // --- 8. Return result ---
    return NextResponse.json({ battleLog, opponentAgent: defender, attackerAgent: attacker });
  }

  // Demo mode — no Supabase, use statically-imported getAllAgentsWithDimensions
  const allAgents = await getAllAgentsWithDimensions();
  const attackerAgent = allAgents.find((a) => a.id === agentId);
  if (!attackerAgent) {
    return NextResponse.json({ error: "not_owner" }, { status: 403 });
  }

  const fightsToday = await getPvpFightsToday(agentId);
  if (fightsToday >= MAX_PVP_FIGHTS_PER_DAY) {
    return NextResponse.json({ error: "fight_limit_reached" }, { status: 429 });
  }

  const others = allAgents.filter((a) => a.playerId !== attackerAgent.playerId);
  if (others.length === 0) {
    return NextResponse.json({ error: "no_opponent" }, { status: 409 });
  }

  const opponent = others[Math.floor(Math.random() * others.length)];
  const battleLog = resolveBattle(attackerAgent, opponent);
  await savePvpBattleLog(battleLog);
  const loserId = battleLog.winnerId === attackerAgent.id ? opponent.id : attackerAgent.id;
  await updatePvpStats(battleLog.winnerId, loserId);

  return NextResponse.json({ battleLog, opponentAgent: opponent, attackerAgent });
}
