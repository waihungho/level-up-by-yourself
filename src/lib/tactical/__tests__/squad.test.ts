import { describe, it, expect } from "vitest";
import {
  buildTeam,
  createSquadBattle,
  resolveSquadRound,
  runSquadAuto,
  squadAiAction,
  squadGrowth,
  synergyFor,
  synergyMult,
  type SquadState,
} from "../squad";
import { InvalidActionError, type Intent } from "../types";
import { mulberry32 } from "../rng";
import { MAX_FOCUS, SQUAD_MAX_ROUNDS, SYNERGY_LEGION, SYNERGY_LEGION_OFF, SYNERGY_PAIR, SYNERGY_TRINITY } from "../constants";
import { makeAgent, half } from "./fixtures";
import type { RoleCategory } from "@/lib/types";

function squad(prefix: string, roles: RoleCategory[] = ["medieval", "future", "modern"], value = 150) {
  return { playerId: "p-" + prefix, agents: roles.map((r, i) => makeAgent(`${prefix}${i}`, r, value)) };
}

function battle(intent: Intent = { kind: "strike", category: "Technical" }): SquadState {
  return { ...createSquadBattle(squad("a"), squad("d"), half), intent };
}

describe("synergyFor", () => {
  it("three different roles is Trinity", () => {
    expect(synergyFor(["medieval", "future", "modern"])).toEqual({ name: "trinity" });
  });
  it("two of a role is a Pair on that role", () => {
    expect(synergyFor(["future", "medieval", "future"])).toEqual({ name: "pair", role: "future" });
  });
  it("three of a role is Legion", () => {
    expect(synergyFor(["modern", "modern", "modern"])).toEqual({ name: "legion", role: "modern" });
  });
  it("teams smaller than 3 have no synergy", () => {
    expect(synergyFor(["modern"])).toEqual({ name: "none" });
  });
});

describe("synergyMult", () => {
  it("Trinity boosts everything", () => {
    const t = buildTeam("p", squad("x").agents);
    expect(synergyMult(t, 0, "Social")).toBeCloseTo(SYNERGY_TRINITY);
  });
  it("Pair boosts the role category for pair members only", () => {
    const t = buildTeam("p", squad("x", ["future", "future", "medieval"]).agents);
    expect(synergyMult(t, 0, "Technical")).toBeCloseTo(SYNERGY_PAIR);
    expect(synergyMult(t, 0, "Mental")).toBe(1);
    expect(synergyMult(t, 2, "Technical")).toBe(1);
  });
  it("Legion boosts the role category and weakens the rest", () => {
    const t = buildTeam("p", squad("x", ["medieval", "medieval", "medieval"]).agents);
    expect(synergyMult(t, 1, "Physical")).toBeCloseTo(SYNERGY_LEGION);
    expect(synergyMult(t, 1, "Mental")).toBeCloseTo(SYNERGY_LEGION_OFF);
  });
});

describe("resolveSquadRound", () => {
  it("a KO brings in the next living member", () => {
    const s = battle();
    s.teams.defender.members[0].hp = 1;
    const r = resolveSquadRound(s, { type: "strike", category: "Physical" }, half, { manual: true });
    expect(r.teams.defender.active).toBe(1);
    expect(r.rounds[0].ko).toEqual({ side: "defender", slot: 0 });
    expect(r.finished).toBe(false);
  });

  it("swapping in halves the damage the incoming agent takes", () => {
    const s = battle();
    const swapped = resolveSquadRound(s, { type: "swap", slot: 1 }, half, { manual: true });
    const stayed = resolveSquadRound(s, { type: "strike", category: "Spiritual" }, half, { manual: true });
    const lostSwap = s.teams.attacker.members[1].hp - swapped.teams.attacker.members[1].hp;
    const lostStay = s.teams.attacker.members[0].hp - stayed.teams.attacker.members[0].hp;
    expect(swapped.teams.attacker.active).toBe(1);
    expect(lostSwap).toBeGreaterThan(0);
    expect(lostSwap).toBeLessThan(lostStay);
    expect(swapped.rounds[0].swap).toEqual({ side: "attacker", from: 0, to: 1, tag: false });
    expect(s.teams.defender.members[0].hp - swapped.teams.defender.members[0].hp).toBe(0);
  });

  it("a swap with 3 focus fires a Tag Special and spends the focus", () => {
    const s = battle();
    s.teams.attacker.focus = 3;
    const r = resolveSquadRound(s, { type: "swap", slot: 2 }, half, { manual: true });
    expect(r.rounds[0].swap?.tag).toBe(true);
    expect(r.rounds[0].special).toBe("Insight");
    expect(r.teams.attacker.focus).toBe(1);
    expect(s.teams.defender.members[0].hp - r.teams.defender.members[0].hp).toBeGreaterThan(0);
  });

  it("rejects swapping to the active slot or a KO'd member", () => {
    const s = battle();
    expect(() => resolveSquadRound(s, { type: "swap", slot: 0 }, half, { manual: true })).toThrow(InvalidActionError);
    s.teams.attacker.members[2].hp = 0;
    expect(() => resolveSquadRound(s, { type: "swap", slot: 2 }, half, { manual: true })).toThrow(InvalidActionError);
    expect(() => resolveSquadRound(s, { type: "swap", slot: 7 }, half, { manual: true })).toThrow(InvalidActionError);
  });

  it("team focus is shared and capped", () => {
    const s = battle();
    s.teams.attacker.focus = MAX_FOCUS;
    const r = resolveSquadRound(s, { type: "guard" }, half, { manual: true });
    expect(r.teams.attacker.focus).toBe(MAX_FOCUS);
  });

  it("a final KO on the last round wins outright instead of going to HP%", () => {
    const s = battle();
    s.round = SQUAD_MAX_ROUNDS - 1;
    s.teams.defender.members.forEach((m, i) => (m.hp = i === 0 ? 1 : 0));
    s.teams.attacker.members.forEach((m, i) => (m.hp = i === 0 ? 10 : 0));
    const r = resolveSquadRound(s, { type: "strike", category: "Physical" }, half, { manual: true });
    expect(r.finished).toBe(true);
    expect(r.winner).toBe("attacker");
  });

  it("at the cap the team with higher total HP% wins", () => {
    const s = battle({ kind: "stunned" });
    s.round = SQUAD_MAX_ROUNDS - 1;
    s.teams.defender.members.forEach((m) => (m.hp = m.maxHp * 0.2));
    const r = resolveSquadRound(s, { type: "guard" }, half, { manual: true });
    expect(r.winner).toBe("attacker");
  });

  it("does not mutate its input", () => {
    const s = battle();
    const snap = structuredClone(s);
    resolveSquadRound(s, { type: "swap", slot: 1 }, half, { manual: true });
    expect(s).toEqual(snap);
  });
});

describe("squadAiAction", () => {
  it("guards an ULTIMATE", () => {
    expect(squadAiAction(battle({ kind: "ultimate", category: "Physical" }), half)).toEqual({ type: "guard" });
  });
  it("swaps a low-HP active agent out to an ally that counters the opponent's last category", () => {
    const s = battle();
    s.round = 5;
    s.teams.attacker.members[0].hp = s.teams.attacker.members[0].maxHp * 0.1;
    s.teams.attacker.members[1] = { ...s.teams.attacker.members[1], catAvg: { ...s.teams.attacker.members[1].catAvg, Physical: 400 } };
    s.rounds = [{ opponentAction: "Technical" } as SquadState["rounds"][number]];
    expect(squadAiAction(s, half)).toEqual({ type: "swap", slot: 1 });
  });
});

describe("runSquadAuto + squadGrowth", () => {
  it("finishes and only grows agents that fought", () => {
    const done = runSquadAuto(createSquadBattle(squad("a"), squad("d"), mulberry32(5)), mulberry32(6));
    expect(done.finished).toBe(true);
    const g = squadGrowth(done);
    const fought = done.teams.attacker.members.filter((_, i) => done.teams.attacker.participated[i]).map((m) => m.agentId);
    expect(Object.keys(g.attacker).sort()).toEqual(fought.sort());
    for (const growth of Object.values(g.attacker)) {
      for (const v of Object.values(growth)) expect(v).toBeLessThanOrEqual(2 * 0.6 * 1.5 + 0.01);
    }
  });
});
