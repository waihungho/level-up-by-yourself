import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrophyBadges } from "../TrophyBadges";

describe("TrophyBadges", () => {
  it("groups trophies by tier with counts", () => {
    render(<TrophyBadges trophies={[{ tier: "champion" }, { tier: "champion" }, { tier: "slayer" }]} />);
    expect(screen.getByLabelText("2 Champion trophies")).toHaveTextContent("2");
    expect(screen.getByLabelText("1 Slayer trophy")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Elite/)).not.toBeInTheDocument();
  });

  it("renders nothing without trophies", () => {
    const { container } = render(<TrophyBadges trophies={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
