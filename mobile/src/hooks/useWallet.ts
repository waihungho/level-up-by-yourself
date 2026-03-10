import { useState, useCallback, useRef } from "react";
import { transact } from "../utils/walletAdapter";
import { PublicKey } from "@solana/web3.js";
import { APP_CONFIG } from "../constants/config";

interface WalletState {
  address: string | null;
  publicKey: PublicKey | null;
  isConnecting: boolean;
  error: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    publicKey: null,
    isConnecting: false,
    error: null,
  });

  const authTokenRef = useRef<string | null>(null);

  const connect = useCallback(async (): Promise<string | null> => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      const result = await transact(async (wallet) => {
        const authResult = await wallet.authorize({
          cluster: APP_CONFIG.CLUSTER,
          identity: APP_CONFIG.APP_IDENTITY,
          auth_token: authTokenRef.current ?? undefined,
        });
        return authResult;
      });

      authTokenRef.current = result.auth_token;

      const base64Address = result.accounts[0].address;
      const publicKey = new PublicKey(
        Buffer.from(base64Address, "base64")
      );
      const address = publicKey.toBase58();

      setState({
        address,
        publicKey,
        isConnecting: false,
        error: null,
      });

      return address;
    } catch (error) {
      let errorMessage = "Failed to connect wallet";
      if (error instanceof Error) {
        if (
          error.message.includes("ERROR_WALLET_NOT_FOUND") ||
          error.message.includes("Found no installed wallet")
        ) {
          errorMessage =
            "No compatible wallet app found. Please install Phantom or Solflare.";
        } else if (
          error.message.includes("cancelled") ||
          error.message.includes("RESULT_CANCELED")
        ) {
          errorMessage = "Wallet connection was cancelled.";
        } else if (error.message.includes("Timed out")) {
          errorMessage = "Connection timed out. Please try again.";
        } else {
          errorMessage = error.message;
        }
      }
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: errorMessage,
      }));
      return null;
    }
  }, []);

  const disconnect = useCallback(() => {
    const token = authTokenRef.current;
    if (token) {
      transact(async (wallet) => {
        await wallet.deauthorize({ auth_token: token });
      }).catch(() => {});
    }
    authTokenRef.current = null;
    setState({
      address: null,
      publicKey: null,
      isConnecting: false,
      error: null,
    });
  }, []);

  return {
    address: state.address,
    publicKey: state.publicKey,
    isConnected: !!state.address,
    isConnecting: state.isConnecting,
    error: state.error,
    connect,
    disconnect,
    authTokenRef,
  };
}
