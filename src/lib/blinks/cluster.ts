/*
 * The Solana cluster Blink challenges run on: the single source for the X-Blockchain-Ids header
 * and the fallback RPC. Set BLINK_CLUSTER=devnet|testnet to test; defaults to mainnet.
 */

export type BlinkCluster = "mainnet" | "devnet" | "testnet";

/** CAIP-2 chain ids (https://namespaces.chainagnostic.org/solana/caip2). */
const CHAIN_IDS: Record<BlinkCluster, string> = {
  mainnet: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  testnet: "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
};

const PUBLIC_RPC: Record<BlinkCluster, string> = {
  mainnet: "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
};

export function blinkCluster(): BlinkCluster {
  const c = process.env.BLINK_CLUSTER;
  return c === "devnet" || c === "testnet" ? c : "mainnet";
}

export function blinkChainId(): string {
  return CHAIN_IDS[blinkCluster()];
}

/** Server RPC first, then the public app RPC, then the cluster's public endpoint. */
export function blinkRpcUrl(): string {
  return process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || PUBLIC_RPC[blinkCluster()];
}
