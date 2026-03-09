"use client";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function WalletConnectButton() {
  const { publicKey, connected, disconnect, connect, isMobile } = useUnifiedWallet();
  const { setVisible } = useWalletModal();

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

  return (
    <button
      onClick={() => (isMobile ? connect() : setVisible(true))}
      className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-mono text-lg rounded transition-colors"
    >
      Connect Wallet
    </button>
  );
}
