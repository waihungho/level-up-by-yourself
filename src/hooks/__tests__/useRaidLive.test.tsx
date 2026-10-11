import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRaidLive, RAID_POLL_MS } from "../useRaidLive";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useRaidLive", () => {
  it("loads the raid view and polls when Supabase Realtime is unavailable", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ boss: null }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useRaidLive("w1"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/raid?wallet=w1");
    expect(result.current.view).toEqual({ boss: null });

    await act(async () => {
      vi.advanceTimersByTime(RAID_POLL_MS);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      vi.advanceTimersByTime(RAID_POLL_MS * 2);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
