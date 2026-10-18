import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { BlinkChallenge } from "@/lib/blinks/challenge-read";

vi.mock("@/components/PixelSprite", () => ({ PixelSprite: () => <div data-testid="sprite" /> }));

import { ChallengeView } from "../ChallengeView";
import { ShareChallengeButton } from "../ShareChallengeButton";

const ORIGIN = "https://levelup.test";
const agent = { id: "agent-1", name: "Rook", role: "medieval" as const, roleTitle: "Knight", spriteSeed: {} };

function challenge(over: Partial<BlinkChallenge>): BlinkChallenge {
  return {
    id: crypto.randomUUID(),
    agentId: "agent-1",
    challengerWallet: "Wa11et1111111111111111111111111111111111111",
    challengerPlayerId: null,
    txSignature: crypto.randomUUID(),
    winner: "defender",
    summary: { challengerName: "Guest", challengerRole: "future", challengerAgentId: null, defenderName: "Rook", rounds: 6, damageDealt: 120, damageTaken: 300 },
    day: "2026-10-19",
    createdAt: "2026-10-19T10:00:00.000Z",
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ChallengeView", () => {
  it("shows the agent, record, recent challenges and the three calls to action", () => {
    render(
      <ChallengeView
        agent={agent}
        power={4321}
        record={{ wins: 3, losses: 1 }}
        recent={[challenge({}), challenge({ winner: "challenger", summary: { ...challenge({}).summary, challengerName: "Zed" } })]}
        origin={ORIGIN}
        now={Date.parse("2026-10-19T12:00:00.000Z")}
      />
    );
    expect(screen.getByRole("heading", { name: "Rook" })).toBeInTheDocument();
    expect(screen.getByText(/Knight/)).toBeInTheDocument();
    expect(screen.getByText("4321")).toBeInTheDocument();
    expect(screen.getByText("3W – 1L")).toBeInTheDocument();
    expect(screen.getByText(/Guest/)).toBeInTheDocument();
    expect(screen.getByText(/Zed/)).toBeInTheDocument();

    const blink = screen.getByRole("link", { name: /fight in blink/i });
    expect(blink).toHaveAttribute("href", `https://dial.to/?action=solana-action:${encodeURIComponent(`${ORIGIN}/api/actions/challenge/agent-1`)}`);
    const x = screen.getByRole("link", { name: /share on x/i }).getAttribute("href")!;
    expect(x).toMatch(/^https:\/\/twitter\.com\/intent\/tweet\?/);
    expect(new URL(x).searchParams.get("url")).toBe(`${ORIGIN}/challenge/agent-1`);
    expect(screen.getByRole("link", { name: /play level up/i })).toHaveAttribute("href", "/");
  });

  it("invites the first challenger when there is no history", () => {
    render(<ChallengeView agent={agent} power={10} record={{ wins: 0, losses: 0 }} recent={[]} origin={ORIGIN} now={0} />);
    expect(screen.getByText(/be the first/i)).toBeInTheDocument();
  });
});

describe("ShareChallengeButton", () => {
  it("uses the native share sheet when available", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, share });
    render(<ShareChallengeButton agentId="agent-1" agentName="Rook" />);
    fireEvent.click(screen.getByRole("button", { name: /share challenge/i }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const arg = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(arg.url).toBe(`${window.location.origin}/challenge/agent-1`);
    expect(arg.text).toMatch(/Rook/);
  });

  it("falls back to copying the link and offers an X intent", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: { writeText } });
    render(<ShareChallengeButton agentId="agent-1" agentName="Rook" />);
    fireEvent.click(screen.getByRole("button", { name: /share challenge/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/challenge/agent-1`));
    expect(await screen.findByText(/link copied/i)).toBeInTheDocument();
    const x = screen.getByRole("link", { name: /post on x/i }).getAttribute("href")!;
    expect(new URL(x).searchParams.get("url")).toBe(`${window.location.origin}/challenge/agent-1`);
  });
});
