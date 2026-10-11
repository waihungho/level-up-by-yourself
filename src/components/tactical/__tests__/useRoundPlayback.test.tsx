import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRoundPlayback } from "../useRoundPlayback";
import type { TacticalRound } from "@/lib/tactical/types";

afterEach(() => vi.useRealTimers());

const round = (n: number) =>
  ({ roundNumber: n, firstAttacker: "a", firstDamage: 10, secondDamage: 5, attackerHpAfter: 90, defenderHpAfter: 80, countered: false } as TacticalRound);

describe("useRoundPlayback", () => {
  it("never calls the completion callback after unmount, even mid-playback after an earlier playback", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useRoundPlayback(() => "a"));
    const first = vi.fn();
    act(() => result.current.play([round(1)], first));
    act(() => void vi.advanceTimersByTime(5000));
    expect(first).toHaveBeenCalledTimes(1);

    const second = vi.fn();
    act(() => result.current.play([round(2), round(3), round(4)], second));
    unmount();
    act(() => void vi.advanceTimersByTime(5000));
    expect(second).not.toHaveBeenCalled();
  });
});
