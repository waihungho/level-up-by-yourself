"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, Connection } from "@solana/web3.js";
import {
  isMobileBridge,
  initMobileBridge,
  cleanupMobileBridge,
  mobileSendTransaction,
  getMobileConnection,
  mobileRequestConnect,
  mobileRequestDisconnect,
} from "@/lib/mobile-bridge";

export interface UnifiedWalletState {
  publicKey: PublicKey | null;
  connected: boolean;
  isMobile: boolean;
  connection: Connection;
  connect: () => void;
  sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>;
  disconnect: () => void;
  wallet: ReturnType<typeof useWallet>["wallet"];
}

const UnifiedWalletContext = createContext<UnifiedWalletState | null>(null);

export function UnifiedWalletProvider({ children }: { children: React.ReactNode }) {
  const browserWallet = useWallet();
  const { connection: browserConnection } = useConnection();

  const [mobileAddress, setMobileAddress] = useState<string | null>(null);
  const [mobile, setMobile] = useState(() => isMobileBridge());

  // Re-check for mobile bridge flag shortly after mount (handles late injection)
  useEffect(() => {
    if (mobile) return;
    const timer = setTimeout(() => {
      if (isMobileBridge()) setMobile(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [mobile]);

  // Initialize mobile bridge ONCE in the provider — never torn down by page navigation
  useEffect(() => {
    if (!mobile) return;
    initMobileBridge(setMobileAddress);
    return () => cleanupMobileBridge();
  }, [mobile]);

  const publicKey = mobile && mobileAddress
    ? new PublicKey(mobileAddress)
    : browserWallet.publicKey;

  const connected = mobile ? !!mobileAddress : browserWallet.connected;

  const connection = useMemo(
    () => (mobile ? getMobileConnection() : browserConnection),
    [mobile, browserConnection]
  );

  const sendTransaction = useCallback(
    async (tx: Transaction, conn: Connection) => {
      if (mobile) {
        return mobileSendTransaction(tx);
      }
      return browserWallet.sendTransaction(tx, conn);
    },
    [mobile, browserWallet]
  );

  const connect = useCallback(() => {
    if (mobile) {
      mobileRequestConnect();
    } else {
      browserWallet.connect();
    }
  }, [mobile, browserWallet]);

  const disconnect = useCallback(() => {
    if (mobile) {
      mobileRequestDisconnect();
      setMobileAddress(null);
    } else {
      browserWallet.disconnect();
    }
  }, [mobile, browserWallet]);

  const value = useMemo(
    () => ({
      publicKey,
      connected,
      isMobile: mobile,
      connection,
      connect,
      sendTransaction,
      disconnect,
      wallet: browserWallet.wallet,
    }),
    [publicKey, connected, mobile, connection, connect, sendTransaction, disconnect, browserWallet.wallet]
  );

  return (
    <UnifiedWalletContext.Provider value={value}>
      {children}
    </UnifiedWalletContext.Provider>
  );
}

export function useUnifiedWallet(): UnifiedWalletState {
  const ctx = useContext(UnifiedWalletContext);
  if (!ctx) {
    throw new Error("useUnifiedWallet must be used within UnifiedWalletProvider");
  }
  return ctx;
}
