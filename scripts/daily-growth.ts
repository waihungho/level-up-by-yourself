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

// --- Main cron function (uses Supabase + Anthropic) ---

async function generateNarrative(
  anthropicModule: any,
  agent: { name: string; role: string; roleTitle: string; character: string; objective: string },
  changes: Record<number, number>
): Promise<string> {
  const grownDims = Object.entries(changes)
    .map(([id, delta]) => {
      const dim = DIMENSIONS.find((d) => d.id === Number(id));
      return `${dim?.name} +${delta}`;
    })
    .join(", ");

  const Anthropic = anthropicModule.default || anthropicModule;
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [
      {
        role: "user",
        content: `Write a 1-2 sentence narrative for an agent's daily growth.
Agent: ${agent.name} (${agent.roleTitle}, ${agent.role})
Character: ${agent.character}
Objective: ${agent.objective}
Today's growth: ${grownDims}
Write in third person, atmospheric, brief.`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

export async function runDailyGrowth() {
  // Dynamic imports for Node.js modules that aren't needed for testing
  const { createClient } = await import("@supabase/supabase-js");
  const anthropicModule = await import("@anthropic-ai/sdk");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch all agents with player ability scores
  const { data: agents, error } = await supabase
    .from("levelup_agents")
    .select("*, levelup_players!inner(ability_score)")
    .order("player_id");

  if (error) {
    console.error("Failed to fetch agents:", error);
    process.exit(1);
  }

  if (!agents?.length) {
    console.log("No agents to process.");
    return;
  }

  console.log(`Processing ${agents.length} agents...`);

  for (const agent of agents) {
    const multiplier = getGrowthMultiplier(agent.levelup_players.ability_score);
    const changes = calculateGrowth(agent.role, multiplier);

    if (Object.keys(changes).length === 0) {
      console.log(`${agent.name}: no growth today`);
      continue;
    }

    // Generate narrative
    const narrative = await generateNarrative(anthropicModule, agent, changes);

    // Update dimensions
    for (const [dimId, delta] of Object.entries(changes)) {
      await supabase.rpc("levelup_increment_dimension", {
        p_agent_id: agent.id,
        p_dimension_id: Number(dimId),
        p_delta: delta,
      });
    }

    // Log growth
    await supabase.from("levelup_growth_logs").upsert({
      agent_id: agent.id,
      date: new Date().toISOString().split("T")[0],
      dimension_changes: changes,
      narrative,
    });

    console.log(`${agent.name}: ${Object.keys(changes).length} dimensions grew`);
  }

  console.log("Daily growth complete!");
}

// Run if called directly
const isMainModule = typeof process !== "undefined" && process.argv[1] &&
  (process.argv[1].endsWith("daily-growth.ts") || process.argv[1].endsWith("daily-growth.js"));

if (isMainModule) {
  runDailyGrowth().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
