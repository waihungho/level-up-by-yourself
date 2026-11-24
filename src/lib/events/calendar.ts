/*
 * Seasonal events: yearly windows (UTC, month-day) with three themed stages each.
 * Pure (no DB imports) so the dashboard banner and the story page can use it.
 */
import type { Stage, StageEnemy } from "@/lib/story/catalog";

export interface SeasonalEventDef {
  id: string;
  name: string;
  tagline: string;
  emoji: string;
  /** "MM-DD", inclusive; an end before the start wraps into the next year. */
  start: string;
  end: string;
  /** Tailwind classes for the banner. */
  theme: string;
  stages: { title: string; intro: string; enemy: StageEnemy; gems: number; growth: number }[];
}

export const SEASONAL_EVENTS: SeasonalEventDef[] = [
  {
    id: "harvest",
    name: "Harvest Moon",
    tagline: "The scarecrows walk under the orange moon.",
    emoji: "🎃",
    start: "10-20",
    end: "11-30",
    theme: "border-orange-600 bg-orange-950/60 text-orange-200",
    stages: [
      { title: "Field of Scarecrows", intro: "The straw men guard the last of the harvest.", enemy: { name: "Straw Sentinel", role: "medieval", roleTitle: "Warrior", power: 35 }, gems: 5, growth: 1.5 },
      { title: "The Pumpkin Witch", intro: "She brews something nasty in a giant gourd.", enemy: { name: "Gourdmother", role: "medieval", roleTitle: "Alchemist", power: 60 }, gems: 8, growth: 2 },
      { title: "EVENT BOSS · The Headless Reaper", intro: "He rides once a year. Make it his last.", enemy: { name: "The Headless Reaper", role: "medieval", roleTitle: "Necromancer", power: 95 }, gems: 15, growth: 3 },
    ],
  },
  {
    id: "frostfall",
    name: "Frostfall Festival",
    tagline: "Snow, lights and a very grumpy ice giant.",
    emoji: "❄️",
    start: "12-01",
    end: "01-06",
    theme: "border-sky-500 bg-sky-950/60 text-sky-200",
    stages: [
      { title: "Snowball Ambush", intro: "Rogue elves with a catapult.", enemy: { name: "Rogue Elf Gunner", role: "modern", roleTitle: "Engineer", power: 35 }, gems: 5, growth: 1.5 },
      { title: "The Toy Factory", intro: "The toys have been reprogrammed.", enemy: { name: "Nutcracker Prime", role: "future", roleTitle: "AI Robot", power: 60 }, gems: 8, growth: 2 },
      { title: "EVENT BOSS · Jötunn of the North", intro: "The ice giant wants the festival cancelled.", enemy: { name: "Jötunn", role: "medieval", roleTitle: "Warrior", power: 95 }, gems: 15, growth: 3 },
    ],
  },
  {
    id: "lunar",
    name: "Lunar New Year",
    tagline: "Lanterns rise as the dragon dance begins.",
    emoji: "🐉",
    start: "01-25",
    end: "02-15",
    theme: "border-red-500 bg-red-950/60 text-red-200",
    stages: [
      { title: "Lantern Thieves", intro: "Someone is stealing the lanterns before the parade.", enemy: { name: "Shadow Thief", role: "modern", roleTitle: "Strategist", power: 35 }, gems: 5, growth: 1.5 },
      { title: "The Nian Beast", intro: "Loud, red and hungry. Bring firecrackers.", enemy: { name: "Nian", role: "medieval", roleTitle: "Shaman", power: 60 }, gems: 8, growth: 2 },
      { title: "EVENT BOSS · The Jade Dragon", intro: "The dragon tests whoever leads the dance.", enemy: { name: "Jade Dragon", role: "medieval", roleTitle: "Magician", power: 95 }, gems: 15, growth: 3 },
    ],
  },
  {
    id: "bloom",
    name: "Spring Bloom",
    tagline: "Everything grows, including the weeds.",
    emoji: "🌸",
    start: "04-01",
    end: "04-21",
    theme: "border-pink-500 bg-pink-950/60 text-pink-200",
    stages: [
      { title: "Overgrown Lab", intro: "A growth serum got loose in the greenhouse.", enemy: { name: "Vine Horror", role: "modern", roleTitle: "Scientist", power: 35 }, gems: 5, growth: 1.5 },
      { title: "The Pollen Swarm", intro: "Bio-drones spreading something unnatural.", enemy: { name: "Pollen Swarm", role: "future", roleTitle: "Nanosmith", power: 60 }, gems: 8, growth: 2 },
      { title: "EVENT BOSS · The Thorn Queen", intro: "She'd turn the whole city into her garden.", enemy: { name: "The Thorn Queen", role: "medieval", roleTitle: "Shaman", power: 95 }, gems: 15, growth: 3 },
    ],
  },
  {
    id: "solstice",
    name: "Midsummer Arena",
    tagline: "The longest day hosts the hottest tournament.",
    emoji: "☀️",
    start: "06-15",
    end: "07-05",
    theme: "border-yellow-500 bg-yellow-950/60 text-yellow-200",
    stages: [
      { title: "Qualifier", intro: "Prove you belong in the arena.", enemy: { name: "Arena Hopeful", role: "modern", roleTitle: "Developer", power: 35 }, gems: 5, growth: 1.5 },
      { title: "Semi-final", intro: "The crowd favourite, and they know it.", enemy: { name: "Blaze Kincaid", role: "future", roleTitle: "Cyborg", power: 60 }, gems: 8, growth: 2 },
      { title: "EVENT BOSS · The Sun Champion", intro: "Undefeated for a hundred summers.", enemy: { name: "The Sun Champion", role: "medieval", roleTitle: "Paladin", power: 95 }, gems: 15, growth: 3 },
    ],
  },
];

export interface ActiveEvent {
  def: SeasonalEventDef;
  /** Year the event started (an event spanning New Year belongs to the year it began). */
  year: number;
  startsAt: string;
  endsAt: string;
  stages: Stage[];
}

function utcDate(year: number, md: string, endOfDay: boolean): Date {
  const [m, d] = md.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
}

/** The event's window that started in `year`. */
function windowFor(def: SeasonalEventDef, year: number): { start: Date; end: Date } {
  const wraps = def.end < def.start;
  return { start: utcDate(year, def.start, false), end: utcDate(wraps ? year + 1 : year, def.end, true) };
}

function toActive(def: SeasonalEventDef, year: number): ActiveEvent {
  const { start, end } = windowFor(def, year);
  return {
    def,
    year,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    stages: def.stages.map((s, i) => ({ id: `ev-${def.id}-${year}-${i + 1}`, title: s.title, intro: s.intro, enemy: s.enemy, reward: { gems: s.gems, growth: s.growth } })),
  };
}

/** Events running at `now` (windows don't overlap by design, but callers handle several). */
export function activeEvents(now: Date = new Date()): ActiveEvent[] {
  const year = now.getUTCFullYear();
  const out: ActiveEvent[] = [];
  for (const def of SEASONAL_EVENTS) {
    // A window that wraps New Year may have started last year.
    for (const y of [year - 1, year]) {
      const { start, end } = windowFor(def, y);
      if (now >= start && now <= end) out.push(toActive(def, y));
    }
  }
  return out;
}

/** The next event to start after `now`. */
export function nextEvent(now: Date = new Date()): ActiveEvent {
  const year = now.getUTCFullYear();
  const upcoming = [year, year + 1].flatMap((y) => SEASONAL_EVENTS.map((def) => toActive(def, y))).filter((e) => Date.parse(e.startsAt) > now.getTime());
  return upcoming.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
}

/** A currently fightable event stage by id, or null when unknown or out of its window. */
export function activeEventStage(stageId: string, now: Date = new Date()): { event: ActiveEvent; stage: Stage; index: number } | null {
  for (const event of activeEvents(now)) {
    const index = event.stages.findIndex((s) => s.id === stageId);
    if (index >= 0) return { event, stage: event.stages[index], index };
  }
  return null;
}
