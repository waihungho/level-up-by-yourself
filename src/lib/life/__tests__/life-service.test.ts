import { describe, it, expect, beforeEach } from "vitest";
import { getAgentWithDimensions, getOrCreatePlayer, getPlayerAgents } from "@/lib/db";
import { resetShopMemory } from "@/lib/shop/shop-memory";
import {
  habitPoints,
  LIFE_DAILY_CAP,
  questsForDay,
  runEndingOn,
  SESSIONS,
  stepsPoints,
  streakLength,
} from "../catalog";
import { resetLifeMemory } from "../life-db";
import { addHabit, checkIn, endSession, getLifeView, removeHabit, startSession } from "../life-service";

const DAY = 86_400_000;
const t0 = new Date("2026-11-24T09:00:00Z");
const at = (ms = 0) => ({ now: () => new Date(t0.getTime() + ms), rng: () => 0.3 });

let wallet: string;
let agentId: string;

beforeEach(async () => {
  resetLifeMemory();
  resetShopMemory();
  wallet = "life-" + crypto.randomUUID();
  const player = await getOrCreatePlayer(wallet);
  agentId = (await getPlayerAgents(player.id))[0].id;
});

async function total(id: string): Promise<number> {
  const a = await getAgentWithDimensions(id);
  return a!.dimensions.reduce((s, d) => s + d.value, 0);
}

async function newHabit(name = "Run", category = "Physical") {
  const r = await addHabit({ walletAddress: wallet, name, category });
  return (r.body.habit as { id: string }).id;
}

describe("catalog", () => {
  it("offers three quests a day from three different categories, the same for everyone", () => {
    const q = questsForDay("2026-11-24");
    expect(q).toHaveLength(3);
    expect(new Set(q.map((x) => x.category)).size).toBe(3);
    expect(questsForDay("2026-11-24")).toEqual(q);
  });

  it("grows the habit bonus 10% a day up to +50%", () => {
    expect(habitPoints(1)).toBe(0.5);
    expect(habitPoints(3)).toBe(0.6);
    expect(habitPoints(6)).toBe(0.75);
    expect(habitPoints(30)).toBe(0.75);
  });

  it("counts streaks ending today or yesterday, and runs ending on an exact day", () => {
    const days = ["2026-11-21", "2026-11-22", "2026-11-23"];
    expect(streakLength(days, "2026-11-24")).toBe(3);
    expect(streakLength([...days, "2026-11-24"], "2026-11-24")).toBe(4);
    expect(streakLength(days, "2026-11-25")).toBe(0);
    expect(runEndingOn(["2026-11-21"], "2026-11-23")).toBe(0);
  });

  it("gives a point per 2,500 steps, at most 2", () => {
    expect(stepsPoints(5000)).toBe(2);
    expect(stepsPoints(1250)).toBe(0.5);
    expect(stepsPoints(40_000)).toBe(2);
  });
});

describe("habits", () => {
  it("adds up to 5 habits and validates name and category", async () => {
    expect((await addHabit({ walletAddress: wallet, name: " ", category: "Mental" })).body.error).toBe("invalid_name");
    expect((await addHabit({ walletAddress: wallet, name: "x".repeat(41), category: "Mental" })).body.error).toBe("invalid_name");
    expect((await addHabit({ walletAddress: wallet, name: "Read", category: "Cooking" })).body.error).toBe("invalid_category");
    for (let i = 0; i < 5; i++) await newHabit(`H${i}`);
    expect(await addHabit({ walletAddress: wallet, name: "Sixth", category: "Social" })).toMatchObject({ status: 409, body: { error: "habit_limit" } });
  });

  it("checks in once a day, grows the agent and builds a streak with a bonus", async () => {
    const habitId = await newHabit();
    const before = await total(agentId);
    const r = await checkIn({ walletAddress: wallet, agentId, kind: "habit", habitId }, at());
    expect(r).toMatchObject({ status: 200, body: { result: "ok", granted: 0.5, today: 0.5 } });
    expect(await total(agentId)).toBeCloseTo(before + 0.5, 5);
    expect((await checkIn({ walletAddress: wallet, agentId, kind: "habit", habitId }, at())).body.error).toBe("already_done");

    expect((await checkIn({ walletAddress: wallet, agentId, kind: "habit", habitId }, at(DAY))).body.granted).toBe(0.55);
    // Skipping a day resets the streak.
    expect((await checkIn({ walletAddress: wallet, agentId, kind: "habit", habitId }, at(3 * DAY))).body.granted).toBe(0.5);

    const view = await getLifeView({ walletAddress: wallet }, at(3 * DAY));
    expect(view.body.habits).toEqual([expect.objectContaining({ id: habitId, streak: 1, checkedToday: true })]);
  });

  it("removes only the player's own habits", async () => {
    const habitId = await newHabit();
    const other = "life-other-" + crypto.randomUUID();
    await getOrCreatePlayer(other);
    expect((await removeHabit({ walletAddress: other, habitId })).status).toBe(404);
    expect((await removeHabit({ walletAddress: wallet, habitId })).status).toBe(200);
    expect((await getLifeView({ walletAddress: wallet }, at())).body.habits).toEqual([]);
  });
});

describe("quests and steps", () => {
  it("completes only today's quests, once each", async () => {
    const [quest] = questsForDay("2026-11-24");
    const notToday = questsForDay("2026-11-25").find((q) => !questsForDay("2026-11-24").some((t) => t.id === q.id))!;
    expect((await checkIn({ walletAddress: wallet, agentId, kind: "quest", questId: notToday.id }, at())).status).toBe(404);
    expect((await checkIn({ walletAddress: wallet, agentId, kind: "quest", questId: quest.id }, at())).body.granted).toBe(1);
    expect((await checkIn({ walletAddress: wallet, agentId, kind: "quest", questId: quest.id }, at())).status).toBe(409);
  });

  it("validates step counts and grants them once a day", async () => {
    for (const steps of [0, -5, 1.5, "9000", 100_001]) {
      expect((await checkIn({ walletAddress: wallet, agentId, kind: "steps", steps }, at())).body.error).toBe("invalid_steps");
    }
    expect((await checkIn({ walletAddress: wallet, agentId, kind: "steps", steps: 7500 }, at())).body.granted).toBe(2);
    expect((await checkIn({ walletAddress: wallet, agentId, kind: "steps", steps: 9000 }, at())).status).toBe(409);
  });

  it("stops at the daily cap, scaling the last grant down", async () => {
    const habits = [];
    for (let i = 0; i < 5; i++) habits.push(await newHabit(`H${i}`));
    const before = await total(agentId);
    await checkIn({ walletAddress: wallet, agentId, kind: "steps", steps: 10_000 }, at());
    for (const q of questsForDay("2026-11-24")) await checkIn({ walletAddress: wallet, agentId, kind: "quest", questId: q.id }, at());
    // 2 + 3 = 5 so far; the next 0.5 habit fits, the one after gets 0.5 of... nothing left.
    expect((await checkIn({ walletAddress: wallet, agentId, kind: "habit", habitId: habits[0] }, at())).body).toMatchObject({ granted: 0.5, today: 5.5 });
    expect((await checkIn({ walletAddress: wallet, agentId, kind: "habit", habitId: habits[1] }, at())).body).toMatchObject({ granted: 0.5, today: LIFE_DAILY_CAP });
    expect(await checkIn({ walletAddress: wallet, agentId, kind: "habit", habitId: habits[2] }, at())).toMatchObject({ status: 429, body: { error: "daily_cap" } });
    expect(await total(agentId)).toBeCloseTo(before + LIFE_DAILY_CAP, 5);
    // The cap resets the next UTC day.
    expect((await checkIn({ walletAddress: wallet, agentId, kind: "habit", habitId: habits[2] }, at(DAY))).status).toBe(200);
  });

  it("rejects agents the player doesn't own", async () => {
    const other = await getOrCreatePlayer("life-x-" + crypto.randomUUID());
    const foreign = (await getPlayerAgents(other.id))[0].id;
    expect((await checkIn({ walletAddress: wallet, agentId: foreign, kind: "steps", steps: 5000 }, at())).status).toBe(403);
    expect((await checkIn({ walletAddress: wallet, agentId: "nope", kind: "steps", steps: 5000 }, at())).status).toBe(403);
  });
});

describe("focus and meditation sessions", () => {
  it("can't be finished before its time, then grants once", async () => {
    const r = await startSession({ walletAddress: wallet, agentId, kind: "focus" }, at());
    const id = (r.body.session as { id: string }).id;
    expect((await startSession({ walletAddress: wallet, agentId, kind: "meditation" }, at())).body.error).toBe("session_open");

    const early = await endSession({ walletAddress: wallet, sessionId: id }, at(10 * 60_000));
    expect(early).toMatchObject({ status: 409, body: { error: "too_early" } });

    const done = await endSession({ walletAddress: wallet, sessionId: id }, at(SESSIONS.focus.minutes * 60_000));
    expect(done).toMatchObject({ status: 200, body: { result: "ok", granted: SESSIONS.focus.points } });
    expect((await endSession({ walletAddress: wallet, sessionId: id }, at(30 * 60_000))).status).toBe(404);
    // A new one can start once the last one is finished.
    expect((await startSession({ walletAddress: wallet, agentId, kind: "meditation" }, at(30 * 60_000))).status).toBe(200);
  });

  it("can be cancelled, which grants nothing", async () => {
    const before = await total(agentId);
    const id = ((await startSession({ walletAddress: wallet, agentId, kind: "meditation" }, at())).body.session as { id: string }).id;
    expect((await endSession({ walletAddress: wallet, sessionId: id, cancel: true }, at())).body).toEqual({ cancelled: true });
    expect(await total(agentId)).toBe(before);
    expect((await getLifeView({ walletAddress: wallet }, at())).body.openSession).toBeNull();
  });

  it("rejects bad kinds and other players' sessions", async () => {
    expect((await startSession({ walletAddress: wallet, agentId, kind: "nap" }, at())).body.error).toBe("invalid_kind");
    const id = ((await startSession({ walletAddress: wallet, agentId, kind: "focus" }, at())).body.session as { id: string }).id;
    const other = "life-o-" + crypto.randomUUID();
    await getOrCreatePlayer(other);
    expect((await endSession({ walletAddress: other, sessionId: id }, at(DAY))).status).toBe(404);
  });
});
