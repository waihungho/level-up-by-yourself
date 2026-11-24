"use client";
import { useSyncExternalStore } from "react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { hasInjectedWallet, isIosDevice, phantomBrowseUrl, solflareBrowseUrl } from "@/lib/wallet-deeplinks";

const noSubscribe = () => () => {};

/**
 * On iPhone/iPad with no wallet available in this page: links that reopen it in a wallet app.
 * Inside any wallet's in-app browser the adapter reports that wallet as Installed (Wallet
 * Standard or injected global), so the normal Connect button shows instead.
 */
function useIosWalletLinks(enabled: boolean) {
  const { wallets } = useWallet();
  // False during server render and hydration; the real value once on the client.
  const ios = useSyncExternalStore(
    noSubscribe,
    () => isIosDevice(navigator.userAgent, navigator.maxTouchPoints),
    () => false
  );

  const walletAvailable = wallets.some((w) => w.readyState === WalletReadyState.Installed) || hasInjectedWallet();
  if (!enabled || !ios || walletAvailable) return null;
  const href = window.location.href;
  return { phantom: phantomBrowseUrl(href), solflare: solflareBrowseUrl(href) };
}

export function WalletConnectButton() {
  const { publicKey, connected, disconnect, connect, isMobile } = useUnifiedWallet();
  const { setVisible } = useWalletModal();
  const iosLinks = useIosWalletLinks(!isMobile && !connected);

  if (connected && publicKey) {
    const addr = publicKey.toBase58();
    const short = `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm font-mono text-gray-400">{short}</span>
        <button
          onClick={disconnect}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-mono text-sm rounded transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (iosLinks) {
    // Must be real links: iOS opens the wallet app only for a universal link the user taps.
    return (
      <div className="flex flex-col items-center gap-3">
        <a
          href={iosLinks.phantom}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-mono text-lg rounded transition-colors"
        >
          Open in Phantom
        </a>
        <a
          href={iosLinks.solflare}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-mono text-sm rounded transition-colors"
        >
          Open in Solflare
        </a>
        <p className="text-xs font-mono text-gray-400 max-w-xs text-center">
          On iPhone, the game runs inside your wallet app&apos;s browser. Tap above, then tap Connect Wallet there.
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={() => (isMobile ? connect() : setVisible(true))}
      className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-mono text-lg rounded transition-colors"
    >
      Connect Wallet
    </button>
  );
}
