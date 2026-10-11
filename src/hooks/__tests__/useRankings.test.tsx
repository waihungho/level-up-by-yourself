import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useRankings, RANKINGS_CACHE_KEY } from "../useRankings";

vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true, getSupabase: () => null }));

const fresh = { totalPlayers: 2, totalAgents: 2, top: [{ id: "new" }] };
const cached = { totalPlayers: 1, totalAgents: 1, top: [{ id: "old" }] };

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("useRankings", () => {
  it("shows cached rankings immediately, then replaces them with fresh ones and caches those", async () => {
    localStorage.setItem(RANKINGS_CACHE_KEY, JSON.stringify(cached));
    let resolve!: (v: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => (resolve = r))));

    const { result } = renderHook(() => useRankings());
    await waitFor(() => expect(result.current.rankings).toEqual(cached));
    expect(result.current.refreshing).toBe(true);

    resolve({ ok: true, json: async () => fresh });
    await waitFor(() => expect(result.current.rankings).toEqual(fresh));
    expect(result.current.refreshing).toBe(false);
    expect(JSON.parse(localStorage.getItem(RANKINGS_CACHE_KEY)!)).toEqual(fresh);
  });

  it("requests /api/rank without waiting for anything else", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => fresh });
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useRankings());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/rank"));
  });

  it("keeps cached rankings and flags an error when the fetch fails", async () => {
    localStorage.setItem(RANKINGS_CACHE_KEY, JSON.stringify(cached));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    const { result } = renderHook(() => useRankings());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.rankings).toEqual(cached);
  });

  it("retry() fetches again after an error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => fresh });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useRankings());
    await waitFor(() => expect(result.current.error).toBe(true));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.rankings).toEqual(fresh));
    expect(result.current.error).toBe(false);
  });
});
