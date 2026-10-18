import { describe, it, expect, beforeEach } from "vitest";
import { loginXp, seasonBounds, seasonOf } from "../season";
import { awardPassXp, getPassXp, resetPassXpMemory } from "../xp";

beforeEach(() => resetPassXpMemory());

describe("season calendar", () => {
  it("numbers 14-day seasons from Monday 2026-10-19", () => {
    expect(seasonOf(new Date("2026-10-19T00:00:00Z"))).toBe(1);
    expect(seasonOf(new Date("2026-11-01T23:59:59Z"))).toBe(1);
    expect(seasonOf(new Date("2026-11-02T00:00:00Z"))).toBe(2);
    expect(seasonOf(new Date("2026-01-01T00:00:00Z"))).toBe(1);
    expect(seasonBounds(2)).toEqual({ start: "2026-11-02T00:00:00.000Z", end: "2026-11-16T00:00:00.000Z" });
  });

  it("login XP grows with the streak, capped at 150", () => {
    expect(loginXp(1)).toBe(50);
    expect(loginXp(3)).toBe(70);
    expect(loginXp(30)).toBe(150);
  });
});

describe("awardPassXp", () => {
  it("is idempotent per ref and accumulates per season", async () => {
    const now = new Date("2026-10-20T10:00:00Z");
    expect(await awardPassXp({ playerId: "p", source: "fight", ref: "a", xp: 15, now })).toEqual({ xp: 15, applied: true });
    expect(await awardPassXp({ playerId: "p", source: "fight", ref: "a", xp: 15, now })).toEqual({ xp: 15, applied: false });
    await awardPassXp({ playerId: "p", source: "raid", ref: "b", xp: 50, now });
    expect(await getPassXp("p", 1)).toBe(65);
    expect(await getPassXp("p", 2)).toBe(0);
  });
});
