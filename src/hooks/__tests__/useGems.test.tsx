import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useGems } from "../useGems";

afterEach(() => vi.unstubAllGlobals());

describe("useGems", () => {
  it("loads the balance for the wallet and lets callers set it after a purchase", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ balance: 42, title: "whale" }) });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useGems("w1"));
    await waitFor(() => expect(result.current.balance).toBe(42));
    expect(fetchMock).toHaveBeenCalledWith("/api/shop?wallet=w1");
    act(() => result.current.setBalance(7));
    expect(result.current.balance).toBe(7);
  });

  it("does nothing without a wallet", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useGems(null));
    expect(result.current.balance).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
