import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RaidRewards } from "../RaidRewards";
import { REWARDS } from "@/lib/raid/rewards";

describe("RaidRewards", () => {
  it("lists every tier with its ability and weakness growth", () => {
    render(<RaidRewards weakness="Technical" myRank={null} />);
    expect(screen.getByText(/Champion/)).toBeInTheDocument();
    expect(screen.getByText(`+${REWARDS.champion.ability} Ability ·`, { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText(/Technical/).length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/Last hit/)).toBeInTheDocument();
  });

  it("highlights the viewer's tier", () => {
    render(<RaidRewards weakness="Social" myRank={5} />);
    expect(screen.getByText(/Vanguard/).closest("li")).toHaveTextContent("(you)");
    expect(screen.getByText(/Champion/).closest("li")).not.toHaveTextContent("(you)");
  });
});
