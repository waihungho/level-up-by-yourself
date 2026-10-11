import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { StrictMode } from "react";
import { SlainOverlay } from "../SlainOverlay";

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("SlainOverlay", () => {
  it("shows once per boss (also under StrictMode) and not again after it closes", () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <StrictMode>
        <SlainOverlay bossId="b1" bossName="Iron Colossus" />
      </StrictMode>
    );
    expect(screen.getByText("SLAIN")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(4000));
    expect(screen.queryByText("SLAIN")).not.toBeInTheDocument();
    unmount();

    render(<SlainOverlay bossId="b1" bossName="Iron Colossus" />);
    expect(screen.queryByText("SLAIN")).not.toBeInTheDocument();
  });

  it("can be dismissed with a tap", () => {
    render(<SlainOverlay bossId="b2" bossName="Void Oracle" />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.queryByText("SLAIN")).not.toBeInTheDocument();
  });
});
