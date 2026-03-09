import type {
  AgentWithDimensions,
  BattleLog,
  BattleRound,
  DimensionCategory,
  RoleCategory,
} from "@/lib/types";
import { DIMENSIONS } from "@/lib/constants";

const CATEGORIES: DimensionCategory[] = [
  "Physical",
  "Mental",
  "Social",
  "Spiritual",
  "Technical",
];

const SPEED_DIMENSION_ID = 8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDimensionValue(agent: AgentWithDimensions, dimId: number): number {
  const dim = agent.dimensions.find((d) => d.dimensionId === dimId);
  return dim ? dim.value : 10;
}

function getCategoryAvg(
  agent: AgentWithDimensions,
  category: DimensionCategory
): number {
  const dimIds = DIMENSIONS.filter((d) => d.category === category).map(
    (d) => d.id
  );
  if (dimIds.length === 0) return 0;
  const total = dimIds.reduce(
    (sum, id) => sum + getDimensionValue(agent, id),
    0
  );
  return total / dimIds.length;
}

function getRoleBonus(role: RoleCategory, category: DimensionCategory): number {
  if (role === "medieval" && category === "Physical") return 1.1;
  if (role === "future" && category === "Technical") return 1.1;
  if (role === "modern" && category === "Mental") return 1.1;
  return 1.0;
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function calculateGrowth(
  categories: DimensionCategory[],
  isWinner: boolean
): Record<number, number> {
  const count = isWinner ? 3 : 2;
  const minGrowth = isWinner ? 1.0 : 0.5;
  const maxGrowth = isWinner ? 2.0 : 1.0;

  // Collect all dimension ids belonging to the used categories
  const eligibleDims = DIMENSIONS.filter((d) =>
    categories.includes(d.category)
  );

  const growth: Record<number, number> = {};
  const picked = new Set<number>();

  const picks = Math.min(count, eligibleDims.length);
  while (picked.size < picks) {
    const idx = Math.floor(Math.random() * eligibleDims.length);
    const dim = eligibleDims[idx];
    if (!picked.has(dim.id)) {
      picked.add(dim.id);
      growth[dim.id] = parseFloat(randomInRange(minGrowth, maxGrowth).toFixed(2));
    }
  }

  return growth;
}

function calculateHp(agent: AgentWithDimensions): number {
  return DIMENSIONS.reduce(
    (sum, dim) => sum + getDimensionValue(agent, dim.id),
    0
  );
}

// ---------------------------------------------------------------------------
// Main battle resolver
// ---------------------------------------------------------------------------

export function resolveBattle(
  attacker: AgentWithDimensions,
  defender: AgentWithDimensions
): BattleLog {
  let attackerHp = calculateHp(attacker);
  let defenderHp = calculateHp(defender);

  const rounds: BattleRound[] = [];
  const usedCategories = new Set<DimensionCategory>();
  let roundNumber = 0;

  while (attackerHp > 0 && defenderHp > 0) {
    roundNumber++;

    // Pick a random category for this round
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    usedCategories.add(category);

    // Determine initiative via Speed + random(0-5)
    const attackerInit =
      getDimensionValue(attacker, SPEED_DIMENSION_ID) + randomInRange(0, 5);
    const defenderInit =
      getDimensionValue(defender, SPEED_DIMENSION_ID) + randomInRange(0, 5);

    const attackerGoesFirst = attackerInit >= defenderInit;
    const first = attackerGoesFirst ? attacker : defender;
    const second = attackerGoesFirst ? defender : attacker;

    // --- First strike ---
    const firstCatAvg = getCategoryAvg(first, category);
    const firstRaw = firstCatAvg * randomInRange(0.8, 1.2) * 8;
    const firstBonused = firstRaw * getRoleBonus(first.role, category);

    const secondDefAvg = getCategoryAvg(second, category);
    const secondReduction = secondDefAvg * 2;

    const firstNetDamage = Math.max(
      Math.round(firstBonused - secondReduction),
      5
    );

    // Apply first strike damage
    if (attackerGoesFirst) {
      defenderHp -= firstNetDamage;
    } else {
      attackerHp -= firstNetDamage;
    }

    // --- Counter-attack (only if second agent is still alive) ---
    let secondNetDamage = 0;
    const secondStillAlive = attackerGoesFirst
      ? defenderHp > 0
      : attackerHp > 0;

    if (secondStillAlive) {
      const secondCatAvg = getCategoryAvg(second, category);
      const secondRaw = secondCatAvg * randomInRange(0.8, 1.2) * 8;
      const secondBonused = secondRaw * getRoleBonus(second.role, category);

      const firstDefAvg = getCategoryAvg(first, category);
      const firstReduction = firstDefAvg * 2;

      secondNetDamage = Math.max(
        Math.round(secondBonused - firstReduction),
        5
      );

      if (attackerGoesFirst) {
        attackerHp -= secondNetDamage;
      } else {
        defenderHp -= secondNetDamage;
      }
    }

    rounds.push({
      roundNumber,
      category,
      firstAttacker: attackerGoesFirst ? attacker.id : defender.id,
      firstDamage: firstNetDamage,
      secondDamage: secondNetDamage,
      attackerHpAfter: Math.max(attackerHp, 0),
      defenderHpAfter: Math.max(defenderHp, 0),
    });
  }

  const winnerId = attackerHp > 0 ? attacker.id : defender.id;
  const categoriesUsed = Array.from(usedCategories);

  const attackerIsWinner = winnerId === attacker.id;
  const attackerGrowth = calculateGrowth(categoriesUsed, attackerIsWinner);
  const defenderGrowth = calculateGrowth(categoriesUsed, !attackerIsWinner);

  return {
    id: crypto.randomUUID(),
    attackerId: attacker.id,
    defenderId: defender.id,
    winnerId,
    rounds,
    attackerGrowth,
    defenderGrowth,
    createdAt: new Date().toISOString(),
  };
}
