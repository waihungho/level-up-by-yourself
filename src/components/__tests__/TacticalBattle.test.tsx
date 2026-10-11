import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TacticalBattle } from "../TacticalBattle";
import { createBattle } from "@/lib/tactical/engine";
import { makeAgent, half } from "@/lib/tactical/__tests__/fixtures";
import type { TacticalState } from "@/lib/tactical/types";

const attacker = makeAgent("a", "medieval");
const defender = makeAgent("d", "future");

function initial(overrides: Partial<TacticalState> = {}): TacticalState {
  return { ...createBattle(attacker, defender, "training", half), intent: { kind: "strike", category: "Technical" }, ...overrides };
}

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  localStorage.setItem("tactical_tutorial_seen", "1");
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderBattle(state = initial(), onFinished = vi.fn()) {
  render(
    <TacticalBattle sessionId="s1" initialState={state} attacker={attacker} defender={defender} walletAddress="w1" onFinished={onFinished} />
  );
  return onFinished;
}

describe("TacticalBattle", () => {
  it("shows the opponent's telegraphed intent", () => {
    renderBattle();
    expect(screen.getByText(/is charging/i).parentElement).toHaveTextContent("TECHNICAL");
  });

  it("marks the counter option once the tutorial has been seen", () => {
    renderBattle();
    expect(screen.getByRole("button", { name: /Physical/ })).toHaveTextContent("★");
  });

  it("posts the chosen strike with the current round", async () => {
    const next = { ...initial(), round: 1 };
    const fetchMock = mockFetch({ rounds: [], state: next, finished: false });
    renderBattle();
    fireEvent.click(screen.getByRole("button", { name: /Mental/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/battle/turn");
    expect(JSON.parse(init.body)).toEqual({ sessionId: "s1", walletAddress: "w1", round: 0, action: { type: "strike", category: "Mental" } });
  });

  it("disables the special until focus reaches 3", () => {
    renderBattle();
    expect(screen.getByRole("button", { name: /Shield Bash/ })).toBeDisabled();
  });

  it("enables the special at 3 focus", () => {
    const s = initial();
    s.sides.attacker.focus = 3;
    renderBattle(s);
    expect(screen.getByRole("button", { name: /Shield Bash/ })).toBeEnabled();
  });

  it("offers only Continue while stunned", () => {
    const s = initial();
    s.sides.attacker.stunned = true;
    renderBattle(s);
    expect(screen.getByRole("button", { name: /Continue/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mental/ })).not.toBeInTheDocument();
  });

  it("calls onFinished with the battle log when the battle ends", async () => {
    const done = { ...initial(), round: 1, finished: true, winner: "attacker" as const };
    const log = { id: "log1", winnerId: "a" };
    mockFetch({ rounds: [], state: done, finished: true, battleLog: log });
    const onFinished = renderBattle();
    fireEvent.click(screen.getByRole("button", { name: /Auto/ }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(log), { timeout: 3000 });
  });

  it("refetches the session after a stale-round conflict", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "stale_round" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ state: { ...initial(), round: 2 }, status: "active" }) });
    vi.stubGlobal("fetch", fetchMock);
    renderBattle();
    fireEvent.click(screen.getByRole("button", { name: /Guard/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/battle/session/s1?wallet=w1");
    await waitFor(() => expect(screen.getByText(/Round 3/)).toBeInTheDocument());
  });

  it("shows the tutorial on first visit", () => {
    localStorage.clear();
    renderBattle();
    expect(screen.getByText(/How tactical battles work/i)).toBeInTheDocument();
  });

  it("recovers the result when the final turn was applied but its response was lost (410)", async () => {
    const done = { ...initial(), round: 4, finished: true, winner: "attacker" as const };
    const log = { id: "log-lost", winnerId: "a" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 410, json: async () => ({ error: "session_finished" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ state: done, status: "finished", result: { battleLog: log } }) });
    vi.stubGlobal("fetch", fetchMock);
    const onFinished = renderBattle();
    fireEvent.click(screen.getByRole("button", { name: /Guard/ }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(log), { timeout: 3000 });
  });

  it("sends only one turn when an action is double-tapped in the same tick", async () => {
    const fetchMock = mockFetch({ rounds: [], state: { ...initial(), round: 1 }, finished: false });
    renderBattle();
    const btn = screen.getByRole("button", { name: /Guard/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
