import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShopItems } from "../ShopItems";
import { GemPacks } from "../GemPacks";
import { auraStyle, nameColorClass } from "../cosmeticStyle";
import { SHOP_ITEMS } from "@/lib/shop/catalog";
import type { Agent } from "@/lib/types";

const agents = [
  { id: "a1", name: "Aleksa", role: "modern", spriteSeed: {} },
  { id: "a2", name: "Bram", role: "medieval", spriteSeed: {} },
] as unknown as Agent[];

afterEach(() => vi.unstubAllGlobals());

function mockFetch(...responses: { status: number; body: unknown }[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce({ ok: r.status < 400, status: r.status, json: async () => r.body });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("ShopItems", () => {
  it("asks which agent for agent items, then buys with a purchase id", async () => {
    const fetchMock = mockFetch({ status: 200, body: { balance: 70, effect: "+3 to every Mental stat" } });
    const onBalance = vi.fn();
    render(<ShopItems items={SHOP_ITEMS} balance={100} agents={agents} walletAddress="w1" onBalance={onBalance} />);
    fireEvent.click(screen.getByRole("button", { name: /Buy Mental Elixir/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bram/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/shop/buy");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ walletAddress: "w1", itemId: "elixir_mental", agentId: "a2" });
    expect(body.purchaseId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    await waitFor(() => expect(onBalance).toHaveBeenCalledWith(70));
    expect(await screen.findByRole("status")).toHaveTextContent("Mental Elixir → Bram: +3 to every Mental stat");
  });

  it("buys player items without asking for an agent", async () => {
    const fetchMock = mockFetch({ status: 200, body: { balance: 50, effect: "+1 raid attempt today" } });
    render(<ShopItems items={SHOP_ITEMS} balance={100} agents={agents} walletAddress="w1" onBalance={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Buy Raid Ticket/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).agentId).toBeUndefined();
  });

  it("disables items the player cannot afford", () => {
    render(<ShopItems items={SHOP_ITEMS} balance={40} agents={agents} walletAddress="w1" onBalance={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Buy Grand Elixir/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Buy Physical Elixir/ })).toBeEnabled();
  });

  it("shows a clear message when the server says gems are short", async () => {
    mockFetch({ status: 402, body: { error: "insufficient_gems", balance: 10 } });
    const onBalance = vi.fn();
    render(<ShopItems items={SHOP_ITEMS} balance={100} agents={agents} walletAddress="w1" onBalance={onBalance} />);
    fireEvent.click(screen.getByRole("button", { name: /Buy Raid Ticket/ }));
    expect(await screen.findByText(/Not enough gems/)).toBeInTheDocument();
    expect(onBalance).toHaveBeenCalledWith(10);
  });
});

describe("GemPacks", () => {
  it("pays the pack price, then credits gems through the server", async () => {
    const fetchMock = mockFetch({ status: 200, body: { balance: 110, gems: 110 } });
    const pay = vi.fn().mockResolvedValue("sig-1");
    const onBalance = vi.fn();
    render(<GemPacks walletAddress="w1" pay={pay} onBalance={onBalance} retryDelayMs={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Standard/ }));
    await waitFor(() => expect(onBalance).toHaveBeenCalledWith(110));
    expect(pay).toHaveBeenCalledWith(0.1, "levelup:gems:standard");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ walletAddress: "w1", packId: "standard", signature: "sig-1" });
  });

  it("retries verification and treats an already-credited signature as success", async () => {
    mockFetch({ status: 402, body: { error: "payment_invalid" } }, { status: 409, body: { error: "signature_used", balance: 300 } });
    const onBalance = vi.fn();
    render(<GemPacks walletAddress="w1" pay={vi.fn().mockResolvedValue("sig-2")} onBalance={onBalance} retryDelayMs={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Big/ }));
    await waitFor(() => expect(onBalance).toHaveBeenCalledWith(300));
  });

  it("shows the signature for support when verification keeps failing", async () => {
    mockFetch(...Array.from({ length: 4 }, () => ({ status: 402, body: { error: "payment_invalid" } })));
    render(<GemPacks walletAddress="w1" pay={vi.fn().mockResolvedValue("sig-stuck-123456789")} onBalance={vi.fn()} retryDelayMs={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Starter/ }));
    expect(await screen.findByText(/sig-stuck-123456/)).toBeInTheDocument();
  });
});

describe("cosmeticStyle", () => {
  it("maps auras and name colours to styles, ignoring unknown values", () => {
    expect(auraStyle("ember")).toMatch(/drop-shadow/);
    expect(auraStyle(undefined)).toBeUndefined();
    expect(nameColorClass("gold")).toMatch(/text-/);
    expect(nameColorClass("bogus")).toBe("");
  });
});
