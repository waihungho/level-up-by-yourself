import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ExpeditionsBoard } from "../ExpeditionsBoard";
import { formatCountdown, type ExpeditionItem, type ExpeditionsView } from "../types";
import { GEM_BALANCE_EVENT } from "@/lib/shop-client";

afterEach(() => vi.unstubAllGlobals());

const HOUR = 3_600_000;
const seed = { bodyType: 1, headType: 2, eyeType: 0, weaponType: 1, auraType: 0, colorSeed: 7 };
const agents: ExpeditionsView["agents"] = [
  { id: "a1", name: "Ayla", role: "medieval", roleTitle: "Knight", spriteSeed: seed },
  { id: "a2", name: "Bolt", role: "future", roleTitle: "Hacker", spriteSeed: seed },
  { id: "a3", name: "Cleo", role: "modern", roleTitle: "Analyst", spriteSeed: seed },
  { id: "a4", name: "Dax", role: "modern", roleTitle: "Trader", spriteSeed: seed },
];

function exp(id: string, agentId: string, endsInMs: number, durationH: 4 | 8 | 12 = 4): ExpeditionItem {
  const ends = Date.now() + endsInMs;
  return { id, agentId, durationH, startedAt: new Date(ends - durationH * HOUR).toISOString(), endsAt: new Date(ends).toISOString() };
}

function viewWith(expeditions: ExpeditionItem[]): ExpeditionsView {
  return { expeditions, agents, maxActive: 3, serverNow: new Date().toISOString() };
}

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const fullGrant = { gems: 5, growth: { 1: 1, 2: 1 }, ticket: true, xp: true };

/** Routes fetch calls: GET → views in order (last one repeats; null = server error), POST → handler. */
function mockFetch(views: (ExpeditionsView | null)[], post: (url: string, body: Record<string, unknown>) => ReturnType<typeof json> | Promise<ReturnType<typeof json>>) {
  let i = 0;
  const fn = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === "POST") return post(url, JSON.parse(init.body!));
    const v = views[Math.min(i++, views.length - 1)];
    return v ? json(v) : json({ error: "internal" }, 500);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("ExpeditionsBoard", () => {
  it("shows 3 slots with a countdown, and the agents with duration buttons", async () => {
    mockFetch([viewWith([exp("e1", "a1", 2 * HOUR + 5 * 60_000)])], () => json({}));
    render(<ExpeditionsBoard walletAddress="w1" />);
    const slot = await screen.findByRole("listitem", { name: /Slot 1: Ayla, away/ });
    expect(slot).toHaveTextContent(/Back in 2:0[45]:\d\d/);
    expect(screen.getByRole("listitem", { name: "Slot 2: empty" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Slot 3: empty" })).toBeInTheDocument();
    // the away agent can't be sent again; the others can
    expect(screen.getByRole("button", { name: "Send Ayla for 8 hours" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send Bolt for 12 hours" })).toBeEnabled();
  });

  it("sends an agent and refreshes the slots", async () => {
    const fetchMock = mockFetch([viewWith([]), viewWith([exp("e1", "a2", 8 * HOUR, 8)])], () => json({ expedition: {} }));
    render(<ExpeditionsBoard walletAddress="w1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Send Bolt for 8 hours" }));
    expect(await screen.findByRole("listitem", { name: /Slot 1: Bolt, away/ })).toBeInTheDocument();
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST")!;
    expect(post[0]).toBe("/api/expeditions/start");
    expect(JSON.parse(post[1]!.body!)).toEqual({ walletAddress: "w1", agentId: "a2", duration: 8 });
  });

  it("treats agent_away after a lost start response as success and just refreshes", async () => {
    let calls = 0;
    mockFetch([viewWith([]), viewWith([exp("e1", "a2", 4 * HOUR)])], () => {
      if (calls++ === 0) throw new TypeError("Network request failed");
      return json({ error: "agent_away" }, 409);
    });
    render(<ExpeditionsBoard walletAddress="w1" retryDelayMs={0} />);
    fireEvent.click(await screen.findByRole("button", { name: "Send Bolt for 4 hours" }));
    expect(await screen.findByRole("listitem", { name: /Slot 1: Bolt, away/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables every send button when all 3 slots are used", async () => {
    mockFetch([viewWith([exp("e1", "a1", HOUR), exp("e2", "a2", HOUR), exp("e3", "a3", HOUR)])], () => json({}));
    render(<ExpeditionsBoard walletAddress="w1" />);
    expect(await screen.findByRole("button", { name: "Send Dax for 4 hours" })).toBeDisabled();
    expect(screen.getByText("3/3 slots")).toBeInTheDocument();
  });

  it("claims a finished expedition, reveals what was granted and announces the gem balance", async () => {
    const balances: number[] = [];
    const onBalance = (e: Event) => balances.push((e as CustomEvent<number>).detail);
    window.addEventListener(GEM_BALANCE_EVENT, onBalance);
    const fetchMock = mockFetch([viewWith([exp("e1", "a1", -1000)]), viewWith([])], () => json({ granted: fullGrant, balance: 42 }));
    const onRewardsChanged = vi.fn();
    render(<ExpeditionsBoard walletAddress="w1" onRewardsChanged={onRewardsChanged} />);

    const slot = await screen.findByRole("listitem", { name: /Slot 1: Ayla, back/ });
    fireEvent.click(within(slot).getByRole("button", { name: "Claim Ayla's loot" }));

    const dialog = await screen.findByRole("dialog", { name: "Ayla is back!" });
    expect(dialog).toHaveTextContent("+1 Strength");
    expect(dialog).toHaveTextContent("+5 gems");
    expect(dialog).toHaveTextContent("+1 raid attempt today");
    expect(dialog).toHaveTextContent("Season Pass XP");
    expect(balances).toEqual([42]);
    expect(onRewardsChanged).toHaveBeenCalled();
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST")!;
    expect(post[0]).toBe("/api/expeditions/claim");
    expect(JSON.parse(post[1]!.body!)).toEqual({ walletAddress: "w1", expeditionId: "e1" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Nice!" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Away" })).toHaveFocus();
    expect(screen.getByRole("listitem", { name: "Slot 1: empty" })).toBeInTheDocument();
    window.removeEventListener(GEM_BALANCE_EVENT, onBalance);
  });

  it("only reveals what was actually granted", async () => {
    mockFetch([viewWith([exp("e1", "a1", -1000)]), viewWith([])], () => json({ granted: { gems: 0, growth: { 1: 0.3 }, ticket: false, xp: false }, balance: 0 }));
    render(<ExpeditionsBoard walletAddress="w1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Claim Ayla's loot" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("+0.3 Strength");
    expect(dialog).not.toHaveTextContent("gems");
    expect(dialog).not.toHaveTextContent("Raid Ticket");
    expect(dialog).not.toHaveTextContent("Season Pass XP");
  });

  it("on already_claimed, resyncs the view, gems and stats without an error", async () => {
    mockFetch([viewWith([exp("e1", "a1", -1000)]), viewWith([])], () => json({ error: "already_claimed" }, 409));
    const onRewardsChanged = vi.fn();
    render(<ExpeditionsBoard walletAddress="w1" onRewardsChanged={onRewardsChanged} />);
    fireEvent.click(await screen.findByRole("button", { name: "Claim Ayla's loot" }));
    expect(await screen.findByRole("listitem", { name: "Slot 1: empty" })).toBeInTheDocument();
    expect(onRewardsChanged).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("tracks several claims in flight at once", async () => {
    const pending: ((v: ReturnType<typeof json>) => void)[] = [];
    mockFetch([viewWith([exp("e1", "a1", -1000), exp("e2", "a2", -1000)])], () => new Promise((r) => pending.push(r)));
    render(<ExpeditionsBoard walletAddress="w1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Claim Ayla's loot" }));
    fireEvent.click(screen.getByRole("button", { name: "Claim Bolt's loot" }));
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Claim Ayla's loot" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Claim Bolt's loot" })).toBeDisabled();
    pending[0](json({ granted: fullGrant, balance: 5 }));
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "Claim Bolt's loot" })).toBeDisabled();
    pending[1](json({ granted: fullGrant, balance: 10 }));
  });

  it("turns a running slot into a Claim button when its countdown ends", async () => {
    mockFetch([viewWith([exp("e1", "a1", 1200)])], () => json({}));
    render(<ExpeditionsBoard walletAddress="w1" />);
    expect(await screen.findByRole("listitem", { name: /Slot 1: Ayla, away/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Claim Ayla's loot" }, { timeout: 3000 })).toBeInTheDocument();
  });

  it("explains a failed start", async () => {
    mockFetch([viewWith([])], () => json({ error: "expedition_limit" }, 429));
    render(<ExpeditionsBoard walletAddress="w1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Send Cleo for 4 hours" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("All 3 slots are in use");
  });

  it("offers a Retry button when the view fails to load", async () => {
    mockFetch([null, viewWith([])], () => json({}));
    render(<ExpeditionsBoard walletAddress="w1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("listitem", { name: "Slot 1: empty" })).toBeInTheDocument();
  });
});

describe("formatCountdown", () => {
  it("formats hours, minutes and seconds", () => {
    expect(formatCountdown(3 * HOUR + 5 * 60_000 + 9000)).toBe("3:05:09");
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
