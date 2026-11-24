import { describe, it, expect } from "vitest";
import { generateInitialDimensions, generateSpriteSeed } from "../agent-init";

describe("generateInitialDimensions", () => {
  it("returns exactly 50 dimensions", () => {
    const dims = generateInitialDimensions("medieval");
    expect(dims).toHaveLength(50);
  });

  it("all values are >= BASE (10)", () => {
    const dims = generateInitialDimensions("future");
    for (const d of dims) {
      expect(d.value).toBeGreaterThanOrEqual(10);
    }
  });

  it("medieval role has higher Physical average than Technical", () => {
    let physTotal = 0, techTotal = 0;
    for (let i = 0; i < 100; i++) {
      const dims = generateInitialDimensions("medieval");
      physTotal += dims.filter((d) => d.dimensionId <= 10).reduce((s, d) => s + d.value, 0);
      techTotal += dims.filter((d) => d.dimensionId >= 41).reduce((s, d) => s + d.value, 0);
    }
    expect(physTotal).toBeGreaterThan(techTotal);
  });
});

describe("generateSpriteSeed", () => {
  it("returns deterministic seed for same inputs", () => {
    const a = generateSpriteSeed("medieval", "TestAgent", "brave warrior");
    const b = generateSpriteSeed("medieval", "TestAgent", "brave warrior");
    expect(a).toEqual(b);
  });

  it("returns different seeds for different inputs", () => {
    const a = generateSpriteSeed("medieval", "AgentA", "brave");
    const b = generateSpriteSeed("future", "AgentB", "smart");
    expect(a).not.toEqual(b);
  });
});

describe("starting stats vs migration 017", () => {
  it("never exceed 32.5, the most levelup_summon_agent accepts", async () => {
    const { BASE_DIMENSION_VALUE, BONUS_MAX, WEIGHT_VALUES } = await import("@/lib/constants");
    // If this changes, update the 0–32.5 check in levelup_summon_agent or summoning breaks.
    expect(BASE_DIMENSION_VALUE + BONUS_MAX * Math.max(...Object.values(WEIGHT_VALUES))).toBe(32.5);
    for (const role of ["future", "modern", "medieval"] as const) {
      for (let i = 0; i < 200; i++) {
        const dims = generateInitialDimensions(role);
        expect(dims).toHaveLength(50);
        for (const d of dims) expect(d.value).toBeLessThanOrEqual(32.5);
      }
    }
  });
});
