import React, { useRef, useCallback } from "react";
import { StyleSheet, Platform } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { transact } from "../utils/walletAdapter";
import { APP_CONFIG } from "../constants/config";

interface GameWebViewProps {
  address: string | null;
  publicKey: PublicKey | null;
  isConnected: boolean;
  authTokenRef: React.MutableRefObject<string | null>;
  onRequestConnect: () => void;
  onRequestDisconnect: () => void;
}

export function GameWebView({
  address,
  publicKey,
  isConnected,
  authTokenRef,
  onRequestConnect,
  onRequestDisconnect,
}: GameWebViewProps) {
  const webViewRef = useRef<WebView>(null);

  const sendWalletState = useCallback(() => {
    if (!webViewRef.current) return;
    if (isConnected && address) {
      webViewRef.current.postMessage(
        JSON.stringify({ type: "wallet_connected", address })
      );
    } else {
      webViewRef.current.postMessage(
        JSON.stringify({ type: "wallet_disconnected" })
      );
    }
  }, [isConnected, address]);

  React.useEffect(() => {
    sendWalletState();
  }, [sendWalletState]);

  const handleMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      let msg: any;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      if (msg.type === "ready") {
        sendWalletState();
        return;
      }

      if (msg.type === "request_connect") {
        onRequestConnect();
        return;
      }

      if (msg.type === "request_disconnect") {
        onRequestDisconnect();
        return;
      }

      if (msg.type === "sign_and_send_transaction") {
        const { requestId, transaction: txBase64 } = msg;

        try {
          const connection = new Connection(APP_CONFIG.RPC_URL);
          const txBuffer = Buffer.from(txBase64, "base64");
          const transaction = Transaction.from(txBuffer);

          const signature = await transact(async (wallet) => {
            await wallet.authorize({
              cluster: APP_CONFIG.CLUSTER,
              identity: APP_CONFIG.APP_IDENTITY,
              auth_token: authTokenRef.current ?? undefined,
            });

            const signatures = await wallet.signAndSendTransactions({
              transactions: [transaction],
            });

            return signatures[0];
          });

          // Send result immediately — web side handles its own confirmation
          webViewRef.current?.postMessage(
            JSON.stringify({
              type: "transaction_result",
              requestId,
              success: true,
              signature,
            })
          );
        } catch (error: any) {
          let errorMessage = "Transaction failed";
          if (error?.message) {
            if (error.message.includes("insufficient")) {
              errorMessage = "Insufficient SOL balance";
            } else if (
              error.message.includes("cancelled") ||
              error.message.includes("RESULT_CANCELED") ||
              error.message.includes("User rejected")
            ) {
              errorMessage = "Transaction cancelled";
            } else {
              errorMessage = error.message;
            }
          }
          webViewRef.current?.postMessage(
            JSON.stringify({
              type: "transaction_result",
              requestId,
              success: false,
              error: errorMessage,
            })
          );
        }
      }
    },
    [sendWalletState, authTokenRef, onRequestConnect, onRequestDisconnect]
  );

  const earlyInjectJs = `
    (function() {
      window.__MOBILE_BRIDGE__ = true;
    })();
    true;
  `;

  const lateInjectJs = `
    (function() {
      window.__MOBILE_BRIDGE__ = true;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
    })();
    true;
  `;

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: APP_CONFIG.GAME_URL }}
      style={styles.webview}
      injectedJavaScriptBeforeContentLoaded={earlyInjectJs}
      injectedJavaScript={lateInjectJs}
      onMessage={handleMessage}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      startInLoadingState={true}
      allowsInlineMediaPlayback={true}
      mediaPlaybackRequiresUserAction={false}
      cacheEnabled={false}
      webviewDebuggingEnabled={true}
      onLoadEnd={sendWalletState}
    />
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
    backgroundColor: "#030712",
  },
});
