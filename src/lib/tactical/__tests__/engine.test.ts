import { describe, it, expect } from "vitest";
import {
  aiAction,
  beats,
  counterFor,
  createBattle,
  feintChance,
  masteryMultiplier,
  resolveRound,
  runAuto,
  skilledAction,
  toBattleLog,
} from "../engine";
import { InvalidActionError, type TacticalState, type Intent } from "../types";
import { mulberry32 } from "../rng";
import { COUNTER_INTERRUPT, COUNTER_MULT, FEINT_MAX } from "../constants";
import { makeAgent, half } from "./fixtures";

function battle(
  attackerRole: "medieval" | "future" | "modern" = "medieval",
  defenderRole: "medieval" | "future" | "modern" = "medieval",
  intent: Intent = { kind: "strike", category: "Technical" }
): TacticalState {
  const s = createBattle(makeAgent("a", attackerRole), makeAgent("d", defenderRole), "training", half);
  return { ...s, intent };
}

function hpLoss(before: TacticalState, after: TacticalState, side: "attacker" | "defender") {
  return before.sides[side].hp - after.sides[side].hp;
}

describe("category cycle", () => {
  it("each category beats exactly the next one", () => {
    expect(beats("Physical", "Technical")).toBe(true);
    expect(beats("Technical", "Mental")).toBe(true);
    expect(beats("Mental", "Spiritual")).toBe(true);
    expect(beats("Spiritual", "Social")).toBe(true);
    expect(beats("Social", "Physical")).toBe(true);
    expect(beats("Technical", "Physical")).toBe(false);
    expect(beats("Physical", "Mental")).toBe(false);
  });

  it("counterFor returns the category that beats the given one", () => {
    expect(counterFor("Technical")).toBe("Physical");
    expect(counterFor("Physical")).toBe("Social");
    expect(counterFor("Spiritual")).toBe("Mental");
  });
});

describe("createBattle", () => {
  it("sets max HP from the dimension sum and telegraphs an intent", () => {
    const s = createBattle(makeAgent("a", "medieval"), makeAgent("d", "future"), "pvp", half);
    expect(s.sides.attacker.maxHp).toBe(150 * 50);
    expect(s.sides.attacker.hp).toBe(s.sides.attacker.maxHp);
    expect(s.round).toBe(0);
    expect(s.finished).toBe(false);
    expect(["strike", "special"]).toContain(s.intent.kind);
  });
});

describe("resolveRound", () => {
  it("a counter adds +1 focus and interrupts the opponent's strike", () => {
    const s = battle("modern", "modern");
    const countered = resolveRound(s, { type: "strike", category: "Physical" }, half, { manual: true });
    const plain = resolveRound(s, { type: "strike", category: "Spiritual" }, half, { manual: true });
    expect(countered.rounds[0].countered).toBe(true);
    expect(plain.rounds[0].countered).toBe(false);
    expect(countered.sides.attacker.focus).toBe(2);
    expect(plain.sides.attacker.focus).toBe(1);
    expect(hpLoss(s, countered, "attacker")).toBe(Math.round(hpLoss(s, plain, "attacker") * COUNTER_INTERRUPT));
    expect(countered.counters).toBe(1);
  });

  it("striking a category that the defender's strike beats gets you countered", () => {
    const s = battle("modern", "modern", { kind: "strike", category: "Physical" });
    // Physical beats Technical: the attacker's Technical strike is the one countered.
    const bad = resolveRound(s, { type: "strike", category: "Technical" }, half, { manual: true });
    const neutral = resolveRound(s, { type: "strike", category: "Spiritual" }, half, { manual: true });
    expect(bad.rounds[0].counteredBy).toBe(true);
    expect(hpLoss(s, bad, "attacker")).toBe(Math.round(hpLoss(s, neutral, "attacker") * COUNTER_MULT));
    expect(hpLoss(s, bad, "defender")).toBe(Math.round(hpLoss(s, neutral, "defender") * COUNTER_INTERRUPT));
  });

  it("a counter multiplies damage by COUNTER_MULT compared with the same strike uncountered", () => {
    const s = battle("modern", "modern");
    const countered = resolveRound(s, { type: "strike", category: "Physical" }, half, { manual: true });
    const plain = resolveRound(
      { ...s, intent: { kind: "strike", category: "Mental" } },
      { type: "strike", category: "Physical" },
      half,
      { manual: true }
    );
    expect(hpLoss(s, countered, "defender")).toBe(Math.round(hpLoss(s, plain, "defender") * COUNTER_MULT));
  });

  it("guard reduces incoming damage by 60% and adds +1 focus", () => {
    const s = battle("modern", "modern");
    const guarded = resolveRound(s, { type: "guard" }, half, { manual: true });
    const plain = resolveRound(s, { type: "strike", category: "Spiritual" }, half, { manual: true });
    expect(hpLoss(s, guarded, "attacker")).toBe(Math.round(hpLoss(s, plain, "attacker") * 0.4));
    expect(hpLoss(s, guarded, "defender")).toBe(0);
    expect(guarded.sides.attacker.focus).toBe(2);
  });

  it("rejects a special with less than 3 focus", () => {
    const s = battle();
    s.sides.attacker.focus = 2;
    expect(() => resolveRound(s, { type: "special" }, half, { manual: true })).toThrow(InvalidActionError);
  });

  it("Shield Bash stuns the defender: next intent is stunned and it deals no damage next round", () => {
    const s = battle("medieval");
    s.sides.attacker.focus = 3;
    const r1 = resolveRound(s, { type: "special" }, half, { manual: true });
    expect(r1.intent.kind).toBe("stunned");
    expect(r1.rounds[0].special).toBe("Shield Bash");
    expect(r1.sides.attacker.focus).toBe(1); // 3 - 3 + 1 end-of-round
    const r2 = resolveRound(r1, { type: "guard" }, half, { manual: true });
    expect(hpLoss(r1, r2, "attacker")).toBe(0);
  });

  it("a stunned attacker deals no damage whatever it submits, and recovers next round", () => {
    const s = battle();
    s.sides.attacker.stunned = true;
    const r = resolveRound(s, { type: "strike", category: "Physical" }, half, { manual: true });
    expect(hpLoss(s, r, "defender")).toBe(0);
    expect(r.rounds[0].playerAction).toBe("stunned");
    expect(r.sides.attacker.stunned).toBe(false);
  });

  it("Overclock ignores defense", () => {
    const tank = makeAgent("d", "medieval", 150, { Technical: 1000 });
    const s0 = createBattle(makeAgent("a", "future"), tank, "training", half);
    const s = { ...s0, intent: { kind: "stunned" } as Intent };
    s.sides.attacker.focus = 3;
    const normal = resolveRound(s, { type: "strike", category: "Technical" }, half, { manual: true });
    const over = resolveRound(s, { type: "special" }, half, { manual: true });
    expect(hpLoss(s, normal, "defender")).toBe(5); // floored by the huge defense
    expect(hpLoss(s, over, "defender")).toBeGreaterThan(1000);
  });

  it("Insight grants two rounds of no feints and bonus damage", () => {
    const s = battle("modern");
    s.sides.attacker.focus = 3;
    const r = resolveRound(s, { type: "special" }, half, { manual: true });
    expect(r.sides.attacker.insightRounds).toBe(2);

    const social = makeAgent("d", "medieval", 150, { Social: 100000 });
    const rng = mulberry32(3);
    let feints = 0;
    for (let i = 0; i < 200; i++) {
      const b = createBattle(makeAgent("a", "modern"), social, "training", rng);
      b.sides.attacker.insightRounds = 2;
      b.intent = { kind: "strike", category: "Physical" };
      if (resolveRound(b, { type: "guard" }, rng, { manual: true }).rounds[0].feint) feints++;
    }
    expect(feints).toBe(0);
  });

  it("high-Social defenders sometimes feint when Insight is not active", () => {
    const social = makeAgent("d", "medieval", 150, { Social: 100000 });
    const rng = mulberry32(4);
    let feints = 0;
    for (let i = 0; i < 400; i++) {
      const b = createBattle(makeAgent("a", "modern"), social, "training", rng);
      b.intent = { kind: "strike", category: "Physical" };
      if (resolveRound(b, { type: "guard" }, rng, { manual: true }).rounds[0].feint) feints++;
    }
    expect(feints).toBeGreaterThan(400 * FEINT_MAX * 0.7);
    expect(feints).toBeLessThan(400 * FEINT_MAX * 1.3);
  });

  it("an unguarded ULTIMATE hits 3x a regular strike; guarding cuts it below a regular strike", () => {
    const s = battle("modern", "modern", { kind: "strike", category: "Physical" });
    const regular = resolveRound(s, { type: "strike", category: "Spiritual" }, half, { manual: true });
    const ult = { ...s, intent: { kind: "ultimate", category: "Physical" } as Intent };
    const unguarded = resolveRound(ult, { type: "strike", category: "Spiritual" }, half, { manual: true });
    const guarded = resolveRound(ult, { type: "guard" }, half, { manual: true });
    expect(hpLoss(s, unguarded, "attacker")).toBe(hpLoss(s, regular, "attacker") * 3);
    expect(hpLoss(s, guarded, "attacker")).toBeLessThan(hpLoss(s, regular, "attacker"));
  });

  it("at the round cap the higher HP% wins and an exact tie goes to the defender", () => {
    const s = battle("medieval", "medieval", { kind: "stunned" });
    s.round = 11;
    s.sides.attacker.hp = s.sides.attacker.maxHp / 2;
    s.sides.defender.hp = s.sides.defender.maxHp / 2;
    const tie = resolveRound(s, { type: "guard" }, half, { manual: true });
    expect(tie.finished).toBe(true);
    expect(tie.winner).toBe("defender");

    const ahead = { ...s, sides: { ...s.sides, attacker: { ...s.sides.attacker, hp: s.sides.attacker.maxHp } } };
    expect(resolveRound(ahead, { type: "guard" }, half, { manual: true }).winner).toBe("attacker");
  });

  it("does not mutate its input", () => {
    const s = battle();
    const snapshot = structuredClone(s);
    resolveRound(s, { type: "strike", category: "Physical" }, half, { manual: true });
    expect(s).toEqual(snapshot);
  });

  it("counts manual actions only when manual", () => {
    const s = battle();
    expect(resolveRound(s, { type: "guard" }, half, { manual: true }).manualActions).toBe(1);
    expect(resolveRound(s, { type: "guard" }, half, { manual: false }).manualActions).toBe(0);
  });
});

describe("feintChance", () => {
  it("clamps between FEINT_MIN and FEINT_MAX", () => {
    const low = createBattle(makeAgent("a", "modern"), makeAgent("d", "modern", 150, { Social: 0 }), "training", half);
    const high = createBattle(makeAgent("a", "modern"), makeAgent("d", "modern", 150, { Social: 1e6 }), "training", half);
    expect(feintChance(low.sides.defender)).toBe(0.05);
    expect(feintChance(high.sides.defender)).toBe(FEINT_MAX);
  });
});

describe("aiAction", () => {
  it("guards a telegraphed special when below half HP", () => {
    const s = battle("medieval", "medieval", { kind: "special" });
    s.sides.attacker.hp = s.sides.attacker.maxHp * 0.4;
    expect(aiAction(s, half)).toEqual({ type: "guard" });
  });

  it("uses a special when it has 3 focus", () => {
    const s = battle();
    s.sides.attacker.focus = 3;
    expect(aiAction(s, half)).toEqual({ type: "special" });
  });

  it("Auto does not read intents: it samples strike categories weighted toward its strengths", () => {
    const strongMental = makeAgent("a", "modern", 150, { Mental: 300 });
    const s = { ...createBattle(strongMental, makeAgent("d", "medieval"), "training", half), intent: { kind: "strike", category: "Spiritual" } as Intent };
    const rng = mulberry32(11);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const a = aiAction(s, rng);
      if (a.type === "strike") counts[a.category] = (counts[a.category] ?? 0) + 1;
    }
    expect(counts.Mental).toBeGreaterThan(400);
    expect(Object.keys(counts).length).toBe(5);
  });

  it("always guards a telegraphed ULTIMATE", () => {
    const s = battle("medieval", "medieval", { kind: "ultimate", category: "Physical" });
    s.sides.attacker.focus = 3;
    expect(aiAction(s, half)).toEqual({ type: "guard" });
  });
});

describe("skilledAction", () => {
  it("counters a telegraphed strike", () => {
    const s = battle("medieval", "medieval", { kind: "strike", category: "Mental" });
    expect(skilledAction(s)).toEqual({ type: "strike", category: "Technical" });
  });
});

describe("runAuto + toBattleLog", () => {
  it("finishes the battle and produces a tactical battle log", () => {
    const s = createBattle(makeAgent("a", "medieval"), makeAgent("d", "future"), "training", mulberry32(9));
    const done = runAuto(s, mulberry32(10));
    expect(done.finished).toBe(true);
    expect(done.winner).not.toBeNull();
    const log = toBattleLog(done);
    expect(log.tactical).toBe(true);
    expect(log.rounds).toHaveLength(done.round);
    expect(log.winnerId).toBe(done.winner === "attacker" ? "a" : "d");
    expect(Object.keys(log.attackerGrowth).length).toBeGreaterThan(0);
  });
});

describe("manual counters", () => {
  it("only counters made on manual turns count toward mastery", () => {
    const s = battle("modern", "modern");
    const auto = resolveRound(s, { type: "strike", category: "Physical" }, half, { manual: false });
    expect(auto.counters).toBe(1);
    expect(auto.manualCounters).toBe(0);
    const manual = resolveRound(s, { type: "strike", category: "Physical" }, half, { manual: true });
    expect(manual.manualCounters).toBe(1);
    expect(manual.rounds[0].manual).toBe(true);
  });
});

describe("masteryMultiplier", () => {
  it("is 1 for auto-only battles", () => {
    expect(masteryMultiplier({ manualActions: 0, manualCounters: 3 })).toBe(1);
  });
  it("adds 10% per counter when played manually, capped at 1.5", () => {
    expect(masteryMultiplier({ manualActions: 1, manualCounters: 3 })).toBeCloseTo(1.3);
    expect(masteryMultiplier({ manualActions: 1, manualCounters: 10 })).toBe(1.5);
  });
});

describe("gear in battle", () => {
  it("adds weapon/armor/relic bonuses to category averages and speed, but not HP", async () => {
    const { toSide } = await import("../engine");
    const plain = toSide(makeAgent("g", "future", 150));
    const geared = toSide({ ...makeAgent("g", "future", 150), gear: { weapon: 2, armor: 3, relic: 4 } });
    expect(geared.catAvg.Technical - plain.catAvg.Technical).toBe(9);
    expect(geared.catAvg.Physical - plain.catAvg.Physical).toBe(3);
    expect(geared.catAvg.Social - plain.catAvg.Social).toBe(7);
    expect(geared.speed - plain.speed).toBe(8);
    expect(geared.maxHp).toBe(plain.maxHp);
  });
});

