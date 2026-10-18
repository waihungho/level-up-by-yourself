import { describe, it, expect } from "vitest";
import { passTitleId, PREMIUM_PRICE_SOL, rewardFor, TIERS, tierForXp, XP_PER_TIER } from "../rewards";
import { titleLabel } from "@/lib/shop/catalog";
import { passMemo } from "@/lib/payment-memos";

describe("pass rewards", () => {
  it("has 30 tiers of 250 XP and a 0.15 SOL premium", () => {
    expect(TIERS).toBe(30);
    expect(XP_PER_TIER).toBe(250);
    expect(PREMIUM_PRICE_SOL).toBe(0.15);
  });

  it("tier N needs N x 250 XP, capped at 30", () => {
    expect(tierForXp(0)).toBe(0);
    expect(tierForXp(249)).toBe(0);
    expect(tierForXp(250)).toBe(1);
    expect(tierForXp(7499)).toBe(29);
    expect(tierForXp(7500)).toBe(30);
    expect(tierForXp(99_999)).toBe(30);
  });

  it("free track: 3 gems, every 5th tier 10 gems + 1 raid ticket", () => {
    expect(rewardFor(1, "free")).toEqual({ gems: 3, tickets: 0, title: false });
    expect(rewardFor(5, "free")).toEqual({ gems: 10, tickets: 1, title: false });
    expect(rewardFor(30, "free")).toEqual({ gems: 10, tickets: 1, title: false });
  });

  it("premium track: 12 gems, every 5th tier 40 gems, tier 30 adds the title", () => {
    expect(rewardFor(2, "premium")).toEqual({ gems: 12, tickets: 0, title: false });
    expect(rewardFor(10, "premium")).toEqual({ gems: 40, tickets: 0, title: false });
    expect(rewardFor(30, "premium")).toEqual({ gems: 40, tickets: 0, title: true });
  });

  it("free track totals 132 gems and 6 tickets", () => {
    let gems = 0;
    let tickets = 0;
    for (let t = 1; t <= TIERS; t++) {
      gems += rewardFor(t, "free").gems;
      tickets += rewardFor(t, "free").tickets;
    }
    expect({ gems, tickets }).toEqual({ gems: 132, tickets: 6 });
  });

  it("season title id, label and payment memo", () => {
    expect(passTitleId(3)).toBe("pass_s3");
    expect(titleLabel("pass_s3")).toBe("Season 3 Elite");
    expect(titleLabel("unknown_title")).toBe("unknown_title");
    expect(passMemo(2)).toBe("levelup:pass:2");
  });
});
