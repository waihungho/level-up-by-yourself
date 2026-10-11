import { describe, it, expect } from "vitest";
import { aiAction, createBattle, resolveRound, skilledAction } from "../engine";
import { mulberry32, type Rng } from "../rng";
import type { PlayerAction, TacticalState } from "../types";
import type { RoleCategory } from "@/lib/types";
import { makeAgent } from "./fixtures";

type Policy = (s: TacticalState) => PlayerAction;
const ROLES: RoleCategory[] = ["medieval", "future", "modern"];
const N = 2000;

function simulate(policy: Policy, attackerValue: number, defenderValue: number, seed: number) {
  const rng: Rng = mulberry32(seed);
  let wins = 0;
  const rounds: number[] = [];
  for (let i = 0; i < N; i++) {
    const aRole = ROLES[i % 3];
    const dRole = ROLES[Math.floor(i / 3) % 3];
    let s = createBattle(makeAgent("a", aRole, attackerValue), makeAgent("d", dRole, defenderValue), "pvp", rng);
    while (!s.finished) s = resolveRound(s, policy(s), rng, { manual: false });
    if (s.winner === "attacker") wins++;
    rounds.push(s.round);
  }
  rounds.sort((x, y) => x - y);
  return { winRate: wins / N, medianRounds: rounds[Math.floor(N / 2)] };
}

describe("balance", () => {
  it("equal stats on Auto: median 6-10 rounds, win rate 45-55%", () => {
    const r = simulate(aiAction, 150, 150, 1);
    expect(r.medianRounds).toBeGreaterThanOrEqual(6);
    expect(r.medianRounds).toBeLessThanOrEqual(10);
    expect(r.winRate).toBeGreaterThanOrEqual(0.45);
    expect(r.winRate).toBeLessThanOrEqual(0.55);
  });

  it("intent-reading play beats equal stats 65-80% of the time", () => {
    const r = simulate(skilledAction, 150, 150, 2);
    expect(r.winRate).toBeGreaterThanOrEqual(0.65);
    expect(r.winRate).toBeLessThanOrEqual(0.8);
  });

  it("a 20% stat advantage still wins at least 55% against intent-reading play", () => {
    const r = simulate(skilledAction, 150, 180, 3);
    expect(1 - r.winRate).toBeGreaterThanOrEqual(0.55);
  });
});
