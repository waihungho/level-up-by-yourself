import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { SeasonPass } from "../SeasonPass";
import { GEM_BALANCE_EVENT } from "@/lib/shop-client";

afterEach(() => vi.unstubAllGlobals());

const baseView = {
  season: 1,
  endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  xp: 800,
  tier: 3,
  tiers: 30,
  xpPerTier: 250,
  premium: false,
  premiumPriceSol: 0.15,
  claimed: ["1:free"],
  streak: 4,
  checkedInToday: true,
};

type Handler = (init?: RequestInit) => { status: number; body: unknown };

function mockApi(routes: Record<string, Handler | Handler[]>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const key = Object.keys(routes).find((k) => url.startsWith(k))!;
    const route = routes[key];
    const handler = Array.isArray(route) ? route.length > 1 ? route.shift()! : route[0] : route;
    const r = handler(init);
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("SeasonPass", () => {
  it("shows season progress, streak and tier states", async () => {
    mockApi({ "/api/pass?": () => ({ status: 200, body: baseView }) });
    render(<SeasonPass walletAddress="w1" pay={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: /Season 1/ })).toBeInTheDocument();
    expect(screen.getByText(/Tier 3/)).toBeInTheDocument();
    expect(screen.getByText(/4-day streak/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    const tier1 = screen.getByRole("group", { name: "Tier 1" });
    expect(within(tier1).getByText(/Claimed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Claim tier 2 free reward: 3 gems/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claim tier 4/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claim tier 2 premium/ })).not.toBeInTheDocument();
  });

  it("claims everything reachable and announces the new gem balance", async () => {
    const onBalance = vi.fn();
    window.addEventListener(GEM_BALANCE_EVENT, (e) => onBalance((e as CustomEvent<number>).detail));
    const fetchMock = mockApi({
      "/api/pass?": () => ({ status: 200, body: baseView }),
      "/api/pass/claim": () => ({
        status: 200,
        body: {
          claimed: [
            { tier: 2, track: "free", reward: { gems: 3, tickets: 0, title: false } },
            { tier: 3, track: "free", reward: { gems: 3, tickets: 0, title: false } },
          ],
          balance: 42,
        },
      }),
    });
    render(<SeasonPass walletAddress="w1" pay={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Claim all \(2\)/ }));
    await waitFor(() => expect(onBalance).toHaveBeenCalledWith(42));
    const claimCall = fetchMock.mock.calls.find((c) => c[0] === "/api/pass/claim")!;
    expect(JSON.parse(claimCall[1]!.body as string)).toEqual({ walletAddress: "w1", all: true });
    expect(await screen.findByRole("status")).toHaveTextContent("+6 gems");
    expect(within(screen.getByRole("group", { name: "Tier 3" })).getByText(/Claimed/)).toBeInTheDocument();
  });

  it("checks in when not yet checked in today", async () => {
    const fetchMock = mockApi({
      "/api/pass?": [() => ({ status: 200, body: { ...baseView, checkedInToday: false } }), () => ({ status: 200, body: { ...baseView, xp: 890 } })],
      "/api/pass/checkin": () => ({ status: 200, body: { awarded: 90, xp: 890, tier: 3, streak: 5 } }),
    });
    render(<SeasonPass walletAddress="w1" pay={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Check in/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("+90 XP");
    expect(fetchMock.mock.calls.some((c) => c[0] === "/api/pass/checkin")).toBe(true);
  });

  it("buys premium: pays 0.15 SOL with the season memo, verifies with retries, then unlocks the premium track", async () => {
    const pay = vi.fn().mockResolvedValue("sig123");
    const fetchMock = mockApi({
      "/api/pass?": [() => ({ status: 200, body: baseView }), () => ({ status: 200, body: { ...baseView, premium: true } })],
      "/api/pass/premium": [() => ({ status: 402, body: { error: "payment_invalid" } }), () => ({ status: 200, body: { premium: true, season: 1 } })],
    });
    render(<SeasonPass walletAddress="w1" pay={pay} retryDelayMs={0} />);
    fireEvent.click(await screen.findByRole("button", { name: /Unlock Premium for 0.15 SOL/ }));
    await waitFor(() => expect(pay).toHaveBeenCalledWith(0.15, "levelup:pass:1"));
    expect(await screen.findByRole("button", { name: /Claim tier 1 premium reward: 12 gems/ })).toBeInTheDocument();
    const verifyCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/pass/premium");
    expect(verifyCalls).toHaveLength(2);
    expect(JSON.parse(verifyCalls[0][1]!.body as string)).toEqual({ walletAddress: "w1", signature: "sig123" });
    expect(screen.queryByRole("button", { name: /Unlock Premium/ })).not.toBeInTheDocument();
  });

  it("explains a cancelled payment", async () => {
    mockApi({ "/api/pass?": () => ({ status: 200, body: baseView }) });
    render(<SeasonPass walletAddress="w1" pay={vi.fn().mockRejectedValue(new Error("rejected"))} />);
    fireEvent.click(await screen.findByRole("button", { name: /Unlock Premium/ }));
    expect(await screen.findByText(/Payment cancelled/)).toBeInTheDocument();
  });
});
