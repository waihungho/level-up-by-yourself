import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { WalletConnectButton } from "@/components/WalletConnectButton";

const wallet = vi.hoisted(() => ({ readyState: "NotDetected" as string }));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({ wallets: [{ adapter: { name: "Phantom" }, readyState: wallet.readyState }] }),
}));
vi.mock("@solana/wallet-adapter-react-ui", () => ({ useWalletModal: () => ({ setVisible: vi.fn() }) }));
vi.mock("@/hooks/useUnifiedWallet", () => ({
  useUnifiedWallet: () => ({ publicKey: null, connected: false, disconnect: vi.fn(), connect: vi.fn(), isMobile: false }),
}));

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("WalletConnectButton on iPhone", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows tappable links into the wallet apps when no wallet is in the page", async () => {
    wallet.readyState = WalletReadyState.Loadable;
    render(<WalletConnectButton />);
    const phantom = await screen.findByRole("link", { name: "Open in Phantom" });
    expect(phantom.getAttribute("href")).toMatch(/^https:\/\/phantom\.app\/ul\/browse\//);
    expect(screen.getByRole("link", { name: "Open in Solflare" })).toBeTruthy();
  });

  it("shows the normal Connect button inside a wallet's in-app browser", async () => {
    wallet.readyState = WalletReadyState.Installed;
    render(<WalletConnectButton />);
    expect(await screen.findByRole("button", { name: "Connect Wallet" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open in Phantom" })).toBeNull();
  });
});
