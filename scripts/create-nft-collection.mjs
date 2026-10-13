// scripts/create-nft-collection.mjs
//
// Creates the Metaplex Core collection every minted agent belongs to. Run once per network,
// then put the printed address in NEXT_PUBLIC_NFT_COLLECTION_ADDRESS.
//
//   NFT_MINT_AUTHORITY_SECRET=<base58> node scripts/create-nft-collection.mjs --network devnet
//   NFT_MINT_AUTHORITY_SECRET=<base58> SOLANA_RPC_URL=<rpc> node scripts/create-nft-collection.mjs --network mainnet --yes
//
// The Royalties plugin is set on the collection (assets inherit it) and cannot be swapped later,
// hence the mainnet guard: this spends real SOL for a result that cannot be undone.
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createCollection, mplCore } from "@metaplex-foundation/mpl-core";
import { createSignerFromKeypair, signerIdentity, generateSigner, publicKey } from "@metaplex-foundation/umi";
import bs58 from "bs58";

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);

const network = opt("--network", "devnet");
if (network !== "devnet" && network !== "mainnet") throw new Error(`--network must be "devnet" or "mainnet", got "${network}"`);
if (network === "mainnet" && !argv.includes("--yes")) {
  console.error("REFUSING: --network mainnet creates a real collection and spends real SOL.\nThe royalty set here cannot be changed later. Re-run with --yes once you mean it.");
  process.exit(1);
}

const rpc = network === "mainnet" ? process.env.SOLANA_RPC_URL?.trim() : process.env.SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
if (!rpc) throw new Error("SOLANA_RPC_URL is required for --network mainnet");
const secret = process.env.NFT_MINT_AUTHORITY_SECRET?.trim();
if (!secret) throw new Error("NFT_MINT_AUTHORITY_SECRET is required (base58 64-byte secret key of the mint authority).");

// Royalties go to the treasury, never the mint authority: that key lives in a server env var.
const royaltyRecipient = (process.env.NFT_ROYALTY_RECIPIENT ?? process.env.NEXT_PUBLIC_TREASURY_WALLET)?.trim();
if (!royaltyRecipient) throw new Error("Set NEXT_PUBLIC_TREASURY_WALLET (or NFT_ROYALTY_RECIPIENT) — the royalty recipient is permanent.");

const umi = createUmi(rpc).use(mplCore());
umi.use(signerIdentity(createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(bs58.decode(secret)))));
if (royaltyRecipient === umi.identity.publicKey.toString()) {
  console.warn("\n!!! The royalty recipient is the mint authority (a hot server key). This is permanent.\n");
}

const ROYALTY_BASIS_POINTS = 500; // 5%
const collection = generateSigner(umi);
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://level-up-by-yourself.vercel.app").replace(/\/$/, "");

await createCollection(umi, {
  collection,
  name: "Level Up By Yourself",
  uri: process.env.NFT_COLLECTION_URI ?? `${appUrl}/nft/collection.json`,
  plugins: [
    {
      type: "Royalties",
      basisPoints: ROYALTY_BASIS_POINTS,
      creators: [{ address: publicKey(royaltyRecipient), percentage: 100 }],
      ruleSet: { type: "None" },
    },
  ],
}).sendAndConfirm(umi);

console.log(`network:    ${network}`);
console.log(`collection: ${collection.publicKey}`);
console.log(`authority:  ${umi.identity.publicKey}`);
console.log(`royalty:    ${ROYALTY_BASIS_POINTS / 100}% to ${royaltyRecipient}`);
console.log(`\nNext: set NEXT_PUBLIC_NFT_COLLECTION_ADDRESS=${collection.publicKey}`);
