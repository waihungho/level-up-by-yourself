import { describe, it, expect } from "vitest";
import { DIMENSIONS, ROLE_WEIGHTS, GROWTH_TIERS } from "../constants";

describe("constants", () => {
  it("has exactly 50 dimensions", () => {
    expect(DIMENSIONS).toHaveLength(50);
  });

  it("has 5 categories with 10 dimensions each", () => {
    const categories = ["Physical", "Mental", "Social", "Spiritual", "Technical"];
    for (const cat of categories) {
      expect(DIMENSIONS.filter((d) => d.category === cat)).toHaveLength(10);
    }
  });

  it("has weights for all 3 role categories", () => {
    expect(ROLE_WEIGHTS).toHaveProperty("future");
    expect(ROLE_WEIGHTS).toHaveProperty("modern");
    expect(ROLE_WEIGHTS).toHaveProperty("medieval");
  });

  it("has growth tiers", () => {
    expect(GROWTH_TIERS).toHaveLength(3);
  });
});
