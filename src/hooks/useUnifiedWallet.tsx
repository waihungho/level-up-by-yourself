"use client";
import { useEffect, useState, useMemo } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Connection, Transaction } from "@solana/web3.js";
import { isMobileBridge } from "@/lib/mobile-bridge";

export interface UnifiedWalletState {
  publicKey: PublicKey | null;
  connected: boolean;
  isMobile: boolean;
  connection: Connection;
  sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
  disconnect: () => void;
  wallet: ReturnType<typeof useWallet>["wallet"];
}

export function useUnifiedWallet(): UnifiedWalletState {
  const { publicKey, connected, sendTransaction, signTransaction, disconnect, wallet } = useWallet();
  const { connection } = useConnection();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(isMobileBridge());
    // Re-check after 500ms for late injection
    const timer = setTimeout(() => setIsMobile(isMobileBridge()), 500);
    return () => clearTimeout(timer);
  }, []);

  return useMemo(() => ({
    publicKey,
    connected,
    isMobile,
    connection,
    sendTransaction,
    signTransaction: signTransaction ?? undefined,
    disconnect,
    wallet,
  }), [publicKey, connected, isMobile, connection, sendTransaction, signTransaction, disconnect, wallet]);
}
