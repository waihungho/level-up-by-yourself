import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { NftMint } from "@/lib/nft/eligibility";

// A stand-in PublicKey: the hook only calls toBase58() on it.
const wallet = { toBase58: () => "Wallet1111" };
const sendTransaction = vi.fn();
let signMessage: ((m: Uint8Array) => Promise<Uint8Array>) | undefined;
let mintRow: NftMint | null = null;

vi.mock("@/hooks/useUnifiedWallet", () => ({
  useUnifiedWallet: () => ({ publicKey: wallet, connection: {}, sendTransaction, signMessage }),
}));
// jsdom's cross-realm Uint8Array trips @noble's signature checks, and the hook only hands the
// decoded transaction to the (mocked) wallet, so decoding is stubbed.
vi.mock("@solana/web3.js", () => ({ Transaction: { from: (buf: Uint8Array) => ({ decoded: buf.length }) } }));
vi.mock("@/lib/nft/nft-read", () => ({ getNftMint: vi.fn(async () => mintRow) }));

import { MintNftPanel } from "../MintNftPanel";

function serverTx(): string {
  return Buffer.from("signed-by-server").toString("base64");
}

/** The JSON body a fetch mock was called with. */
const sentBody = (mock: ReturnType<typeof vi.fn>, call: number) => JSON.parse(String((mock.mock.calls[call] as [string, RequestInit])[1].body));

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => {
  mintRow = null;
  signMessage = undefined;
  sendTransaction.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("MintNftPanel", () => {
  it("prepares, sends and confirms a mint, then shows it as minted", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/nft/prepare") return json(200, { transaction: serverTx(), assetAddress: "Asset1" });
      return json(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    sendTransaction.mockImplementation(async () => {
      mintRow = { agentId: "a1", assetAddress: "Asset1", status: "confirmed", createdAt: new Date().toISOString(), txBuiltAt: new Date().toISOString(), txSignature: "sig1" };
      return "sig1";
    });

    render(<MintNftPanel agentId="a1" confirmRetryMs={0} />);
    fireEvent.click(await screen.findByRole("button", { name: /mint as nft · 0.08 sol/i }));

    await screen.findByText(/minted on solana/i);
    expect(screen.getByRole("link", { name: /solscan/i }).getAttribute("href")).toContain("Asset1");
    expect(sentBody(fetchMock, 0)).toEqual({ wallet: wallet.toBase58(), agentId: "a1" });
    expect(sentBody(fetchMock, 1)).toEqual({ assetAddress: "Asset1", wallet: wallet.toBase58(), signature: "sig1" });
  });

  it("keeps polling while the confirm route says the tx is not visible yet", async () => {
    let confirms = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/nft/prepare") return json(200, { transaction: serverTx(), assetAddress: "Asset1" });
      confirms++;
      return confirms < 3 ? json(202, { error: "not yet" }) : json(200, { ok: true });
    }));
    sendTransaction.mockResolvedValue("sig1");

    render(<MintNftPanel agentId="a1" confirmRetryMs={0} />);
    fireEvent.click(await screen.findByRole("button", { name: /mint as nft/i }));
    await waitFor(() => expect(confirms).toBe(3));
  });

  it("shows the server's error when prepare is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(409, { error: "This agent already has an NFT." })));
    render(<MintNftPanel agentId="a1" confirmRetryMs={0} />);
    fireEvent.click(await screen.findByRole("button", { name: /mint as nft/i }));
    expect(await screen.findByText("This agent already has an NFT.")).toBeTruthy();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("disables the button while an earlier mint is still pending", async () => {
    mintRow = { agentId: "a1", assetAddress: "Asset1", status: "pending", createdAt: new Date().toISOString(), txBuiltAt: new Date().toISOString(), txSignature: null };
    vi.stubGlobal("fetch", vi.fn(async () => json(202, { error: "not yet" })));
    render(<MintNftPanel agentId="a1" confirmRetryMs={0} />);
    const button = await screen.findByRole("button", { name: /mint as nft/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/still confirming/i)).toBeTruthy();
  });

  it("reports a wallet rejection without confirming", async () => {
    const fetchMock = vi.fn(async () => json(200, { transaction: serverTx(), assetAddress: "Asset1" }));
    vi.stubGlobal("fetch", fetchMock);
    sendTransaction.mockRejectedValue(new Error("User rejected the request."));
    render(<MintNftPanel agentId="a1" confirmRetryMs={0} />);
    fireEvent.click(await screen.findByRole("button", { name: /mint as nft/i }));
    expect(await screen.findByText(/user rejected the request/i)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("attaches a signed authorization when the wallet can sign messages", async () => {
    signMessage = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const fetchMock = vi.fn(async () => json(409, { error: "busy" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MintNftPanel agentId="a1" confirmRetryMs={0} />);
    fireEvent.click(await screen.findByRole("button", { name: /mint as nft/i }));
    await screen.findByText("busy");
    const body = sentBody(fetchMock, 0);
    expect(body.signature).toBe("Ldp");
    expect(body.signedMessage).toMatch(/^Level Up By Yourself — authorize NFT mint\nagent: a1\nissued: /);
  });
});
