import { getAgentsByIds, getPlayerAgents, getPlayerByWallet } from "@/lib/db";
import { defaultRng, type Rng } from "@/lib/tactical/rng";
import { fail, type ServiceResult } from "@/lib/tactical/service-common";
import { utcToday } from "@/lib/time";
import type { Player } from "@/lib/types";
import {
  growthFor,
  habitPoints,
  HABIT_NAME_MAX,
  isCategory,
  isSessionKind,
  LIFE_DAILY_CAP,
  MAX_HABITS,
  previousDay,
  QUEST_POINTS,
  questsForDay,
  round2,
  runEndingOn,
  SESSION_GRACE_S,
  SESSIONS,
  STEPS_MAX,
  stepsPoints,
  streakLength,
} from "./catalog";
import { archiveHabit, cancelSession, finishSession, getHabits, getLifeLogs, getOpenSession, grantLife, insertHabit, insertSession, type GrantResult } from "./life-db";

export interface LifeDeps {
  rng?: Rng;
  now?: () => Date;
}

/** How far back logs are read to compute streaks. */
const STREAK_WINDOW_DAYS = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (x: unknown): x is string => typeof x === "string" && UUID_RE.test(x);
const isNonEmptyString = (x: unknown): x is string => typeof x === "string" && x.length > 0;

function daysBefore(day: string, n: number): string {
  let d = day;
  for (let i = 0; i < n; i++) d = previousDay(d);
  return d;
}

async function playerFor(walletAddress: unknown): Promise<Player | ServiceResult> {
  if (!isNonEmptyString(walletAddress)) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(walletAddress);
  return player ?? fail(403, "not_owner");
}

/** The agent must exist and belong to the player. */
async function ownsAgent(player: Player, agentId: unknown): Promise<boolean> {
  if (!isUuid(agentId)) return false;
  const [agent] = await getAgentsByIds([agentId]);
  return !!agent && agent.playerId === player.id;
}

function grantBody(g: GrantResult, growth: Record<number, number>, points: number): Record<string, unknown> {
  const factor = points > 0 ? g.granted / points : 0;
  const applied = Object.fromEntries(Object.entries(growth).map(([k, v]) => [k, round2(v * factor)]));
  return { result: g.result, granted: g.granted, growth: g.result === "ok" ? applied : {}, today: g.total, cap: LIFE_DAILY_CAP };
}

/** Maps a grant to a response: 409 for a repeat, 429 when the day's cap is used up. */
function grantResponse(g: GrantResult, growth: Record<number, number>, points: number): ServiceResult {
  if (g.result === "duplicate") return { status: 409, body: { error: "already_done", today: g.total, cap: LIFE_DAILY_CAP } };
  if (g.result === "cap") return { status: 429, body: { error: "daily_cap", today: g.total, cap: LIFE_DAILY_CAP } };
  return { status: 200, body: grantBody(g, growth, points) };
}

/** Everything the /life page shows. */
export async function getLifeView(input: { walletAddress?: unknown }, deps: LifeDeps = {}): Promise<ServiceResult> {
  const player = await playerFor(input.walletAddress);
  if ("status" in player) return player;
  const now = deps.now?.() ?? new Date();
  const today = utcToday(now);

  const [habits, logs, session, agents] = await Promise.all([
    getHabits(player.id),
    getLifeLogs(player.id, daysBefore(today, STREAK_WINDOW_DAYS)),
    getOpenSession(player.id),
    getPlayerAgents(player.id),
  ]);
  const todays = logs.filter((l) => l.day === today);
  const doneToday = (kind: string, ref: string) => todays.some((l) => l.kind === kind && l.ref === ref);
  const habitDays = (id: string) => logs.filter((l) => l.kind === "habit" && l.ref === id).map((l) => l.day);
  const anyDays = new Set(logs.map((l) => l.day));

  return {
    status: 200,
    body: {
      today,
      cap: LIFE_DAILY_CAP,
      todayPoints: round2(todays.reduce((s, l) => s + l.points, 0)),
      streak: streakLength(anyDays, today),
      habits: habits.map((h) => {
        const streak = streakLength(habitDays(h.id), today);
        const checked = doneToday("habit", h.id);
        return { id: h.id, name: h.name, category: h.category, streak, checkedToday: checked, nextPoints: habitPoints(checked ? streak : streak + 1) };
      }),
      maxHabits: MAX_HABITS,
      quests: questsForDay(today).map((q) => ({ ...q, points: QUEST_POINTS, done: doneToday("quest", q.id) })),
      stepsToday: todays.find((l) => l.kind === "steps")?.points ?? null,
      sessions: SESSIONS,
      openSession: session ? { id: session.id, kind: session.kind, agentId: session.agentId, minutes: session.minutes, startedAt: session.startedAt } : null,
      agents: agents.map((a) => ({ id: a.id, name: a.name, role: a.role, roleTitle: a.roleTitle })),
      serverNow: now.toISOString(),
    },
  };
}

export async function addHabit(input: { walletAddress?: unknown; name?: unknown; category?: unknown }): Promise<ServiceResult> {
  const player = await playerFor(input.walletAddress);
  if ("status" in player) return player;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > HABIT_NAME_MAX) return fail(400, "invalid_name");
  if (!isCategory(input.category)) return fail(400, "invalid_category");
  if ((await getHabits(player.id)).length >= MAX_HABITS) return fail(409, "habit_limit");
  const habit = await insertHabit({ playerId: player.id, name, category: input.category });
  return { status: 200, body: { habit: { id: habit.id, name: habit.name, category: habit.category } } };
}

export async function removeHabit(input: { walletAddress?: unknown; habitId?: unknown }): Promise<ServiceResult> {
  const player = await playerFor(input.walletAddress);
  if ("status" in player) return player;
  if (!isUuid(input.habitId) || !(await archiveHabit(player.id, input.habitId))) return fail(404, "not_found");
  return { status: 200, body: { ok: true } };
}

/**
 * One real-life check-in: a habit, one of today's quests, or today's step count.
 * The growth goes to the chosen agent; the daily cap is enforced atomically.
 */
export async function checkIn(
  input: { walletAddress?: unknown; agentId?: unknown; kind?: unknown; habitId?: unknown; questId?: unknown; steps?: unknown },
  deps: LifeDeps = {}
): Promise<ServiceResult> {
  const player = await playerFor(input.walletAddress);
  if ("status" in player) return player;
  if (!(await ownsAgent(player, input.agentId))) return fail(403, "not_owner");
  const agentId = input.agentId as string;
  const now = deps.now?.() ?? new Date();
  const today = utcToday(now);
  const rng = deps.rng ?? defaultRng;

  let ref: string;
  let points: number;
  let category;
  switch (input.kind) {
    case "habit": {
      const habit = (await getHabits(player.id)).find((h) => h.id === input.habitId);
      if (!habit) return fail(404, "not_found");
      const days = (await getLifeLogs(player.id, daysBefore(today, STREAK_WINDOW_DAYS))).filter((l) => l.kind === "habit" && l.ref === habit.id).map((l) => l.day);
      // The streak this check-in makes: yesterday's run plus today.
      const streak = runEndingOn(days, previousDay(today)) + 1;
      ref = habit.id;
      points = habitPoints(streak);
      category = habit.category;
      break;
    }
    case "quest": {
      const quest = questsForDay(today).find((q) => q.id === input.questId);
      if (!quest) return fail(404, "not_found");
      ref = quest.id;
      points = QUEST_POINTS;
      category = quest.category;
      break;
    }
    case "steps": {
      const steps = input.steps;
      if (typeof steps !== "number" || !Number.isInteger(steps) || steps <= 0 || steps > STEPS_MAX) return fail(400, "invalid_steps");
      points = stepsPoints(steps);
      ref = "steps";
      category = "Physical" as const;
      break;
    }
    default:
      return fail(400, "invalid_kind");
  }

  const growth = growthFor(category, points, rng);
  const granted = await grantLife({ playerId: player.id, agentId, kind: input.kind, ref, day: today, points, growth, cap: LIFE_DAILY_CAP });
  return grantResponse(granted, growth, points);
}

/** Starts a focus or meditation timer for an agent; the server clock decides when it can be finished. */
export async function startSession(input: { walletAddress?: unknown; agentId?: unknown; kind?: unknown }, deps: LifeDeps = {}): Promise<ServiceResult> {
  const player = await playerFor(input.walletAddress);
  if ("status" in player) return player;
  if (!isSessionKind(input.kind)) return fail(400, "invalid_kind");
  if (!(await ownsAgent(player, input.agentId))) return fail(403, "not_owner");
  const now = deps.now?.() ?? new Date();
  const session = await insertSession({
    playerId: player.id,
    agentId: input.agentId as string,
    kind: input.kind,
    minutes: SESSIONS[input.kind].minutes,
    startedAt: now.toISOString(),
  });
  if (!session) return fail(409, "session_open");
  return { status: 200, body: { session: { id: session.id, kind: session.kind, agentId: session.agentId, minutes: session.minutes, startedAt: session.startedAt } } };
}

export async function endSession(input: { walletAddress?: unknown; sessionId?: unknown; cancel?: unknown }, deps: LifeDeps = {}): Promise<ServiceResult> {
  const player = await playerFor(input.walletAddress);
  if ("status" in player) return player;
  if (!isUuid(input.sessionId)) return fail(404, "not_found");

  if (input.cancel === true) {
    return (await cancelSession(player.id, input.sessionId)) ? { status: 200, body: { cancelled: true } } : fail(404, "not_found");
  }

  const open = await getOpenSession(player.id);
  if (!open || open.id !== input.sessionId) return fail(404, "not_found");
  const now = deps.now?.() ?? new Date();
  const { points, category } = SESSIONS[open.kind];
  const growth = growthFor(category, points, deps.rng ?? defaultRng);
  const done = await finishSession({ playerId: player.id, sessionId: open.id, now, graceS: SESSION_GRACE_S, day: utcToday(now), points, growth, cap: LIFE_DAILY_CAP });
  if (done.result === "not_found") return fail(404, "not_found");
  if (done.result === "too_early") {
    return { status: 409, body: { error: "too_early", endsAt: new Date(Date.parse(open.startedAt) + open.minutes * 60_000).toISOString() } };
  }
  // A finished session whose grant hit the cap still counts as done; say so instead of failing.
  if (done.result === "cap") return { status: 200, body: { ...grantBody(done, growth, points), result: "cap" } };
  return grantResponse(done, growth, points);
}
