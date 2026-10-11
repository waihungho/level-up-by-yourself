import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { EquipmentPanel } from "../EquipmentPanel";

afterEach(() => vi.unstubAllGlobals());

describe("EquipmentPanel", () => {
  it("shows each slot's level, tier, bonus and next cost", () => {
    render(<EquipmentPanel agentId="a1" role="future" gear={{ weapon: 12 }} walletAddress={null} onUpgraded={vi.fn()} />);
    const weapon = screen.getByRole("group", { name: /Weapon/ });
    expect(weapon).toHaveTextContent("Lv 12");
    expect(weapon).toHaveTextContent(/gold/i);
    expect(weapon).toHaveTextContent("+36 Technical");
    expect(screen.getByRole("group", { name: /Armor/ })).toHaveTextContent("No gear");
    expect(screen.queryByRole("button", { name: /Upgrade/ })).not.toBeInTheDocument();
  });

  it("lets the owner upgrade a slot and reports the new level and balance", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ level: 1, balance: 70 }) });
    vi.stubGlobal("fetch", fetchMock);
    const onUpgraded = vi.fn();
    render(<EquipmentPanel agentId="a1" role="medieval" gear={{}} walletAddress="w1" onUpgraded={onUpgraded} />);
    const armor = screen.getByRole("group", { name: /Armor/ });
    fireEvent.click(within(armor).getByRole("button", { name: /Upgrade Armor for 30 gems/ }));
    await waitFor(() => expect(onUpgraded).toHaveBeenCalledWith({ armor: 1 }, 70));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ walletAddress: "w1", agentId: "a1", slot: "armor" });
    expect(body.purchaseId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it("explains a failed upgrade", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 402, json: async () => ({ error: "insufficient_gems", balance: 5 }) }));
    render(<EquipmentPanel agentId="a1" role="medieval" gear={{}} walletAddress="w1" onUpgraded={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Upgrade Relic/ }));
    expect(await screen.findByText(/Not enough gems/)).toBeInTheDocument();
  });

  it("retries a lost upgrade request with the same purchase id", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ level: 1, balance: 70 }) });
    vi.stubGlobal("fetch", fetchMock);
    const onUpgraded = vi.fn();
    render(<EquipmentPanel agentId="a1" role="modern" gear={{}} walletAddress="w1" onUpgraded={onUpgraded} retryDelayMs={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Upgrade Weapon/ }));
    await waitFor(() => expect(onUpgraded).toHaveBeenCalledWith({ weapon: 1 }, 70));
    const ids = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).purchaseId);
    expect(ids[0]).toBe(ids[1]);
  });
});

