import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WhatsNewBanner } from "../WhatsNewBanner";

afterEach(() => localStorage.clear());

describe("WhatsNewBanner", () => {
  it("lists the latest features with links to try them", () => {
    render(<WhatsNewBanner />);
    expect(screen.getByText(/What's new/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tactical Battles/i })).toHaveAttribute("href", "/battle");
    expect(screen.getByRole("link", { name: /Squad 3v3/i })).toHaveAttribute("href", "/squad");
    expect(screen.getByRole("link", { name: /World Boss/i })).toHaveAttribute("href", "/raid");
  });

  it("stays hidden after being dismissed", () => {
    const { unmount } = render(<WhatsNewBanner />);
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
    expect(screen.queryByText(/What's new/i)).not.toBeInTheDocument();
    unmount();
    render(<WhatsNewBanner />);
    expect(screen.queryByText(/What's new/i)).not.toBeInTheDocument();
  });
});
