"use client";
import { useEffect, useState } from "react";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  hasInjectedWallet,
  needsWalletAppRedirect,
  phantomBrowseUrl,
  solflareBrowseUrl,
} from "@/lib/wallet-deeplinks";

/** On iPhone without an injected wallet: links (set after mount) that reopen this page in a wallet app. */
function useIosWalletLinks(enabled: boolean) {
  const [links, setLinks] = useState<{ phantom: string; solflare: string } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // Wallet browsers can inject their provider slightly after load, so check again after a short delay.
    const check = () => {
      setLinks(
        needsWalletAppRedirect(navigator.userAgent, hasInjectedWallet())
          ? { phantom: phantomBrowseUrl(window.location.href), solflare: solflareBrowseUrl(window.location.href) }
          : null
      );
    };
    check();
    const timer = setTimeout(check, 600);
    return () => clearTimeout(timer);
  }, [enabled]);

  return links;
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
