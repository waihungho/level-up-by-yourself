/**
 * Server half of an agent NFT mint. Server-only: holds the mint-authority key.
 *
 * prepareMint builds ONE transaction carrying both the 0.05 SOL treasury transfer and the
 * Metaplex Core `create`. Solana executes it whole or not at all, so there is no state where
 * the treasury was paid and no NFT exists. Do not split it into two transactions.
 *
 * confirmMint records a mint that landed. With a signature it verifies that transaction; without
 * one (reconciliation, e.g. the tab died after broadcast) it keys on the asset address, which the
 * server generated and never disclosed before prepare, so only our transaction can create it.
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { create, fetchCollection, mplCore, MPL_CORE_PROGRAM_ID } from "@metaplex-foundation/mpl-core";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import {
  createGenericFile, createNoopSigner, createSignerFromKeypair, generateSigner, publicKey as umiPublicKey, signerIdentity,
} from "@metaplex-foundation/umi";
import { toWeb3JsInstruction, toWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import bs58 from "bs58";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { getAgentWithDimensions, getPlayerByWallet } from "@/lib/db";
import { getGearForAgents } from "@/lib/shop/gear-read";
import { weaponTint } from "@/components/shop/gearStyle";
import { NFT_MINT_COST_SOL, TREASURY_WALLET } from "@/lib/constants";
import { MEMO_PROGRAM_ID } from "@/lib/sol-payment";
import { nftMintMemo } from "@/lib/payment-memos";
import { fail, type ServiceResult } from "@/lib/tactical/service-common";
import { buildNftMetadata, buildSnapshot } from "./metadata";
import { renderAvatarPng } from "./render-avatar";
import { verifyMint, MINT_VERIFY_MESSAGES, type ParsedMintTx } from "./verify-mint";

/** Reservations per player per 10 minutes (each one costs the authority an Irys upload). */
const RATE_LIMIT = 5;
const CONFIRM_ATTEMPTS = 4;
const CONFIRM_RETRY_MS = 2_500;
const MINT_LAMPORTS = Math.round(NFT_MINT_COST_SOL * LAMPORTS_PER_SOL);

/** Trimmed: `echo value | vercel env add` stores a trailing newline, which breaks base58 parsing. */
function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function rpcUrl(): string | undefined {
  // Server variable first: the public one is often a rate-limited endpoint.
  return env("SOLANA_RPC_URL") || env("NEXT_PUBLIC_SOLANA_RPC_URL");
}

/** True only for an account owned by mpl-core, i.e. a real Core asset, not one funded with dust. */
function isMplCoreOwned(info: { owner: PublicKey } | null): boolean {
  return info !== null && info.owner.toBase58() === MPL_CORE_PROGRAM_ID;
}

const RESERVE_ERRORS: Array<[RegExp, number, string]> = [
  [/too many mint requests/i, 429, "Too many mint requests. Try again in a few minutes."],
  [/already has a mint/i, 409, "This agent already has an NFT."],
  [/not yours/i, 403, "That agent is not yours."],
];

export async function prepareMint(input: { wallet?: string; agentId?: string }): Promise<ServiceResult> {
  const { wallet, agentId } = input;
  if (!wallet || !agentId) return fail(400, "Missing fields.");
  try {
    new PublicKey(wallet);
  } catch {
    return fail(400, "Invalid wallet.");
  }

  const authoritySecret = env("NFT_MINT_AUTHORITY_SECRET");
  const collectionAddress = env("NEXT_PUBLIC_NFT_COLLECTION_ADDRESS");
  const rpc = rpcUrl();
  const sb = getAdminSupabase();
  if (!sb || !authoritySecret || !collectionAddress || !rpc) return fail(503, "Server is not configured for minting.");

  const player = await getPlayerByWallet(wallet);
  if (!player) return fail(404, "Unknown player.");
  const agent = await getAgentWithDimensions(agentId);
  if (!agent || agent.playerId !== player.id) return fail(404, "That agent is not yours.");

  const umi = createUmi(rpc).use(mplCore()).use(irysUploader(env("IRYS_ADDRESS") ? { address: env("IRYS_ADDRESS") } : {}));
  const authority = umi.eddsa.createKeypairFromSecretKey(bs58.decode(authoritySecret));
  umi.use(signerIdentity(createSignerFromKeypair(umi, authority)));
  const asset = generateSigner(umi);
  const assetAddress = asset.publicKey.toString();

  // Reserve before uploading: an upload for an agent that already has a live mint is wasted money.
  const { error: reserveError } = await sb.rpc("levelup_reserve_nft_mint", {
    p_player_id: player.id,
    p_agent_id: agent.id,
    p_asset_address: assetAddress,
    p_metadata_uri: "pending",
    p_snapshot: buildSnapshot(agent),
    p_rate_limit: RATE_LIMIT,
  });
  if (reserveError) {
    const match = RESERVE_ERRORS.find(([re]) => re.test(reserveError.message));
    if (!match) console.error("[nft/prepare] reserve failed", reserveError);
    return match ? fail(match[1], match[2]) : fail(500, "Could not start the mint.");
  }

  // From here on, failures leave the reservation to expire on its 3-minute timer.
  let metadataUri: string;
  try {
    const gear = await getGearForAgents([agent.id]);
    const png = renderAvatarPng(agent.spriteSeed, agent.role, weaponTint(gear[agent.id]));
    const [imageUri] = await umi.uploader.upload([createGenericFile(png, `${agent.id}.png`, { contentType: "image/png" })]);
    metadataUri = await umi.uploader.uploadJson(buildNftMetadata(agent, imageUri, new Date()));
  } catch (e) {
    console.error("[nft/prepare] upload failed", e);
    return fail(502, "Could not publish the NFT artwork. Try again shortly.");
  }

  const { error: uriError } = await sb.from("levelup_nft_mints").update({ metadata_uri: metadataUri }).eq("asset_address", assetAddress);
  if (uriError) {
    console.error("[nft/prepare] metadata_uri update failed", uriError);
    return fail(502, "Could not record the mint. Try again shortly.");
  }

  try {
    const collection = await fetchCollection(umi, umiPublicKey(collectionAddress));
    // `payer` is the player (a noop signer: the wallet signs later), so the player funds the
    // asset's rent, not this server. `authority` must be explicit or the authority key never
    // appears in the account list and partialSign below throws "unknown signer".
    const builder = create(umi, {
      asset,
      collection,
      name: agent.name.slice(0, 32),
      uri: metadataUri,
      owner: umiPublicKey(wallet),
      payer: createNoopSigner(umiPublicKey(wallet)),
      authority: umi.identity,
    });

    const connection = new Connection(rpc, "confirmed");
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new Transaction();
    tx.add(SystemProgram.transfer({ fromPubkey: new PublicKey(wallet), toPubkey: new PublicKey(TREASURY_WALLET), lamports: MINT_LAMPORTS }));
    tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(nftMintMemo(agent.id), "utf8") }));
    for (const ix of builder.getInstructions()) tx.add(toWeb3JsInstruction(ix));
    tx.feePayer = new PublicKey(wallet);
    tx.recentBlockhash = blockhash;
    tx.partialSign(
      toWeb3JsKeypair({ publicKey: asset.publicKey, secretKey: asset.secretKey }),
      Keypair.fromSecretKey(bs58.decode(authoritySecret)),
    );

    return {
      status: 200,
      body: {
        transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
        assetAddress,
      },
    };
  } catch (e) {
    console.error("[nft/prepare] building the transaction failed", e);
    const detail = e instanceof Error ? `${e.name}: ${e.message.split("\n")[0]}` : String(e);
    return { status: 500, body: { error: "Could not build the mint transaction.", detail } };
  }
}

async function fetchMintTx(connection: Connection, signature: string): Promise<ParsedMintTx | null> {
  try {
    const tx = await connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    return tx as unknown as ParsedMintTx | null;
  } catch {
    return null; // transient RPC failure: treated as not yet visible
  }
}

export async function confirmMint(input: { assetAddress?: string; wallet?: string; signature?: string }): Promise<ServiceResult> {
  const { assetAddress, wallet } = input;
  let signature = input.signature;
  if (!assetAddress || !wallet) return fail(400, "Missing fields.");

  const sb = getAdminSupabase();
  const rpc = rpcUrl();
  if (!sb || !rpc) return fail(503, "Server is not configured for minting.");

  const { data: mint } = await sb
    .from("levelup_nft_mints")
    .select("id, status, agent_id, levelup_players!inner(wallet_address)")
    .eq("asset_address", assetAddress)
    .maybeSingle();
  if (!mint) return fail(404, "Unknown mint.");

  // The mint table is public, so `wallet` is only a claim: bind it to the row's real owner, or an
  // attacker could confirm a victim's pending asset with their own payment transaction.
  const owner = Array.isArray(mint.levelup_players) ? mint.levelup_players[0] : mint.levelup_players;
  if (!owner || (owner as { wallet_address: string }).wallet_address !== wallet) {
    return fail(403, "That mint does not belong to this wallet.");
  }
  if (mint.status === "confirmed") return { status: 200, body: { ok: true } };

  let assetKey: PublicKey;
  try {
    assetKey = new PublicKey(assetAddress);
  } catch {
    return fail(400, "Invalid asset address.");
  }
  const connection = new Connection(rpc, "confirmed");

  if (!signature) {
    const info = await connection.getAccountInfo(assetKey);
    if (!info) return fail(202, "Mint not visible on chain yet.");
    if (!isMplCoreOwned(info)) return fail(402, "That address is not a Level Up NFT.");
    // A fresh asset has exactly one signature in its history: the create transaction.
    const sigs = await connection.getSignaturesForAddress(assetKey);
    if (!sigs.length) return fail(202, "Mint signature not visible on chain yet.");
    signature = sigs[sigs.length - 1].signature;
  }

  const opts = { payer: wallet, treasury: TREASURY_WALLET, minLamports: MINT_LAMPORTS, memo: nftMintMemo(mint.agent_id), assetAddress };
  let result = verifyMint(null, opts);
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
    result = verifyMint(await fetchMintTx(connection, signature), opts);
    if (result.ok || result.reason !== "not_found") break;
    if (attempt < CONFIRM_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, CONFIRM_RETRY_MS));
  }
  if (!result.ok) {
    return { status: result.reason === "not_found" ? 202 : 402, body: { error: MINT_VERIFY_MESSAGES[result.reason], reason: result.reason } };
  }
  // The balance check alone can be satisfied by a dust transfer; require a real Core asset.
  if (!isMplCoreOwned(await connection.getAccountInfo(assetKey))) return fail(402, "That address is not a Level Up NFT.");

  const { error } = await sb.rpc("levelup_confirm_nft_mint", {
    p_asset_address: assetAddress,
    p_tx_signature: signature,
    p_sol_amount: NFT_MINT_COST_SOL,
  });
  if (error) {
    console.error("[nft/confirm] confirm failed", error);
    return fail(500, "Could not record the mint.");
  }
  return { status: 200, body: { ok: true } };
}
