import { describe, it, expect } from "vitest";
import { BOSSES, bossForWeek, computeBossStats } from "../bosses";
import {
  attemptDamage,
  createRaidAttempt,
  currentWeakness,
  phaseFor,
  raidIntent,
  resolveRaidRound,
  runRaidAuto,
  RAID_MAX_ROUNDS,
  type RaidContext,
  type RaidState,
} from "../raid-engine";
import { mulberry32 } from "@/lib/tactical/rng";
import { makeAgent, makeRoleAgent, half } from "@/lib/tactical/__tests__/fixtures";
import type { Intent } from "@/lib/tactical/types";

const def = BOSSES[0]; // Iron Colossus: weak Social -> Mental, resist Physical
const squad = { playerId: "p1", agents: [makeRoleAgent("a0", "medieval"), makeRoleAgent("a1", "future"), makeRoleAgent("a2", "modern")] };

function ctx(over: Partial<RaidContext> = {}): RaidContext {
  return { def, stats: computeBossStats([], def), maxHp: 1_000_000, hpAtStart: 1_000_000, solo: false, ...over };
}

function attempt(intent: Intent = { kind: "stunned" }, c = ctx(), players = squad): RaidState {
  return { ...createRaidAttempt(players, c, half), intent };
}

function dealt(before: RaidState, after: RaidState) {
  return after.damageDealt - before.damageDealt;
}

describe("bosses", () => {
  it("has 5 bosses in a weekly rotation", () => {
    expect(BOSSES).toHaveLength(5);
    expect(bossForWeek(5)).toBe(BOSSES[0]);
    expect(bossForWeek(7)).toBe(BOSSES[2]);
  });

  it("scales boss stats from the 75th percentile of agents times the profile", () => {
    const agents = [100, 200, 300, 400].map((v, i) => makeAgent(`x${i}`, "modern", v));
    const stats = computeBossStats(agents, def);
    expect(stats.catAvg.Physical).toBeCloseTo(300 * def.profile.Physical);
    expect(stats.speed).toBe(300);
  });

  it("falls back to 150 per category with no agents", () => {
    expect(computeBossStats([], def).catAvg.Mental).toBeCloseTo(150 * def.profile.Mental);
  });
});

describe("phases", () => {
  it("changes phase at 66% and 33% of max HP", () => {
    expect(phaseFor(1000, 1000)).toBe(1);
    expect(phaseFor(661, 1000)).toBe(1);
    expect(phaseFor(660, 1000)).toBe(2);
    expect(phaseFor(331, 1000)).toBe(2);
    expect(phaseFor(330, 1000)).toBe(3);
  });

  it("rotates the weakness from phase 2", () => {
    expect(currentWeakness(def, 1)).toBe(def.weak);
    expect(currentWeakness(def, 2)).toBe(def.p2Weak);
    expect(currentWeakness(def, 3)).toBe(def.p2Weak);
  });
});

describe("damage modifiers", () => {
  it("striking the weakness deals 1.5x and the resistance 0.5x a neutral strike", () => {
    const s = attempt();
    const weak = resolveRaidRound(s, { type: "strike", category: def.weak }, half, { manual: true });
    const resist = resolveRaidRound(s, { type: "strike", category: def.resist }, half, { manual: true });
    // Same attacker stats in every category for this comparison.
    const flat = attempt({ kind: "stunned" }, ctx(), { playerId: "p1", agents: [makeAgent("f0", "modern"), makeAgent("f1", "modern"), makeAgent("f2", "modern")] });
    const fWeak = dealt(flat, resolveRaidRound(flat, { type: "strike", category: def.weak }, half, { manual: true }));
    const fNeutral = dealt(flat, resolveRaidRound(flat, { type: "strike", category: "Spiritual" }, half, { manual: true }));
    const fResist = dealt(flat, resolveRaidRound(flat, { type: "strike", category: def.resist }, half, { manual: true }));
    expect(dealt(s, weak)).toBeGreaterThan(0);
    expect(dealt(s, resist)).toBeGreaterThan(0);
    expect(fWeak / fNeutral).toBeCloseTo(1.5, 1);
    expect(fResist).toBeLessThan(fNeutral);
  });

  it("solo attempts deal 1.5x the damage of the same agent without the solo flag", () => {
    const one = { playerId: "p1", agents: [makeRoleAgent("s0", "future")] };
    const solo = attempt({ kind: "stunned" }, ctx({ solo: true }), one);
    const notSolo = attempt({ kind: "stunned" }, ctx({ solo: false }), one);
    const a = dealt(solo, resolveRaidRound(solo, { type: "strike", category: "Spiritual" }, half, { manual: true }));
    const b = dealt(notSolo, resolveRaidRound(notSolo, { type: "strike", category: "Spiritual" }, half, { manual: true }));
    expect(a / b).toBeCloseTo(1.5, 1);
  });

  it("Shield Bash never stuns the boss", () => {
    const s = attempt({ kind: "strike", category: "Physical" });
    s.teams.attacker.focus = 3;
    const r = resolveRaidRound(s, { type: "special" }, half, { manual: true });
    expect(r.intent.kind).not.toBe("stunned");
  });
});

describe("boss intents", () => {
  function intentsOver(hpPct: number) {
    const s = attempt({ kind: "stunned" }, ctx({ hpAtStart: 1_000_000 * hpPct }));
    const kinds: string[] = [];
    for (let round = 0; round < RAID_MAX_ROUNDS; round++) kinds.push(raidIntent({ ...s, round }, mulberry32(round)).kind);
    return kinds; // index i = intent for round i+1
  }

  it("never telegraphs ULTIMATE in phase 1", () => {
    expect(intentsOver(0.9)).not.toContain("ultimate");
  });

  it("telegraphs ULTIMATE every 4th round in phase 2", () => {
    const k = intentsOver(0.5);
    expect([3, 7].map((i) => k[i])).toEqual(["ultimate", "ultimate"]);
    expect(k.filter((x) => x === "ultimate")).toHaveLength(2);
  });

  it("telegraphs ULTIMATE every 3rd round in phase 3", () => {
    const k = intentsOver(0.2);
    expect([2, 5, 8].map((i) => k[i])).toEqual(["ultimate", "ultimate", "ultimate"]);
  });

  it("never feints", () => {
    const rng = mulberry32(2);
    let s = attempt({ kind: "strike", category: "Physical" });
    let feints = 0;
    for (let i = 0; i < 200; i++) {
      s = { ...attempt({ kind: "strike", category: "Physical" }) };
      if (resolveRaidRound(s, { type: "guard" }, rng, { manual: true }).rounds[0].feint) feints++;
    }
    expect(feints).toBe(0);
  });
});

describe("attempts", () => {
  it("end after 10 rounds at most and report damage", () => {
    const done = runRaidAuto(createRaidAttempt(squad, ctx(), mulberry32(1)), mulberry32(2));
    expect(done.finished).toBe(true);
    expect(done.round).toBeLessThanOrEqual(RAID_MAX_ROUNDS);
    expect(attemptDamage(done)).toBeGreaterThan(0);
  });

  it("clamp damage to the boss HP left at the start", () => {
    const done = runRaidAuto(createRaidAttempt(squad, ctx({ hpAtStart: 500 }), mulberry32(1)), mulberry32(2));
    expect(attemptDamage(done)).toBe(500);
  });
});

describe("MEDIAN_ATTEMPT_DAMAGE", () => {
  it("is within 25% of the simulated median attempt for a 150-stat squad vs a 150-stat boss", async () => {
    const { MEDIAN_ATTEMPT_DAMAGE } = await import("../raid-engine");
    const rng = mulberry32(42);
    const pool = [makeRoleAgent("b0", "medieval"), makeRoleAgent("b1", "future"), makeRoleAgent("b2", "modern")];
    const damages: number[] = [];
    for (let i = 0; i < 400; i++) {
      const d = BOSSES[i % BOSSES.length];
      const c = { def: d, stats: computeBossStats(pool, d), maxHp: 10_000_000, hpAtStart: 10_000_000, solo: false };
      damages.push(attemptDamage(runRaidAuto(createRaidAttempt(squad, c, rng), rng)));
    }
    damages.sort((a, b) => a - b);
    const median = damages[200];
    expect(MEDIAN_ATTEMPT_DAMAGE).toBeGreaterThan(median * 0.75);
    expect(MEDIAN_ATTEMPT_DAMAGE).toBeLessThan(median * 1.25);
  });
});
