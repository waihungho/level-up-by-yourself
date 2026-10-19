import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { checkInOncePerDay } from "../checkin-client";

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("checkInOncePerDay", () => {
  it("posts once per UTC day per wallet", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    await checkInOncePerDay("w1");
    await checkInOncePerDay("w1");
    await checkInOncePerDay("w2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ walletAddress: "w1" });
  });

  it("tries again on the next load when the request failed", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    await checkInOncePerDay("w1");
    await checkInOncePerDay("w1");
    await checkInOncePerDay("w1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
