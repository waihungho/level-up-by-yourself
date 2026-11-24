/*
 * Story Campaign and Seasonal Events: fights against scripted enemies. Pure (no DB imports).
 *
 * Stages unlock in order within their chapter (and each chapter needs the previous one cleared).
 * The first win on a stage pays its gems and growth once; replays pay nothing.
 * Seasonal events add time-limited stages; their ids carry the year so each year's event is fresh.
 */
import { DIMENSIONS, ROLE_WEIGHTS } from "@/lib/constants";
import type { AgentWithDimensions, RoleCategory } from "@/lib/types";

export interface StageEnemy {
  name: string;
  role: RoleCategory;
  roleTitle: string;
  /** Average dimension value before role weighting. */
  power: number;
}

export interface StageReward {
  gems: number;
  /** Stat points, split over two dimensions of the fighting agent's role category. */
  growth: number;
}

export interface Stage {
  id: string;
  title: string;
  intro: string;
  enemy: StageEnemy;
  reward: StageReward;
}

export interface Chapter {
  id: string;
  title: string;
  blurb: string;
  stages: Stage[];
}

const stage = (id: string, title: string, intro: string, enemy: StageEnemy, gems: number, growth: number): Stage => ({ id, title, intro, enemy, reward: { gems, growth } });

export const CHAPTERS: Chapter[] = [
  {
    id: "c1",
    title: "Chapter 1 · The Medieval Rift",
    blurb: "A tear in time spills knights and sorcerers into the present. Close it before it widens.",
    stages: [
      stage("c1s1", "Bandits at the Rift", "Opportunists wander through the tear first.", { name: "Rift Bandit", role: "medieval", roleTitle: "Warrior", power: 22 }, 2, 1),
      stage("c1s2", "The Hedge Witch", "A witch bends the rift to her will.", { name: "Morwen the Hedge Witch", role: "medieval", roleTitle: "Shaman", power: 30 }, 3, 1),
      stage("c1s3", "Bone Legion", "The dead march where the rift is widest.", { name: "Bone Legionnaire", role: "medieval", roleTitle: "Necromancer", power: 38 }, 4, 1.5),
      stage("c1s4", "BOSS · The Rift Knight", "Sir Caddoc guards the tear. Beat him to seal it.", { name: "Sir Caddoc, the Rift Knight", role: "medieval", roleTitle: "Paladin", power: 48 }, 8, 2.5),
    ],
  },
  {
    id: "c2",
    title: "Chapter 2 · Modern Mayhem",
    blurb: "Someone in the city is profiting from the rifts. Follow the money.",
    stages: [
      stage("c2s1", "Street Hustler", "A fixer sells relics from the rift on the black market.", { name: "Vinnie the Fixer", role: "modern", roleTitle: "Strategist", power: 55 }, 4, 1.5),
      stage("c2s2", "Corporate Security", "The relics lead to a tower. Its guards don't talk.", { name: "Head of Security", role: "modern", roleTitle: "Analyst", power: 64 }, 5, 1.5),
      stage("c2s3", "The Rogue Scientist", "Dr. Vale has been opening rifts on purpose.", { name: "Dr. Imogen Vale", role: "modern", roleTitle: "Scientist", power: 74 }, 6, 2),
      stage("c2s4", "BOSS · The Chairman", "The man behind it all, and he doesn't fight fair.", { name: "The Chairman", role: "modern", roleTitle: "Strategist", power: 86 }, 12, 3),
    ],
  },
  {
    id: "c3",
    title: "Chapter 3 · Future Siege",
    blurb: "The Chairman's rifts reached the future. Its machines are coming back through.",
    stages: [
      stage("c3s1", "Scout Drones", "The first wave probes our defences.", { name: "Swarm Drone Mk.IV", role: "future", roleTitle: "AI Robot", power: 95 }, 6, 2),
      stage("c3s2", "The Quantum Hacker", "She rewrites the city's code from the inside.", { name: "Null//Ada", role: "future", roleTitle: "Quantum Hacker", power: 108 }, 8, 2),
      stage("c3s3", "Cyborg Vanguard", "A walking siege engine leads the assault.", { name: "Vanguard Unit 9", role: "future", roleTitle: "Cyborg", power: 122 }, 10, 2.5),
      stage("c3s4", "FINAL BOSS · The Starweaver", "The mind that unites every era. Defeat it to end the war.", { name: "The Starweaver", role: "future", roleTitle: "Starweaver", power: 140 }, 20, 4),
    ],
  },
];

export const STORY_STAGES: Stage[] = CHAPTERS.flatMap((c) => c.stages);

/** Stat multiplier per category weight for enemies (same shape as real role-weighted agents). */
const ENEMY_WEIGHT = { low: 0.75, medium: 1, high: 1.25 } as const;

/** The stage enemy as a fighter (synthetic id `story:<stageId>`; it is never stored). */
export function enemyAgent(stageId: string, enemy: StageEnemy): AgentWithDimensions {
  const id = `story:${stageId}`;
  const weights = ROLE_WEIGHTS[enemy.role];
  return {
    id,
    playerId: "story",
    name: enemy.name,
    role: enemy.role,
    roleTitle: enemy.roleTitle,
    character: "",
    objective: "",
    spriteSeed: spriteSeedFor(id),
    createdAt: new Date(0).toISOString(),
    dimensions: DIMENSIONS.map((d) => ({ agentId: id, dimensionId: d.id, value: Math.round(enemy.power * ENEMY_WEIGHT[weights[d.category]] * 10) / 10 })),
  };
}

function spriteSeedFor(id: string): Record<string, number> {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  const seed = Math.abs(h);
  return { bodyType: seed % 5, headType: (seed >> 4) % 6, eyeType: (seed >> 8) % 4, weaponType: (seed >> 12) % 8, auraType: (seed >> 16) % 5, colorSeed: seed % 360 };
}

/** Story stage ids the player may fight now: every cleared stage plus the next one in order. */
export function unlockedStoryStages(cleared: ReadonlySet<string>): Set<string> {
  const open = new Set<string>();
  for (const s of STORY_STAGES) {
    open.add(s.id);
    if (!cleared.has(s.id)) break;
  }
  return open;
}
