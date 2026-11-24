/*
 * Real Life: things the player does in real life grow one of their agents.
 * Honor system with a hard daily cap, so self-reporting can't move rankings much.
 * Pure (no DB imports) so pages can use it.
 */
import { DIMENSIONS } from "@/lib/constants";
import type { Rng } from "@/lib/tactical/rng";
import type { DimensionCategory } from "@/lib/types";

/** Stat points real-life activities can grant per player per UTC day (a daily-growth tick is ~25). */
export const LIFE_DAILY_CAP = 6;

export const MAX_HABITS = 5;
export const HABIT_NAME_MAX = 40;
/** Base points for checking in a habit, before the streak bonus. */
export const HABIT_POINTS = 0.5;
/** +10% per consecutive day after the first, up to +50%. */
export const STREAK_STEP = 0.1;
export const STREAK_MAX_BONUS = 0.5;

export const QUEST_POINTS = 1;
export const QUESTS_PER_DAY = 3;

export const STEPS_PER_POINT = 2500;
export const STEPS_MAX_POINTS = 2;
export const STEPS_MAX = 100_000;

export type SessionKind = "focus" | "meditation";
export const SESSIONS: Record<SessionKind, { label: string; minutes: number; points: number; category: DimensionCategory }> = {
  focus: { label: "Focus", minutes: 25, points: 1.5, category: "Mental" },
  meditation: { label: "Meditation", minutes: 10, points: 1, category: "Spiritual" },
};
/** A session may be finished this many seconds early (clock skew, timers firing late in background tabs). */
export const SESSION_GRACE_S = 5;

export type LifeKind = "habit" | "quest" | "steps" | SessionKind;

export const CATEGORIES: DimensionCategory[] = ["Physical", "Mental", "Social", "Spiritual", "Technical"];

export interface LifeQuest {
  id: string;
  text: string;
  category: DimensionCategory;
}

/** Real-life quests; three are offered each UTC day. */
export const QUEST_POOL: LifeQuest[] = [
  { id: "walk20", text: "Go for a 20-minute walk", category: "Physical" },
  { id: "pushups", text: "Do 20 push-ups or squats", category: "Physical" },
  { id: "stretch", text: "Stretch for 10 minutes", category: "Physical" },
  { id: "water", text: "Drink 8 glasses of water", category: "Physical" },
  { id: "stairs", text: "Take the stairs all day", category: "Physical" },
  { id: "read20", text: "Read 20 pages of a book", category: "Mental" },
  { id: "learn", text: "Learn one new thing and write it down", category: "Mental" },
  { id: "puzzle", text: "Solve a puzzle or play a strategy game", category: "Mental" },
  { id: "plan", text: "Plan tomorrow in three bullet points", category: "Mental" },
  { id: "call", text: "Call a friend or family member", category: "Social" },
  { id: "thank", text: "Thank someone for something specific", category: "Social" },
  { id: "help", text: "Help someone with a small task", category: "Social" },
  { id: "compliment", text: "Give a sincere compliment", category: "Social" },
  { id: "gratitude", text: "Write down three things you're grateful for", category: "Spiritual" },
  { id: "nature", text: "Spend 15 minutes outside without your phone", category: "Spiritual" },
  { id: "breathe", text: "Do 5 minutes of slow breathing", category: "Spiritual" },
  { id: "journal", text: "Journal for 10 minutes", category: "Spiritual" },
  { id: "build", text: "Build or fix something", category: "Technical" },
  { id: "code", text: "Code or tinker for 30 minutes", category: "Technical" },
  { id: "tidy", text: "Organise one drawer, folder or inbox", category: "Technical" },
  { id: "tutorial", text: "Follow a tutorial for a new tool", category: "Technical" },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Today's quests: the same three for everyone on a given UTC day, from three different categories. */
export function questsForDay(day: string): LifeQuest[] {
  const picked: LifeQuest[] = [];
  const order = [...QUEST_POOL].sort((a, b) => hash(`${day}:${a.id}`) - hash(`${day}:${b.id}`));
  for (const q of order) {
    if (picked.length === QUESTS_PER_DAY) break;
    if (!picked.some((p) => p.category === q.category)) picked.push(q);
  }
  return picked;
}

export function isCategory(x: unknown): x is DimensionCategory {
  return CATEGORIES.includes(x as DimensionCategory);
}

export function isSessionKind(x: unknown): x is SessionKind {
  return x === "focus" || x === "meditation";
}

/** Habit points for a check-in that makes the streak `streak` days long (1 = first day). */
export function habitPoints(streak: number): number {
  const bonus = Math.min(STREAK_MAX_BONUS, STREAK_STEP * Math.max(0, streak - 1));
  return round2(HABIT_POINTS * (1 + bonus));
}

export function stepsPoints(steps: number): number {
  return round2(Math.min(STEPS_MAX_POINTS, steps / STEPS_PER_POINT));
}

/** Splits `points` over two random dimensions of the category (dimension id → points). */
export function growthFor(category: DimensionCategory, points: number, rng: Rng): Record<number, number> {
  const pool = DIMENSIONS.filter((d) => d.category === category).map((d) => d.id);
  const first = pool.splice(Math.floor(rng() * pool.length), 1)[0];
  const second = pool[Math.floor(rng() * pool.length)];
  const each = round2(points / 2);
  return { [first]: each, [second]: each };
}

/** Consecutive days ending today (or yesterday, if today isn't done yet) found in `days` (YYYY-MM-DD). */
export function streakLength(days: Iterable<string>, today: string): number {
  const set = new Set(days);
  return runEndingOn(set, set.has(today) ? today : previousDay(today));
}

/** Consecutive days in `days` ending exactly on `day` (0 if `day` itself is missing). */
export function runEndingOn(days: Iterable<string>, day: string): number {
  const set = days instanceof Set ? (days as Set<string>) : new Set(days);
  let cursor = day;
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = previousDay(cursor);
  }
  return n;
}

export function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
