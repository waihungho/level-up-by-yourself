import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ExpeditionsBoard } from "../ExpeditionsBoard";
import { formatCountdown, type ExpeditionsView } from "../types";
import { GEM_BALANCE_EVENT } from "@/lib/shop-client";

afterEach(() => vi.unstubAllGlobals());

const HOUR = 3_600_000;
const seed = { body: 1, hair: 2 };
const agents = [
  { id: "a1", name: "Ayla", role: "medieval", roleTitle: "Knight", spriteSeed: seed },
  { id: "a2", name: "Bolt", role: "future", roleTitle: "Hacker", spriteSeed: seed },
  { id: "a3", name: "Cleo", role: "modern", roleTitle: "Analyst", spriteSeed: seed },
  { id: "a4", name: "Dax", role: "modern", roleTitle: "Trader", spriteSeed: seed },
];

function exp(id: string, agentId: string, endsInMs: number, durationH = 4) {
  const ends = Date.now() + endsInMs;
  return {
    id,
    agentId,
    durationH,
    startedAt: new Date(ends - durationH * HOUR).toISOString(),
    endsAt: new Date(ends).toISOString(),
    reward: { growth: { 1: 1, 2: 1 }, gems: 5, ticket: true },
  };
}

function viewWith(expeditions: ReturnType<typeof exp>[]): ExpeditionsView {
  return { expeditions, agents, maxActive: 3, serverNow: new Date().toISOString() } as ExpeditionsView;
}

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

/** Routes fetch calls: GET view → views in order (last one repeats), POSTs → handler. */
function mockFetch(views: ExpeditionsView[], post: (url: string, body: Record<string, unknown>) => ReturnType<typeof json>) {
  let i = 0;
  const fn = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === "POST") return post(url, JSON.parse(init.body!));
    return json(views[Math.min(i++, views.length - 1)]);
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

  it("disables every send button when all 3 slots are used", async () => {
    mockFetch([viewWith([exp("e1", "a1", HOUR), exp("e2", "a2", HOUR), exp("e3", "a3", HOUR)])], () => json({}));
    render(<ExpeditionsBoard walletAddress="w1" />);
    expect(await screen.findByRole("button", { name: "Send Dax for 4 hours" })).toBeDisabled();
    expect(screen.getByText("3/3 slots")).toBeInTheDocument();
  });

  it("claims a finished expedition, reveals the reward and announces the gem balance", async () => {
    const balances: number[] = [];
    const onBalance = (e: Event) => balances.push((e as CustomEvent<number>).detail);
    window.addEventListener(GEM_BALANCE_EVENT, onBalance);
    const done = exp("e1", "a1", -1000);
    const fetchMock = mockFetch([viewWith([done]), viewWith([])], () => json({ reward: done.reward, balance: 42 }));
    const onClaimed = vi.fn();
    render(<ExpeditionsBoard walletAddress="w1" onClaimed={onClaimed} />);

    const slot = await screen.findByRole("listitem", { name: /Slot 1: Ayla, back/ });
    fireEvent.click(within(slot).getByRole("button", { name: "Claim Ayla's loot" }));

    const dialog = await screen.findByRole("dialog", { name: "Ayla is back!" });
    expect(dialog).toHaveTextContent("+1 Strength");
    expect(dialog).toHaveTextContent("+5 gems");
    expect(dialog).toHaveTextContent("Raid Ticket");
    expect(balances).toEqual([42]);
    expect(onClaimed).toHaveBeenCalled();
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST")!;
    expect(post[0]).toBe("/api/expeditions/claim");
    expect(JSON.parse(post[1]!.body!)).toEqual({ walletAddress: "w1", expeditionId: "e1" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Nice!" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("listitem", { name: "Slot 1: empty" })).toBeInTheDocument();
    window.removeEventListener(GEM_BALANCE_EVENT, onBalance);
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
});

describe("formatCountdown", () => {
  it("formats hours, minutes and seconds", () => {
    expect(formatCountdown(3 * HOUR + 5 * 60_000 + 9000)).toBe("3:05:09");
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
