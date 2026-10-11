import { describe, it, expect } from "vitest";
import { calculateGrowth, getGrowthMultiplier } from "../daily-growth";

describe("getGrowthMultiplier", () => {
  it("returns 1.0 for score 0-99", () => {
    expect(getGrowthMultiplier(0)).toBe(1.0);
    expect(getGrowthMultiplier(99)).toBe(1.0);
  });

  it("returns 1.5 for score 100-499", () => {
    expect(getGrowthMultiplier(100)).toBe(1.5);
    expect(getGrowthMultiplier(499)).toBe(1.5);
  });

  it("returns 2.0 for score 500+", () => {
    expect(getGrowthMultiplier(500)).toBe(2.0);
    expect(getGrowthMultiplier(9999)).toBe(2.0);
  });
});

describe("calculateGrowth", () => {
  it("returns changes for some dimensions", () => {
    const changes = calculateGrowth("medieval", 1.0);
    expect(Object.keys(changes).length).toBeGreaterThan(0);
    expect(Object.keys(changes).length).toBeLessThanOrEqual(50);
  });

  it("higher multiplier produces larger growth values", () => {
    let lowTotal = 0, highTotal = 0;
    for (let i = 0; i < 100; i++) {
      const low = calculateGrowth("medieval", 1.0);
      const high = calculateGrowth("medieval", 2.0);
      lowTotal += Object.values(low).reduce((s, v) => s + v, 0);
      highTotal += Object.values(high).reduce((s, v) => s + v, 0);
    }
    expect(highTotal).toBeGreaterThan(lowTotal);
  });
});
