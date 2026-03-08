import { describe, it, expect } from "vitest";
import { getOrCreatePlayer, getPlayerAgents, summonAgent, getAgentWithDimensions, completeTask, getCompletedTasksToday } from "../db";
import { generateInitialDimensions, generateSpriteSeed } from "../agent-init";

describe("integration: full game flow", () => {
  it("creates player, summons agent, completes task", async () => {
    // 1. Create player
    const player = await getOrCreatePlayer("IntegrationTestWallet");
    expect(player).toBeDefined();
    expect(player.abilityScore).toBe(0);

    // 2. Summon agent
    const dims = generateInitialDimensions("medieval");
    expect(dims).toHaveLength(50);

    const seed = generateSpriteSeed("medieval", "TestWarrior", "A brave soul");
    expect(seed.bodyType).toBeDefined();

    const agent = await summonAgent({
      playerId: player.id,
      name: "TestWarrior",
      role: "medieval",
      roleTitle: "Warrior",
      character: "A brave soul who never backs down",
      objective: "To protect the innocent",
      spriteSeed: seed,
      initialDimensions: dims,
    });
    expect(agent).toBeDefined();
    expect(agent.name).toBe("TestWarrior");
    expect(agent.role).toBe("medieval");

    // 3. Verify agent has 50 dimensions
    const agentWithDims = await getAgentWithDimensions(agent.id);
    expect(agentWithDims).toBeDefined();
    expect(agentWithDims!.dimensions).toHaveLength(50);

    // 4. Verify agent shows in player's agents
    const agents = await getPlayerAgents(player.id);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("TestWarrior");

    // 5. Complete a daily task
    await completeTask(player.id, "Daily Login");
    const completed = await getCompletedTasksToday(player.id);
    expect(completed).toContain("Daily Login");

    // 6. Verify ability score increased
    const updatedPlayer = await getOrCreatePlayer("IntegrationTestWallet");
    expect(updatedPlayer.abilityScore).toBe(5); // Daily Login = 5 points
  });

  it("generates unique agents", async () => {
    const player = await getOrCreatePlayer("UniqueTestWallet");

    const agent1 = await summonAgent({
      playerId: player.id,
      name: "FutureBot",
      role: "future",
      roleTitle: "AI Brain",
      character: "Cold logic",
      objective: "Optimize everything",
      spriteSeed: generateSpriteSeed("future", "FutureBot", "Cold logic"),
      initialDimensions: generateInitialDimensions("future"),
    });

    const agent2 = await summonAgent({
      playerId: player.id,
      name: "MedievalMage",
      role: "medieval",
      roleTitle: "Magician",
      character: "Ancient wisdom",
      objective: "Seek the truth",
      spriteSeed: generateSpriteSeed("medieval", "MedievalMage", "Ancient wisdom"),
      initialDimensions: generateInitialDimensions("medieval"),
    });

    const full1 = await getAgentWithDimensions(agent1.id);
    const full2 = await getAgentWithDimensions(agent2.id);

    // Different names, roles
    expect(full1!.name).not.toBe(full2!.name);
    expect(full1!.role).not.toBe(full2!.role);

    // Different sprite seeds
    expect(full1!.spriteSeed).not.toEqual(full2!.spriteSeed);
  });
});
