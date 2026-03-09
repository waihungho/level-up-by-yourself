import { Transaction, Connection, clusterApiUrl } from "@solana/web3.js";

// Declare the global flag injected by the native app
declare global {
  interface Window {
    __MOBILE_BRIDGE__?: boolean;
    ReactNativeWebView?: {
      postMessage(message: string): void;
    };
  }
}

export function isMobileBridge(): boolean {
  return typeof window !== "undefined" && !!window.__MOBILE_BRIDGE__;
}

type PendingTx = {
  resolve: (signature: string) => void;
  reject: (error: Error) => void;
};

const pendingTransactions: Record<string, PendingTx> = {};
let mobileAddressCallback: ((address: string | null) => void) | null = null;
let listenerAttached = false;

function handleMessage(event: MessageEvent) {
  let data: Record<string, unknown>;
  try {
    data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
  } catch {
    return;
  }

  if (data.type === "wallet_connected" && typeof data.address === "string") {
    mobileAddressCallback?.(data.address);
  } else if (data.type === "wallet_disconnected") {
    mobileAddressCallback?.(null);
  } else if (data.type === "transaction_result" && typeof data.requestId === "string") {
    const pending = pendingTransactions[data.requestId];
    if (pending) {
      if (data.success) {
        pending.resolve(data.signature as string);
      } else {
        pending.reject(new Error((data.error as string) || "Transaction failed"));
      }
      delete pendingTransactions[data.requestId];
    }
  }
}

export function initMobileBridge(onAddressChange: (address: string | null) => void) {
  mobileAddressCallback = onAddressChange;

  if (!listenerAttached) {
    window.addEventListener("message", handleMessage);
    document.addEventListener("message", handleMessage as EventListener);
    listenerAttached = true;
  }

  // Signal to native that the web app is ready
  window.ReactNativeWebView?.postMessage(JSON.stringify({ type: "ready" }));
}

export function cleanupMobileBridge() {
  window.removeEventListener("message", handleMessage);
  document.removeEventListener("message", handleMessage as EventListener);
  listenerAttached = false;
  mobileAddressCallback = null;
}

export async function mobileSendTransaction(tx: Transaction): Promise<string> {
  if (!window.ReactNativeWebView) {
    throw new Error("Mobile bridge not available");
  }

  const requestId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const serialized = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  let binary = "";
  for (let i = 0; i < serialized.length; i++) {
    binary += String.fromCharCode(serialized[i]);
  }
  const base64Tx = btoa(binary);

  return new Promise((resolve, reject) => {
    pendingTransactions[requestId] = { resolve, reject };

    window.ReactNativeWebView!.postMessage(
      JSON.stringify({
        type: "sign_and_send_transaction",
        requestId,
        transaction: base64Tx,
      })
    );

    // Timeout after 2 minutes
    setTimeout(() => {
      if (pendingTransactions[requestId]) {
        delete pendingTransactions[requestId];
        reject(new Error("Transaction timed out"));
      }
    }, 120000);
  });
}

export function mobileRequestConnect() {
  window.ReactNativeWebView?.postMessage(
    JSON.stringify({ type: "request_connect" })
  );
}

export function mobileRequestDisconnect() {
  window.ReactNativeWebView?.postMessage(
    JSON.stringify({ type: "request_disconnect" })
  );
}

export function getMobileConnection(): Connection {
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");
  return new Connection(rpcUrl, "confirmed");
}
