# Agent NFT Mint — Design

Date: 2026-10-13 · Branch: `feature/nft` · Reference: `feed-the-chicken` (`src/app/api/mint-nft/*`, `src/lib/nft*.ts`, `src/lib/verify-mint.ts`, `supabase/migrations/20260817*_nft_*.sql`)

## Goal

A player pays **0.05 SOL** to mint one of their agents as a Solana NFT. The NFT carries the agent's
pixel avatar as its image and its dimensions as attributes.

## Decisions

- **Frozen snapshot.** The NFT records the agent as it was at mint. The agent keeps growing in game; the NFT does not change. No re-sync, no re-mint.
- **One NFT per agent.** Enforced in the database, not just the UI.
- **Avatar-only image.** 512×512 PNG: the 32×32 sprite scaled ×16 on a role-coloured background. Stats live only in metadata attributes.
- **Metaplex Core** asset in a single "Level Up By Yourself" collection, 5% royalty to the treasury.
- **Atomic pay + mint.** The 0.05 SOL treasury transfer and the Core `create` share one transaction, so there is no state where the player paid and no NFT exists.

## Player flow

1. On `/agents/[id]`, the owner sees a **Mint as NFT · 0.05 SOL** panel (hidden for other players' agents and in demo mode).
2. Clicking it walks through `preparing → signing → confirming → done`, showing progress in the panel.
3. Once confirmed, the panel shows **Minted** with a Solscan link to the asset; the button is gone.
4. While a mint is pending (its transaction was built less than 3 minutes ago) the button is disabled with "still confirming". The server stays authoritative and returns 409 until the old transaction provably can't land.
5. If confirmation polling runs out, the panel shows a non-error "still confirming" state with the signature. The next page load reconciles it.

## NFT contents

- **name**: agent name
- **symbol**: `LUBY`
- **description**: `"<name> — <roleTitle>. <character> Objective: <objective>"` (trimmed to 500 chars)
- **image**: Arweave URI of the PNG; `properties.files = [{ uri, type: "image/png" }]`, `category: "image"`
- **external_url**: `NEXT_PUBLIC_SITE_URL`, falling back to the production host
- **attributes**:
  - `Role` (future/modern/medieval → "Future"/"Modern"/"Medieval"), `Role Title`
  - Category totals: `Physical`, `Mental`, `Social`, `Spiritual`, `Technical` (sum of that category's 10 dimension values)
  - `Total Power` (sum of all 50)
  - All 50 dimensions by name (`Strength`, `Agility`, …), numeric values
  - `Minted` (YYYY-MM-DD)

The image uses the agent's current weapon tint (from gear) so it matches what the player sees. Gear levels are not recorded as traits.

### Image rendering

`src/lib/nft/render-avatar.ts` (server-only, pure apart from `node:zlib`):
- Calls `generateSpriteData(spriteSeed, role, weaponTint)`.
- Paints a 512×512 RGBA buffer: a role background colour fills the canvas, and the sprite is drawn at ×14 scale (448px), centred.
- Encodes the PNG by hand: signature, IHDR, IDAT (zlib deflate of filter-0 scanlines) and IEND with CRC32. No image dependency.
- The output is deterministic, so the same agent always gives the same bytes.

## Architecture

### Units

| Unit | Purpose | Depends on |
|---|---|---|
| `src/lib/nft/metadata.ts` | Pure: `buildNftMetadata(agent, imageUri, mintedAt)`, `buildSnapshot(agent)` | constants (DIMENSIONS) |
| `src/lib/nft/render-avatar.ts` | Pure-ish: `renderAvatarPng(seed, role, tint) → Buffer` | sprite-renderer, node:zlib |
| `src/lib/nft/eligibility.ts` | Client-safe: `canMint(mint, now)`, `MINT_RESERVATION_TTL_MS`, `MintPhase` | — |
| `src/lib/nft/verify-mint.ts` | Pure: `verifyMint(parsedTx, {payer, treasury, minLamports, assetAddress})` | — |
| `src/lib/nft/nft-read.ts` | Client read: `getNftMint(agentId)` (latest pending/confirmed row) | supabase |
| `src/app/api/nft/prepare/route.ts` | Reserve, render, upload, build and partially sign the tx | above + umi/mpl-core/irys |
| `src/app/api/nft/confirm/route.ts` | Verify on chain, mark confirmed (signature or reconcile mode) | above |
| `src/hooks/useMintNft.ts` | Client flow and phases | useUnifiedWallet |
| `src/components/nft/MintNftPanel.tsx` | UI on the agent page | useMintNft, eligibility |
| `supabase/migrations/010_nft_mints.sql` | Table, RPCs, RLS | — |
| `scripts/create-nft-collection.mjs` | One-off collection creation per network | umi/mpl-core |

### Data

`levelup_nft_mints`:
`id uuid pk, agent_id → levelup_agents (cascade), player_id → levelup_players (cascade), asset_address text unique, metadata_uri text, tx_signature text unique null, status pending|confirmed|expired, snapshot jsonb, sol_amount numeric null, created_at, confirmed_at`.

- Partial unique index on `(agent_id) WHERE status IN ('pending','confirmed')`: this is the double-mint guard.
- RLS: public SELECT; writes only through SECURITY DEFINER functions granted to `service_role`.
- Columns `last_valid_block_height` and `tx_built_at` are set when prepare hands out a transaction.
- `levelup_reserve_nft_mint(p_player_id, p_agent_id, p_asset_address, p_metadata_uri, p_snapshot, p_rate_limit, p_reclaim_asset)`:
  1. Takes a per-player advisory lock.
  2. Expires only the pending row the server names in `p_reclaim_asset`.
  3. Checks that the player owns the agent.
  4. Enforces the rate limit: at most `p_rate_limit` reservations per player in 10 minutes.
  5. Inserts the row. A unique violation raises "already has a mint".
- `levelup_confirm_nft_mint(p_asset_address, p_tx_signature, p_sol_amount)`:
  - Idempotent for the same signature, and refuses a different one.
  - Also accepts an `expired` row. A transaction that landed after its reservation was reclaimed is still a real paid mint, but only if no other live row exists for the agent.

### Prepare (`POST /api/nft/prepare {wallet, agentId, signature?, signedMessage?}`)

0. Optional wallet-signed authorization (`mint-auth.ts`: header, agent id, issued time within 5 minutes).
   - A valid signature gets the signed rate limit (6 per player per 10 minutes).
   - An unsigned request gets 3 per player, 4 per client IP (stored as a salted hash) and 60 across all players, each per 10 minutes.
   - A signature that is present but invalid returns 401.
   - The mobile bridge can't sign messages, so it uses the unsigned tier.
1. Validate the env (`NFT_MINT_AUTHORITY_SECRET`, `NEXT_PUBLIC_NFT_COLLECTION_ADDRESS`, RPC, service role). If anything is missing, return 503.
2. Resolve the player by wallet and the agent by id plus player. If either is missing, return 404.
3. Load the agent's dimensions and gear tint.
4. Check the agent's live row (`reclaimablePending`). RPC errors return 503, so the server fails closed.
   - **Confirmed:** return 409.
   - **Transaction never built and the row is under 3 minutes old:** return 409.
   - **Transaction built and blockhash still valid:** `getEpochInfo` reports a block height ≤ `last_valid_block_height`; return 409.
   - **Asset is on chain:** read with `minContextSlot` set to that epoch's slot. Confirm it and return 409.
   - **Otherwise:** reclaim the row. The SQL reclaim re-checks the row against the observed block height, so a prepare that publishes at the same moment wins.
5. Generate the asset signer, then reserve the row with metadata_uri `"pending"`. A 409 means it's taken; a 429 means rate limited.
6. Reuse an earlier upload of the identical snapshot. The snapshot includes the weapon tint and the mint date, so a match means identical art and metadata. Otherwise render the PNG and upload the image and the metadata JSON via Irys. On failure, return 502.
7. Build the transaction:
   - `SystemProgram.transfer(wallet → TREASURY_WALLET, 0.05 SOL)` plus the Core `create({asset, collection, name, uri, owner: wallet, payer: noop(wallet), authority: identity})`.
   - feePayer is the wallet. It's partially signed by the asset key and the authority key.
8. Publish with a compare-and-set: record `metadata_uri`, `last_valid_block_height` and `tx_built_at` only if the row is still `pending`. If it isn't (a slow prepare whose row was reclaimed), discard the transaction and return 409. Otherwise return `{ transaction (base64), assetAddress }`.

### Confirm (`POST /api/nft/confirm {assetAddress, wallet, signature?}`)

1. Look up the row and join the player wallet. If the wallet doesn't match, return 403. If the row is already confirmed, return 200.
2. With no signature (reconcile mode):
   - The asset account must exist; otherwise return 202.
   - It must be owned by mpl-core; otherwise return 402.
   - The signature is taken from the oldest entry in `getSignaturesForAddress`.
3. Fetch the transaction, retrying up to 4 times. `verifyMint` checks:
   - The transaction didn't fail.
   - The payer signed.
   - The treasury balance went up by at least 0.05 SOL.
   - The asset account went from 0 to more than 0 lamports.
4. Require mpl-core ownership of the asset, then call `levelup_confirm_nft_mint`.

### Client

- `useMintNft(agentId, mint)`:
  - Phases are `idle | preparing | signing | confirming | done | unconfirmed | error`.
  - It calls prepare, then `sendTransaction`, then polls confirm (10 tries, 3 s apart; 202 means retry).
  - It refreshes the mint row on failure, so a pending reservation blocks the button.
- When the agent page loads a `pending` row, it fires one reconcile confirm call (no signature) in the background.

## Error handling

- Every route returns JSON `{ error }` with a status: 400, 401/403, 404, 409, 429, 502 or 503.
- A wallet rejection after prepare leaves a pending row. The next prepare reclaims it only once the chain shows its blockhash has expired and the asset was never created. That way, two transactions that could both land never exist for one agent.
- If the upload or build fails after the reservation, the row has no built transaction. The next prepare reclaims it once it is 3 minutes old.

## Configuration / deployment

- New deps: `@metaplex-foundation/mpl-core`, `umi`, `umi-bundle-defaults`, `umi-uploader-irys`, `umi-web3js-adapters`, `bs58`.
- Env:
  - `NFT_MINT_AUTHORITY_SECRET`: base58 secret key, sensitive, server-only.
  - `NEXT_PUBLIC_NFT_COLLECTION_ADDRESS`
  - `SOLANA_RPC_URL`: server RPC; falls back to `NEXT_PUBLIC_SOLANA_RPC_URL`.
- The mint authority needs a small SOL balance to fund Irys uploads.
- Apply `010_nft_mints.sql` before deploying.
- Run `node scripts/create-nft-collection.mjs --network devnet|mainnet [--yes]` once and set the collection address.
- Document all of this in CLAUDE.md.

## Out of scope

- Re-sync or re-mint, marketplace UI, and burning.

## Testing (vitest)

- `render-avatar`:
  - The PNG signature and IHDR (512×512) are correct.
  - Decoding with `zlib.inflateSync` gives the expected pixel colours at a sprite pixel and a background pixel.
  - The output is deterministic.
- `metadata`:
  - The 50 dimension traits, the category totals and the total are right.
  - The role label, the description trimming and the external_url fallback are right.
- `verify-mint`:
  - The success case passes.
  - Each of these is rejected: failed tx, wrong payer, underpaid treasury, asset not created, tx not found.
- `eligibility`:
  - Confirmed rows block minting.
  - A pending row within the TTL blocks; a pending row past the TTL allows.
  - No row allows.
