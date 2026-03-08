declare global {
  interface Window {
    __MOBILE_BRIDGE__?: boolean;
    ReactNativeWebView?: {
      postMessage(message: string): void;
    };
  }
}

export function isMobileBridge(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.__MOBILE_BRIDGE__;
}

// Message types for mobile bridge communication
export type MobileBridgeMessage =
  | { type: "ready" }
  | { type: "wallet_connected"; address: string }
  | { type: "sign_and_send_transaction"; requestId: string; transaction: string }
  | { type: "transaction_result"; requestId: string; signature?: string; error?: string };

export function sendToNative(message: MobileBridgeMessage): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}
