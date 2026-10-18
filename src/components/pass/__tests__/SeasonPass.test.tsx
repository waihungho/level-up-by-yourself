import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { SeasonPass } from "../SeasonPass";
import { GEM_BALANCE_EVENT } from "@/lib/shop-client";
import { passMemo } from "@/lib/payment-memos";
import { seasonOf } from "@/lib/pass/season";
import type { PassViewBody } from "@/lib/pass/rewards";

afterEach(() => vi.unstubAllGlobals());

const baseView: PassViewBody = {
  season: 1,
  endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  xp: 800,
  tier: 3,
  tiers: 30,
  xpPerTier: 250,
  premium: false,
  claimed: ["1:free"],
  streak: 4,
  checkedInToday: true,
  title: null,
};

type Reply = { status: number; body: unknown };
type Handler = (init?: RequestInit) => Reply | Promise<Reply>;

/** Routes by URL prefix; an array of handlers is used in order, repeating the last one. */
function mockApi(routes: Record<string, Handler | Handler[]>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const key = Object.keys(routes).find((k) => url.startsWith(k))!;
    const route = routes[key];
    const handler = Array.isArray(route) ? (route.length > 1 ? route.shift()! : route[0]) : route;
    const r = await handler(init);
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const view = (patch: Partial<PassViewBody> = {}) => () => ({ status: 200, body: { ...baseView, ...patch } });
const calls = (fetchMock: ReturnType<typeof mockApi>, url: string) => fetchMock.mock.calls.filter((c) => c[0].startsWith(url));

describe("SeasonPass", () => {
  it("shows season progress, streak and tier states, with an empty live region", async () => {
    mockApi({ "/api/pass?": view() });
    render(<SeasonPass walletAddress="w1" pay={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: /Season 1/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByText(/Tier 3/)).toBeInTheDocument();
    expect(screen.getByText(/4-day streak/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(within(screen.getByLabelText("Tier 1")).getByText(/Claimed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Claim tier 2 free reward: 3 gems/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claim tier 4/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claim tier 2 premium/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Unclaimed rewards expire when the season ends/)).not.toHaveTextContent("⚠");
  });

  it("claims everything reachable, announces the new gem balance and reloads the pass", async () => {
    const onBalance = vi.fn();
    const listener = (e: Event) => onBalance((e as CustomEvent<number>).detail);
    window.addEventListener(GEM_BALANCE_EVENT, listener);
    const fetchMock = mockApi({
      "/api/pass?": [view(), view({ claimed: ["1:free", "2:free", "3:free"] })],
      "/api/pass/claim": () => ({
        status: 200,
        body: {
          claimed: [2, 3].map((tier) => ({ tier, track: "free", reward: { gems: 3, tickets: 0, title: false } })),
          balance: 42,
        },
      }),
    });
    render(<SeasonPass walletAddress="w1" pay={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Claim all \(2\)/ }));
    await waitFor(() => expect(onBalance).toHaveBeenCalledWith(42));
    expect(JSON.parse(calls(fetchMock, "/api/pass/claim")[0][1]!.body as string)).toEqual({ walletAddress: "w1", all: true });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("+6 gems"));
    await waitFor(() => expect(within(screen.getByLabelText("Tier 3")).getByText(/Claimed/)).toBeInTheDocument());
    expect(calls(fetchMock, "/api/pass?")).toHaveLength(2);
    window.removeEventListener(GEM_BALANCE_EVENT, listener);
  });

  it("leaves raid-ticket tiers out of Claim all and labels them for same-day use", async () => {
    mockApi({ "/api/pass?": view({ tier: 5, xp: 1300, claimed: ["1:free", "2:free", "3:free", "4:free"] }) });
    render(<SeasonPass walletAddress="w1" pay={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Nothing to claim yet" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Claim tier 5 free reward: 10 gems \+ 1 Raid Ticket \(use today\)/ })).toBeInTheDocument();
  });

  it("asks before the season title replaces the player's current title", async () => {
    const fetchMock = mockApi({
      "/api/pass?": view({ tier: 30, xp: 7500, premium: true, title: "champion", claimed: [] }),
      "/api/pass/claim": () => ({ status: 200, body: { claimed: [{ tier: 30, track: "premium", reward: { gems: 40, tickets: 0, title: true } }], balance: 40 } }),
    });
    render(<SeasonPass walletAddress="w1" pay={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Claim tier 30 premium reward/ }));
    expect(screen.getByText(/This replaces your current title/)).toBeInTheDocument();
    expect(calls(fetchMock, "/api/pass/claim")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Replace title and claim/ }));
    await waitFor(() => expect(calls(fetchMock, "/api/pass/claim")).toHaveLength(1));
    expect(JSON.parse(calls(fetchMock, "/api/pass/claim")[0][1]!.body as string)).toEqual({ walletAddress: "w1", tier: 30, track: "premium" });
  });

  it("treats an already-claimed single claim as a refresh, not an error", async () => {
    const fetchMock = mockApi({
      "/api/pass?": [view(), view({ claimed: ["1:free", "2:free"] })],
      "/api/pass/claim": () => ({ status: 409, body: { error: "already_claimed" } }),
    });
    render(<SeasonPass walletAddress="w1" pay={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Claim tier 2 free/ }));
    await waitFor(() => expect(within(screen.getByLabelText("Tier 2")).getByText(/Claimed/)).toBeInTheDocument());
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(calls(fetchMock, "/api/pass?")).toHaveLength(2);
  });

  it("checks in when not yet checked in today", async () => {
    const fetchMock = mockApi({
      "/api/pass?": [view({ checkedInToday: false }), view({ xp: 890 })],
      "/api/pass/checkin": () => ({ status: 200, body: { awarded: 90, xp: 890, tier: 3, streak: 5 } }),
    });
    render(<SeasonPass walletAddress="w1" pay={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Check in/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("+90 XP"));
    expect(calls(fetchMock, "/api/pass/checkin")).toHaveLength(1);
  });

  it("buys premium: pays 0.15 SOL with the current season's memo, verifies with retries, then unlocks the premium track", async () => {
    const pay = vi.fn().mockResolvedValue("sig123");
    const fetchMock = mockApi({
      "/api/pass?": [view(), view({ premium: true })],
      "/api/pass/premium": [() => ({ status: 402, body: { error: "payment_invalid" } }), () => ({ status: 200, body: { premium: true, season: 1 } })],
    });
    render(<SeasonPass walletAddress="w1" pay={pay} retryDelayMs={0} />);
    fireEvent.click(await screen.findByRole("button", { name: /Unlock Premium for 0.15 SOL/ }));
    await waitFor(() => expect(pay).toHaveBeenCalledWith(0.15, passMemo(seasonOf(new Date()))));
    expect(await screen.findByRole("button", { name: /Claim tier 1 premium reward: 12 gems/ })).toBeInTheDocument();
    const verifyCalls = calls(fetchMock, "/api/pass/premium");
    expect(verifyCalls).toHaveLength(2);
    expect(JSON.parse(verifyCalls[0][1]!.body as string)).toEqual({ walletAddress: "w1", signature: "sig123" });
    expect(screen.queryByRole("button", { name: /Unlock Premium/ })).not.toBeInTheDocument();
  });

  it("a replayed signature counts as unlocked", async () => {
    mockApi({
      "/api/pass?": [view(), view({ premium: true })],
      "/api/pass/premium": () => ({ status: 409, body: { error: "signature_used" } }),
    });
    render(<SeasonPass walletAddress="w1" pay={vi.fn().mockResolvedValue("sig")} retryDelayMs={0} />);
    fireEvent.click(await screen.findByRole("button", { name: /Unlock Premium/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Premium unlocked"));
  });

  it("a second payment after premium was already unlocked shows the signature for support", async () => {
    mockApi({
      "/api/pass?": view(),
      "/api/pass/premium": () => ({ status: 409, body: { error: "already_owned" } }),
    });
    render(<SeasonPass walletAddress="w1" pay={vi.fn().mockResolvedValue("sig-extra")} retryDelayMs={0} />);
    fireEvent.click(await screen.findByRole("button", { name: /Unlock Premium/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Premium was already unlocked — this payment wasn't applied"));
    expect(screen.getByRole("status")).toHaveTextContent("sig-extra");
  });

  it("explains a cancelled payment", async () => {
    mockApi({ "/api/pass?": view() });
    render(<SeasonPass walletAddress="w1" pay={vi.fn().mockRejectedValue(new Error("rejected"))} />);
    fireEvent.click(await screen.findByRole("button", { name: /Unlock Premium/ }));
    expect(await screen.findByText(/Payment cancelled/)).toBeInTheDocument();
  });

  it("ignores a slower response for a previous wallet", async () => {
    let releaseOld: (r: Reply) => void = () => {};
    mockApi({
      "/api/pass?wallet=old": () => new Promise<Reply>((resolve) => (releaseOld = resolve)),
      "/api/pass?wallet=new": view({ season: 2 }),
    });
    const { rerender } = render(<SeasonPass walletAddress="old" pay={vi.fn()} />);
    rerender(<SeasonPass walletAddress="new" pay={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Season 2" })).toBeInTheDocument();
    releaseOld({ status: 200, body: { ...baseView, season: 1 } });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("heading", { name: "Season 2" })).toBeInTheDocument();
  });

  it("highlights the expiry warning in the last day with rewards unclaimed", async () => {
    mockApi({ "/api/pass?": view({ endsAt: new Date(Date.now() + 5 * 3_600_000).toISOString() }) });
    render(<SeasonPass walletAddress="w1" pay={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Unclaimed rewards expire when the season ends/)).toHaveTextContent("⚠"));
  });

  it("reloads the pass when the season ends", async () => {
    const fetchMock = mockApi({ "/api/pass?": [view({ endsAt: new Date(Date.now() - 1000).toISOString() }), view({ season: 2 })] });
    render(<SeasonPass walletAddress="w1" pay={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Season 2" })).toBeInTheDocument();
    expect(calls(fetchMock, "/api/pass?")).toHaveLength(2);
  });
});
