import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SquadBattle } from "../SquadBattle";
import { createSquadBattle, type SquadState } from "@/lib/tactical/squad";
import { makeAgent, half } from "@/lib/tactical/__tests__/fixtures";

const attackers = [makeAgent("Bram", "medieval"), makeAgent("Kade", "modern"), makeAgent("Io", "future")];
const defenders = [makeAgent("Nyx", "future"), makeAgent("Vex", "future"), makeAgent("Rho", "medieval")];

function initial(): SquadState {
  return { ...createSquadBattle({ playerId: "p1", agents: attackers }, { playerId: "p2", agents: defenders }, half), intent: { kind: "strike", category: "Technical" } };
}

function mockFetch(body: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => localStorage.setItem("tactical_tutorial_seen", "1"));
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderSquad(state = initial(), onFinished = vi.fn()) {
  render(<SquadBattle sessionId="s1" initialState={state} attackers={attackers} defenders={defenders} walletAddress="w1" onFinished={onFinished} />);
  return onFinished;
}

describe("SquadBattle", () => {
  it("shows the synergy of each team", () => {
    renderSquad();
    expect(screen.getByText("Trinity +10%")).toBeInTheDocument();
    expect(screen.getByText(/Pair/)).toBeInTheDocument();
  });

  it("lists only living benched allies in the swap menu", () => {
    const s = initial();
    s.teams.attacker.members[2].hp = 0;
    renderSquad(s);
    fireEvent.click(screen.getByRole("button", { name: /Swap/ }));
    expect(screen.getByRole("button", { name: /→ Kade/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /→ Io/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /→ Bram/ })).not.toBeInTheDocument();
  });

  it("labels the swap as a Tag when focus is 3+", () => {
    const s = initial();
    s.teams.attacker.focus = 3;
    renderSquad(s);
    expect(screen.getByRole("button", { name: /Tag!/ })).toBeInTheDocument();
  });

  it("posts a swap to the chosen slot", async () => {
    const fetchMock = mockFetch({ rounds: [], state: { ...initial(), round: 1 }, finished: false });
    renderSquad();
    fireEvent.click(screen.getByRole("button", { name: /Swap/ }));
    fireEvent.click(screen.getByRole("button", { name: /→ Kade/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).action).toEqual({ type: "swap", slot: 1 });
  });

  it("reports the result when the battle finishes", async () => {
    const done = { ...initial(), round: 3, finished: true, winner: "attacker" as const };
    mockFetch({ rounds: [], state: done, finished: true, winner: "attacker", growth: { attacker: {}, defender: {} }, ratingDelta: 16 });
    const onFinished = renderSquad();
    fireEvent.click(screen.getByRole("button", { name: /Auto/ }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(expect.objectContaining({ winner: "attacker", ratingDelta: 16 })), { timeout: 3000 });
  });
});
