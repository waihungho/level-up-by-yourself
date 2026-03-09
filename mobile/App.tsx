import React from "react";
import {
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { useWallet } from "./src/hooks/useWallet";
import { GameWebView } from "./src/components/GameWebView";

function WalletHeader() {
  const {
    address,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    publicKey,
    authTokenRef,
  } = useWallet();

  const truncatedAddress = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : null;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.header} edges={["top"]}>
        <TouchableOpacity
          style={[
            styles.walletBtn,
            isConnected && styles.walletBtnConnected,
          ]}
          onPress={isConnected ? disconnect : connect}
          disabled={isConnecting}
        >
          <Text style={styles.walletBtnText}>
            {isConnecting
              ? "Connecting..."
              : isConnected
                ? truncatedAddress
                : "Connect Wallet"}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
      {error && <Text style={styles.error}>{error}</Text>}
      <GameWebView
        address={address}
        publicKey={publicKey}
        isConnected={isConnected}
        authTokenRef={authTokenRef}
        onRequestConnect={connect}
        onRequestDisconnect={disconnect}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#030712" />
      <WalletHeader />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#030712",
  },
  walletBtn: {
    backgroundColor: "#7c3aed",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  walletBtnConnected: {
    backgroundColor: "#22c55e",
  },
  walletBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  error: {
    color: "#ef4444",
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 12,
  },
});
