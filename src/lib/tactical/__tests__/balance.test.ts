import { describe, it, expect } from "vitest";
import { aiAction, createBattle, resolveRound, skilledAction } from "../engine";
import { mulberry32, type Rng } from "../rng";
import type { PlayerAction, TacticalState } from "../types";
import type { RoleCategory } from "@/lib/types";
import { makeRoleAgent } from "./fixtures";

type Policy = (s: TacticalState, rng: Rng) => PlayerAction;
const ROLES: RoleCategory[] = ["medieval", "future", "modern"];

function simulate(policy: Policy, a: RoleCategory, d: RoleCategory, n: number, seed: number, attackerBase = 150, defenderBase = 150) {
  const rng = mulberry32(seed);
  let wins = 0;
  const rounds: number[] = [];
  for (let i = 0; i < n; i++) {
    let s = createBattle(makeRoleAgent("a", a, attackerBase), makeRoleAgent("d", d, defenderBase), "pvp", rng);
    while (!s.finished) s = resolveRound(s, policy(s, rng), rng, { manual: false });
    if (s.winner === "attacker") wins++;
    rounds.push(s.round);
  }
  rounds.sort((x, y) => x - y);
  return { winRate: wins / n, medianRounds: rounds[Math.floor(n / 2)] };
}

function acrossRoles(policy: Policy, seed: number, attackerBase = 150, defenderBase = 150) {
  const cells = ROLES.flatMap((a) => ROLES.map((d) => ({ a, d, ...simulate(policy, a, d, 600, seed, attackerBase, defenderBase) })));
  const avg = cells.reduce((s, c) => s + c.winRate, 0) / cells.length;
  const rounds = cells.map((c) => c.medianRounds).sort((x, y) => x - y)[4];
  return { cells, avg, rounds };
}

describe("balance (role-weighted agents, equal total stats)", () => {
  it("Auto vs equal stats: median 6-10 rounds, average win rate 45-55%", () => {
    const r = acrossRoles(aiAction, 1);
    expect(r.rounds).toBeGreaterThanOrEqual(6);
    expect(r.rounds).toBeLessThanOrEqual(10);
    expect(r.avg).toBeGreaterThanOrEqual(0.45);
    expect(r.avg).toBeLessThanOrEqual(0.55);
  });

  it("no role matchup is lopsided on Auto (every cell 35-65%)", () => {
    for (const c of acrossRoles(aiAction, 4).cells) {
      expect(c.winRate, `${c.a} vs ${c.d}`).toBeGreaterThanOrEqual(0.35);
      expect(c.winRate, `${c.a} vs ${c.d}`).toBeLessThanOrEqual(0.65);
    }
  });

  it("intent-reading play beats equal stats 65-80% of the time", () => {
    const r = acrossRoles(skilledAction, 2);
    expect(r.avg).toBeGreaterThanOrEqual(0.65);
    expect(r.avg).toBeLessThanOrEqual(0.8);
  });

  it("a 20% stat advantage still wins at least 55% against intent-reading play", () => {
    const r = acrossRoles(skilledAction, 3, 150, 180);
    expect(1 - r.avg).toBeGreaterThanOrEqual(0.55);
  });
});
