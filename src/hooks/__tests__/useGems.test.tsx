import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useGems } from "../useGems";
import { announceGemBalance } from "@/lib/shop-client";

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

  it("updates every instance when a purchase announces a new balance", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ balance: 100 }) }));
    const chip = renderHook(() => useGems("w1"));
    const page = renderHook(() => useGems("w1"));
    await waitFor(() => expect(chip.result.current.balance).toBe(100));
    act(() => announceGemBalance(55));
    expect(chip.result.current.balance).toBe(55);
    expect(page.result.current.balance).toBe(55);
  });
});

