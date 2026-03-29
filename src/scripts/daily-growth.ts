import { DIMENSIONS, ROLE_WEIGHTS, WEIGHT_VALUES, GROWTH_TIERS } from "@/lib/constants";
import type { RoleCategory } from "@/lib/types";

// --- Pure functions (testable) ---

export function getGrowthMultiplier(abilityScore: number): number {
  for (const tier of GROWTH_TIERS) {
    if (abilityScore >= tier.minScore && abilityScore < tier.maxScore) {
      return tier.multiplier;
    }
  }
  return 1.0;
}

export function calculateGrowth(
  role: RoleCategory,
  multiplier: number
): Record<number, number> {
  const weights = ROLE_WEIGHTS[role];
  const changes: Record<number, number> = {};

  for (const dim of DIMENSIONS) {
    const weight = WEIGHT_VALUES[weights[dim.category]];
    if (Math.random() < weight * 0.4) {
      const growth = (Math.random() * 2 + 0.5) * multiplier * weight;
      changes[dim.id] = Math.round(growth * 10) / 10;
    }
  }

  return changes;
}

// --- Main function ---

export async function runDailyGrowth() {
  const { createClient } = await import("@supabase/supabase-js");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const today = new Date().toISOString().split("T")[0];

  // Fetch all agents with player ability scores
  const { data: agents, error } = await supabase
    .from("levelup_agents")
    .select("*, levelup_players!inner(ability_score)")
    .order("player_id");

  if (error) {
    throw new Error(`Failed to fetch agents: ${error.message}`);
  }

  if (!agents?.length) {
    console.log("No agents to process.");
    return;
  }

  // Find agents already grown today
  const { data: existingLogs } = await supabase
    .from("levelup_growth_logs")
    .select("agent_id")
    .eq("date", today);
  const alreadyGrown = new Set((existingLogs ?? []).map((r: any) => r.agent_id));

  console.log(`Processing ${agents.length} agents (${alreadyGrown.size} already done today)...`);

  let grown = 0;
  let skipped = 0;

  for (const agent of agents) {
    if (alreadyGrown.has(agent.id)) {
      skipped++;
      continue;
    }

    const multiplier = getGrowthMultiplier(agent.levelup_players.ability_score);
    const changes = calculateGrowth(agent.role, multiplier);

    if (Object.keys(changes).length === 0) {
      console.log(`  ${agent.name}: no growth today`);
      skipped++;
      continue;
    }

    // Update dimensions
    for (const [dimId, delta] of Object.entries(changes)) {
      await supabase.rpc("levelup_increment_dimension", {
        p_agent_id: agent.id,
        p_dimension_id: Number(dimId),
        p_delta: delta,
      });
    }

    // Log growth
    const { error: logError } = await supabase.from("levelup_growth_logs").insert({
      agent_id: agent.id,
      date: today,
      dimension_changes: changes,
      narrative: null,
    });

    if (logError) {
      console.error(`  ${agent.name}: failed to save log -`, logError.message);
      continue;
    }

    const dimSummary = Object.entries(changes)
      .map(([id, delta]) => {
        const dim = DIMENSIONS.find((d) => d.id === Number(id));
        return `${dim?.name} +${delta}`;
      })
      .join(", ");
    console.log(`  ✓ ${agent.name}: ${dimSummary}`);
    grown++;
  }

  console.log(`\nDone. ${grown} grown, ${skipped} skipped.`);
}

// Run if called directly
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("daily-growth.ts") ||
    process.argv[1].endsWith("daily-growth.js"));

if (isMainModule) {
  runDailyGrowth()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
