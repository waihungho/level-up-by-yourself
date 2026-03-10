export const APP_CONFIG = {
  // Solana network — must match the web app's NEXT_PUBLIC_SOLANA_NETWORK
  CLUSTER: "mainnet-beta" as const,

  // App identity shown to users during MWA wallet authorization
  APP_IDENTITY: {
    name: "Level Up by Yourself",
    uri: "https://level-up-by-yourself.vercel.app",
    icon: "/icon.png",
  },

  // URL of the deployed web game (loaded in WebView)
  GAME_URL: "https://level-up-by-yourself.vercel.app",

  // RPC endpoint for transaction confirmation
  RPC_URL: "https://mainnet.helius-rpc.com/?api-key=4e696da3-fa98-4c69-9fa1-8a219cdbe382",
};
