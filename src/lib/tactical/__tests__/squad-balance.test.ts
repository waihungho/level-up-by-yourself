import { describe, it, expect } from "vitest";
import { createSquadBattle, runSquadAuto } from "../squad";
import { mulberry32 } from "../rng";
import type { RoleCategory } from "@/lib/types";
import { makeRoleAgent } from "./fixtures";

const N = 600;

function sim(attackerRoles: RoleCategory[], defenderRoles: RoleCategory[], seed: number) {
  const rng = mulberry32(seed);
  let wins = 0;
  const rounds: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = { playerId: "pa", agents: attackerRoles.map((r, k) => makeRoleAgent(`a${k}`, r)) };
    const d = { playerId: "pd", agents: defenderRoles.map((r, k) => makeRoleAgent(`d${k}`, r)) };
    const done = runSquadAuto(createSquadBattle(a, d, rng), rng);
    if (done.winner === "attacker") wins++;
    rounds.push(done.round);
  }
  rounds.sort((x, y) => x - y);
  return { winRate: wins / N, median: rounds[Math.floor(N / 2)] };
}

const TRINITY: RoleCategory[] = ["medieval", "future", "modern"];
const legion = (r: RoleCategory): RoleCategory[] => [r, r, r];

describe("squad balance", () => {
  it("equal squads on Auto last 12-18 rounds", () => {
    const r = sim(TRINITY, TRINITY, 1);
    expect(r.median).toBeGreaterThanOrEqual(12);
    expect(r.median).toBeLessThanOrEqual(18);
  });

  it("Trinity vs a medieval Legion wins 40-60% (spec target)", () => {
    const r = sim(TRINITY, legion("medieval"), 2);
    expect(r.winRate).toBeGreaterThanOrEqual(0.4);
    expect(r.winRate).toBeLessThanOrEqual(0.6);
  });

  it.each(["future", "modern"] as RoleCategory[])("no composition dominates: Trinity vs %s Legion wins 35-65%%", (role) => {
    const r = sim(TRINITY, legion(role), 2);
    expect(r.winRate).toBeGreaterThanOrEqual(0.35);
    expect(r.winRate).toBeLessThanOrEqual(0.65);
  });
});
