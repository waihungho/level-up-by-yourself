import { describe, it, expect } from "vitest";
import { generateSpriteData } from "../sprite-renderer";

describe("generateSpriteData", () => {
  it("returns a 2D pixel grid", () => {
    const grid = generateSpriteData({
      bodyType: 0, headType: 0, eyeType: 0,
      weaponType: 0, auraType: 0, colorSeed: 180,
    }, "future");
    expect(grid.length).toBeGreaterThan(0);
    expect(grid[0].length).toBeGreaterThan(0);
  });

  it("is deterministic for same seed", () => {
    const seed = { bodyType: 2, headType: 3, eyeType: 1, weaponType: 4, auraType: 2, colorSeed: 90 };
    const a = generateSpriteData(seed, "medieval");
    const b = generateSpriteData(seed, "medieval");
    expect(a).toEqual(b);
  });

  it("produces different output for different seeds", () => {
    const a = generateSpriteData({ bodyType: 0, headType: 0, eyeType: 0, weaponType: 0, auraType: 0, colorSeed: 0 }, "future");
    const b = generateSpriteData({ bodyType: 4, headType: 5, eyeType: 3, weaponType: 7, auraType: 4, colorSeed: 180 }, "medieval");
    expect(a).not.toEqual(b);
  });
});
