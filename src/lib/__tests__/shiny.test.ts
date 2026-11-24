import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { isShiny, SHINY_ODDS, SHINY_SPARKLE, SHINY_SPARKLE_CORE } from "../shiny";
import { generateSpriteData } from "../sprite-renderer";

describe("isShiny", () => {
  it("is deterministic and ignores uuid letter case", () => {
    const id = randomUUID();
    expect(isShiny(id)).toBe(isShiny(id));
    expect(isShiny(id.toUpperCase())).toBe(isShiny(id));
  });

  it("is false for missing ids", () => {
    expect(isShiny("")).toBe(false);
    expect(isShiny(null)).toBe(false);
    expect(isShiny(undefined)).toBe(false);
  });

  it(`hits roughly 1 in ${SHINY_ODDS} random uuids`, () => {
    const n = 20_000;
    let hits = 0;
    for (let i = 0; i < n; i++) if (isShiny(randomUUID())) hits++;
    // Expected 1.5625%; ±~5σ keeps this from flaking.
    expect(hits / n).toBeGreaterThan(0.01);
    expect(hits / n).toBeLessThan(0.023);
  });
});

describe("generateSpriteData shiny variant", () => {
  const seeds = [
    { bodyType: 0, headType: 0, eyeType: 0, weaponType: 0, auraType: 1, colorSeed: 0 },
    { bodyType: 3, headType: 1, eyeType: 4, weaponType: 6, auraType: 2, colorSeed: 39 },
    { bodyType: 2, headType: 3, eyeType: 2, weaponType: 7, auraType: 3, colorSeed: 180 },
  ];
  const roles = ["future", "modern", "medieval"] as const;
  const isSparkle = (c: string | null) => c === SHINY_SPARKLE || c === SHINY_SPARKLE_CORE;

  it("is unchanged when shiny is false or omitted", () => {
    for (const role of roles) {
      expect(generateSpriteData(seeds[1], role, undefined, false)).toEqual(generateSpriteData(seeds[1], role));
    }
  });

  it("keeps the same shape, recolours it and adds sparkles in empty space", () => {
    for (const seed of seeds) {
      for (const role of roles) {
        const plain = generateSpriteData(seed, role);
        const shiny = generateSpriteData(seed, role, undefined, true);
        let recoloured = 0;
        let sparkles = 0;
        for (let y = 0; y < 32; y++) {
          for (let x = 0; x < 32; x++) {
            if (plain[y][x] === null) {
              // Only sparkles may appear where the plain sprite is empty.
              if (shiny[y][x] !== null) {
                expect(isSparkle(shiny[y][x])).toBe(true);
                sparkles++;
              }
            } else {
              expect(shiny[y][x]).not.toBeNull();
              if (shiny[y][x] !== plain[y][x]) recoloured++;
            }
          }
        }
        expect(sparkles).toBe(4 * 5);
        expect(recoloured).toBeGreaterThan(50);
      }
    }
  });

  it("keeps the gear weapon tint on shiny sprites", () => {
    const tinted = generateSpriteData(seeds[0], "medieval", "#ffd700", true);
    expect(tinted.flat()).toContain("#ffd700");
  });
});
