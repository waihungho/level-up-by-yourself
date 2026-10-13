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
 *
 * One live mint per agent: a pending reservation is only reclaimed once the chain proves its
 * transaction can no longer land (see reclaimablePending), so two valid transactions for one
 * agent never exist at the same time.
 */
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { create, fetchCollection, mplCore, MPL_CORE_PROGRAM_ID } from "@metaplex-foundation/mpl-core";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import {
  createGenericFile, createNoopSigner, createSignerFromKeypair, generateSigner, publicKey as umiPublicKey, signerIdentity,
} from "@metaplex-foundation/umi";
import { toWeb3JsInstruction, toWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentWithDimensions } from "@/lib/types";
import { createHash } from "node:crypto";
import bs58 from "bs58";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { getAgentWithDimensions, getPlayerByWallet } from "@/lib/db";
import { getGearForAgents } from "@/lib/shop/gear-read";
import { weaponTint } from "@/components/shop/gearStyle";
import { NFT_MINT_COST_SOL, TREASURY_WALLET } from "@/lib/constants";
import { MEMO_PROGRAM_ID } from "@/lib/sol-payment";
import { nftMintMemo } from "@/lib/payment-memos";
import type { SpriteSeed } from "@/lib/sprite-renderer";
import { fail, type ServiceResult } from "@/lib/tactical/service-common";
import { buildNftMetadata, buildSnapshot, type MintSnapshot } from "./metadata";
import { renderAvatarPng } from "./render-avatar";
import { verifyMint, MINT_VERIFY_MESSAGES, type MintVerifyResult, type ParsedMintTx } from "./verify-mint";
import { verifyMintAuth, MINT_AUTH_MESSAGES } from "./mint-auth";
import { MINT_RESERVATION_TTL_MS } from "./eligibility";

/**
 * Reservations per player per 10 minutes. Each one costs the authority Irys uploads (unless
 * deduplicated) and blocks the agent until its blockhash expires, so a request that only *claims*
 * a wallet gets a much smaller budget than one that proves it with a signature.
 */
const RATE_LIMIT_SIGNED = 6;
const RATE_LIMIT_UNSIGNED = 3;
/** Unsigned requests per client IP, and across everyone, per 10 minutes (each may cost an upload). */
const RATE_LIMIT_UNSIGNED_PER_SOURCE = 4;
const RATE_LIMIT_UNSIGNED_GLOBAL = 60;
const CONFIRM_ATTEMPTS = 4;
const CONFIRM_RETRY_MS = 2_500;
const MINT_LAMPORTS = Math.round(NFT_MINT_COST_SOL * LAMPORTS_PER_SOL);
const NOT_OUR_NFT = "That address is not a Level Up NFT.";

/** Trimmed: `echo value | vercel env add` stores a trailing newline, which breaks base58 parsing. */
function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function rpcUrl(): string | undefined {
  // Server variable first: the public one is often a rate-limited endpoint.
  return env("SOLANA_RPC_URL") || env("NEXT_PUBLIC_SOLANA_RPC_URL");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** True only for an account owned by mpl-core, i.e. a real Core asset, not one funded with dust. */
function isMplCoreOwned(info: { owner: PublicKey } | null): boolean {
  return info !== null && info.owner.toBase58() === MPL_CORE_PROGRAM_ID;
}

const RESERVE_ERRORS: Array<[RegExp, number, string]> = [
  [/too many mint requests/i, 429, "Too many mint requests. Try again in a few minutes."],
  [/already has a mint/i, 409, "A mint for this agent is still in progress. Try again in a minute."],
  [/not yours/i, 403, "That agent is not yours."],
];

interface LiveMintRow {
  status: "pending" | "confirmed";
  asset_address: string;
  created_at: string;
  last_valid_block_height: number | null;
}

type ReclaimDecision = { reclaim: string | null; observedBlockHeight: number | null } | { refuse: ServiceResult };

const STILL_IN_PROGRESS = "A mint for this agent is still in progress. Try again in a minute.";

/**
 * Decides whether the agent's pending reservation (if any) may be replaced. The SQL reclaim
 * re-checks the same conditions against the row's current values, so this is the proof and the
 * database is the referee.
 * - no tx was handed out yet → refuse while that prepare may still be running, else reclaim
 *   (a later publish is a compare-and-set on status = 'pending', so it can't resurrect the row);
 * - a tx was handed out and the chain hasn't passed its last valid block height → refuse;
 * - its asset exists on chain → the mint happened: confirm it and refuse a second one;
 * - otherwise the tx can never land → reclaim.
 * Expiry is observed BEFORE the asset is read, and the read is pinned to a slot at or after that
 * observation: checking the asset first would miss a tx that landed between the two reads.
 * RPC errors propagate: when in doubt, never hand out a second transaction.
 */
async function reclaimablePending(
  sb: SupabaseClient,
  connection: Connection,
  agentId: string,
  wallet: string
): Promise<ReclaimDecision> {
  const { data: row, error } = await sb
    .from("levelup_nft_mints")
    .select("status, asset_address, created_at, last_valid_block_height")
    .eq("agent_id", agentId)
    .in("status", ["pending", "confirmed"])
    .maybeSingle<LiveMintRow>();
  if (error) throw error;
  if (!row) return { reclaim: null, observedBlockHeight: null };
  if (row.status === "confirmed") return { refuse: fail(409, "This agent already has an NFT.") };

  if (row.last_valid_block_height === null) {
    const inFlight = Date.now() - Date.parse(row.created_at) < MINT_RESERVATION_TTL_MS;
    return inFlight ? { refuse: fail(409, STILL_IN_PROGRESS) } : { reclaim: row.asset_address, observedBlockHeight: null };
  }

  // Block height and slot from one response, so the asset read below is pinned to this view.
  const { blockHeight, absoluteSlot } = await connection.getEpochInfo("confirmed");
  if (blockHeight === undefined || blockHeight <= row.last_valid_block_height) {
    return { refuse: fail(409, "A mint for this agent is still confirming. Try again in a minute.") };
  }
  const info = await connection.getAccountInfo(new PublicKey(row.asset_address), { commitment: "confirmed", minContextSlot: absoluteSlot });
  if (isMplCoreOwned(info)) {
    const confirmed = await confirmMint({ assetAddress: row.asset_address, wallet });
    if (confirmed.status !== 200) console.error("[nft/prepare] found a landed mint but could not record it", row.asset_address, confirmed.body);
    return { refuse: fail(409, "This agent already has an NFT.") };
  }
  return { reclaim: row.asset_address, observedBlockHeight: blockHeight };
}

/** Salted hash of the client IP: enough to rate-limit by, without publishing addresses. */
function sourceKey(ip: string | undefined, salt: string): string {
  return createHash("sha256").update(`levelup-nft:${salt}:${ip ?? "unknown"}`).digest("hex").slice(0, 32);
}

/**
 * @param clientIp From the request (never the body); only used, hashed, to rate-limit unsigned requests.
 */
export async function prepareMint(
  input: { wallet?: string; agentId?: string; signature?: string; signedMessage?: string },
  clientIp?: string
): Promise<ServiceResult> {
  const { wallet, agentId, signature, signedMessage } = input;
  if (!wallet || !agentId) return fail(400, "Missing fields.");
  try {
    new PublicKey(wallet);
  } catch {
    return fail(400, "Invalid wallet.");
  }

  // Trust tier, not a gate. A signature that is attached must verify: a forged one is refused
  // outright rather than quietly falling back to the unsigned budget.
  let signed = false;
  if (signature || signedMessage) {
    if (!signature || !signedMessage) return fail(400, "Incomplete authorization.");
    const auth = verifyMintAuth(signedMessage, signature, wallet, agentId, Date.now());
    if (!auth.ok) return fail(401, MINT_AUTH_MESSAGES[auth.reason]);
    signed = true;
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

  const connection = new Connection(rpc, "confirmed");
  let decision: ReclaimDecision;
  try {
    decision = await reclaimablePending(sb, connection, agent.id, wallet);
    if ("refuse" in decision) return decision.refuse;
  } catch (e) {
    console.error("[nft/prepare] could not check the previous mint", e);
    return fail(503, "Could not check this agent's previous mint. Try again shortly.");
  }

  const irysAddress = env("IRYS_ADDRESS");
  const umi = createUmi(rpc).use(mplCore()).use(irysUploader(irysAddress ? { address: irysAddress } : {}));
  const authority = umi.eddsa.createKeypairFromSecretKey(bs58.decode(authoritySecret));
  umi.use(signerIdentity(createSignerFromKeypair(umi, authority)));
  const asset = generateSigner(umi);
  const assetAddress = asset.publicKey.toString();
  let tint: string | undefined;
  try {
    tint = weaponTint((await getGearForAgents([agent.id]))[agent.id]);
  } catch {
    tint = undefined;
  }
  // Includes everything the artwork and metadata depend on, so upload dedup can't reuse stale art.
  const snapshot = buildSnapshot(agent, tint, new Date());

  // Reserve before uploading: an upload for an agent that already has a live mint is wasted money.
  const { error: reserveError } = await sb.rpc("levelup_reserve_nft_mint", {
    p_player_id: player.id,
    p_agent_id: agent.id,
    p_asset_address: assetAddress,
    p_metadata_uri: "pending",
    p_snapshot: snapshot,
    p_signed: signed,
    p_source: sourceKey(clientIp, authoritySecret.slice(0, 16)),
    p_player_limit: signed ? RATE_LIMIT_SIGNED : RATE_LIMIT_UNSIGNED,
    p_source_limit: RATE_LIMIT_UNSIGNED_PER_SOURCE,
    p_global_unsigned_limit: RATE_LIMIT_UNSIGNED_GLOBAL,
    p_reclaim_asset: decision.reclaim,
    p_observed_block_height: decision.observedBlockHeight,
  });
  if (reserveError) {
    const match = RESERVE_ERRORS.find(([re]) => re.test(reserveError.message));
    if (!match) console.error("[nft/prepare] reserve failed", reserveError);
    return match ? fail(match[1], match[2]) : fail(500, "Could not start the mint.");
  }

  // From here on, failures leave the reservation unbuilt; the next prepare reclaims it once stale.
  let metadataUri: string;
  try {
    metadataUri = (await reusableUpload(sb, agent.id, snapshot)) ?? (await upload(umi, agent, snapshot));
  } catch (e) {
    console.error("[nft/prepare] upload failed", e);
    return fail(502, "Could not publish the NFT artwork. Try again shortly.");
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

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const tx = new Transaction();
    tx.add(SystemProgram.transfer({ fromPubkey: new PublicKey(wallet), toPubkey: new PublicKey(TREASURY_WALLET), lamports: MINT_LAMPORTS }));
    tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(nftMintMemo(agent.id), "utf8") }));
    for (const ix of builder.getInstructions()) tx.add(toWeb3JsInstruction(ix));
    tx.feePayer = new PublicKey(wallet);
    tx.recentBlockhash = blockhash;
    tx.partialSign(toWeb3JsKeypair(asset), toWeb3JsKeypair(authority));

    // Publish = compare-and-set, recorded BEFORE the tx leaves the server. Only a still-pending
    // reservation may publish: if a slow prepare's row was reclaimed meanwhile, this updates
    // nothing and the tx is discarded. Once published, the block height keeps the row from being
    // reclaimed while the transaction can still land.
    const { data: published, error: recordError } = await sb
      .from("levelup_nft_mints")
      .update({ metadata_uri: metadataUri, last_valid_block_height: lastValidBlockHeight, tx_built_at: new Date().toISOString() })
      .eq("asset_address", assetAddress)
      .eq("status", "pending")
      .select("id");
    if (recordError) {
      console.error("[nft/prepare] recording the transaction failed", recordError);
      return fail(502, "Could not record the mint. Try again shortly.");
    }
    if (published?.length !== 1) return fail(409, "This mint took too long and was replaced. Try again.");

    return {
      status: 200,
      body: { transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"), assetAddress },
    };
  } catch (e) {
    console.error("[nft/prepare] building the transaction failed", e);
    return fail(500, "Could not build the mint transaction.");
  }
}

/**
 * Metadata already uploaded for this exact snapshot, so retries (wallet rejections, expired
 * blockhashes) don't pay Irys again. The snapshot carries the weapon tint and mint date, so a
 * match always means identical artwork and metadata.
 */
async function reusableUpload(sb: SupabaseClient, agentId: string, snapshot: MintSnapshot): Promise<string | null> {
  const { data } = await sb
    .from("levelup_nft_mints")
    .select("metadata_uri")
    .eq("agent_id", agentId)
    // Explicit JSON: .eq() stringifies its value, and a plain object becomes "[object Object]".
    .eq("snapshot", JSON.stringify(snapshot))
    .neq("metadata_uri", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.metadata_uri ?? null;
}

async function upload(umi: ReturnType<typeof createUmi>, agent: AgentWithDimensions, snapshot: MintSnapshot): Promise<string> {
  const png = renderAvatarPng(agent.spriteSeed as unknown as SpriteSeed, agent.role, snapshot.weaponTint ?? undefined);
  const [imageUri] = await umi.uploader.upload([createGenericFile(png, `${agent.id}.png`, { contentType: "image/png" })]);
  return umi.uploader.uploadJson(buildNftMetadata(agent, snapshot, imageUri));
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
    .select("status, agent_id, levelup_players!inner(wallet_address)")
    .eq("asset_address", assetAddress)
    .maybeSingle();
  if (!mint) return fail(404, "Unknown mint.");

  // The mint table is public, so `wallet` is only a claim: bind it to the row's real owner, or an
  // attacker could confirm a victim's pending asset with their own payment transaction.
  const players = mint.levelup_players as { wallet_address: string } | { wallet_address: string }[] | null;
  const owner = Array.isArray(players) ? players[0] : players;
  if (owner?.wallet_address !== wallet) return fail(403, "That mint does not belong to this wallet.");
  if (mint.status === "confirmed") return { status: 200, body: { ok: true } };

  // Safe: the row was found by this address, and only server-generated addresses are stored.
  const assetKey = new PublicKey(assetAddress);
  const connection = new Connection(rpc, "confirmed");

  if (!signature) {
    const info = await connection.getAccountInfo(assetKey);
    if (!info) return fail(202, "Mint not visible on chain yet.");
    if (!isMplCoreOwned(info)) return fail(402, NOT_OUR_NFT);
    // A fresh asset has exactly one signature in its history: the create transaction.
    const sigs = await connection.getSignaturesForAddress(assetKey);
    if (!sigs.length) return fail(202, "Mint signature not visible on chain yet.");
    signature = sigs[sigs.length - 1].signature;
  }

  const opts = { payer: wallet, treasury: TREASURY_WALLET, minLamports: MINT_LAMPORTS, memo: nftMintMemo(mint.agent_id), assetAddress };
  let result: MintVerifyResult;
  for (let attempt = 1; ; attempt++) {
    result = verifyMint(await fetchMintTx(connection, signature), opts);
    if (result.ok || result.reason !== "not_found" || attempt === CONFIRM_ATTEMPTS) break;
    await sleep(CONFIRM_RETRY_MS);
  }
  if (!result.ok) {
    return { status: result.reason === "not_found" ? 202 : 402, body: { error: MINT_VERIFY_MESSAGES[result.reason], reason: result.reason } };
  }
  // The balance check alone can be satisfied by a dust transfer; require a real Core asset.
  if (!isMplCoreOwned(await connection.getAccountInfo(assetKey))) return fail(402, NOT_OUR_NFT);

  const { error } = await sb.rpc("levelup_confirm_nft_mint", {
    p_asset_address: assetAddress,
    p_tx_signature: signature,
    p_sol_amount: NFT_MINT_COST_SOL,
  });
  if (error) {
    // A landed, paid mint we can't record needs a human: log the asset and signature.
    console.error("[nft/confirm] confirm failed", { assetAddress, signature }, error);
    return fail(500, "Could not record the mint.");
  }
  return { status: 200, body: { ok: true } };
}
