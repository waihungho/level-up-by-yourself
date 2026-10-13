# CLAUDE.md

## Solana

- Keypair for Solana DApps store: `~/.config/solana/level-up-by-yourself.json`
- Public address: `D9SuHgVnCDGcN15CfYN7ahVoByUNAiYDzLvvbteKUvvB`

## Solana dApp Store Publishing

### Build & Publish Flow
1. `cd mobile && ./scripts/build-dapp-store.sh` — generates release keystore (if missing), builds signed APK (arm64-v8a for Seeker)
2. Update `cert_fingerprint` in `mobile/dapp-store/config.yaml` after generating a new keystore:
   ```bash
   keytool -list -v -keystore android/app/release.keystore -alias level-up-by-yourself -storepass levelup2026 | grep SHA-256
   ```
   Convert to lowercase, remove colons, paste into `config.yaml`.
3. `cd mobile && ./scripts/publish-dapp-store.sh` — validates, creates release NFT, and submits to Solana dApp Store
   - Script auto-detects first publish vs update
   - First publish: prompts for Publisher/App NFT creation, then `publish submit`
   - Update: skips NFT creation, uses `publish update`

### Version Bumping (required for each resubmission)
Update `versionCode` in **all three** places:
- `mobile/app.json` → `expo.android.versionCode`
- `mobile/android/app/build.gradle` → `defaultConfig.versionCode`
- `mobile/dapp-store/config.yaml` → `release.android_details.version_code`

### Critical: dapp-store CLI Defaults to Devnet
The `dapp-store` CLI defaults to `https://api.devnet.solana.com`. You **must** pass `-u https://api.mainnet-beta.solana.com` for production. The publish script handles this automatically.

### Critical: Publish Command Syntax
- First publish: `dapp-store publish submit` (not `dapp-store submit`)
- Update: `dapp-store publish update`
- Both require: `--complies-with-solana-dapp-store-policies --requestor-is-authorized`

### Required Assets
- `icon-512.png` (512x512) — required
- `banner-1200x600.png` (1200x600) — required
- `feature-1200x1200.png` (1200x1200) — optional, needed for Editor's Choice carousel
- `screenshot-*.png` — at least 1 required

### Known Issue: Debug Keystore Rejection
The dApp Store rejects APKs signed with the debug keystore ("dApp must be a production build"). The release build type in `build.gradle` must use `signingConfigs.release`, not `signingConfigs.debug`. After `expo prebuild --clean`, verify this hasn't been reverted.

### Release Signing Config
- Keystore: `mobile/android/app/release.keystore` (safe copy at `mobile/keystores/release.keystore`)
- Alias: `level-up-by-yourself`
- Credentials: `mobile/credentials.json` (used by EAS local builds)

### Review Timeline
- New submissions: 2-4 weeks (can be slow, ping Solana Mobile Discord `#dapp-store`)
- Updates: 1-2 business days
- No automated status notifications — check proactively

## Daily Agent Growth

Run manually from Claude Code whenever needed (once per day):

```bash
pnpm daily-growth
```

- Scans all agents in Supabase and applies passive dimension growth
- Growth is role-weighted: `medieval` agents grow Physical faster, `future` grows Technical, `modern` grows Mental
- Growth amount scales with the player's `ability_score` via `GROWTH_TIERS` multiplier
- Idempotent — safe to re-run, agents already grown today are skipped
- Script: `scripts/daily-growth.ts` | Growth logic: `scripts/daily-growth.ts:calculateGrowth`

## Tactical Battles / Squads / Raids

- Battles are server-authoritative sessions (`levelup_battle_sessions`). Engine: `src/lib/tactical/engine.ts` (pure, RNG-injected); service: `src/lib/tactical/battle-service.ts`; routes: `/api/battle/{start,turn,session/[id]}`.
- Apply SQL migrations in order in the Supabase SQL editor **before** deploying: `003_tactical_battles.sql` → `004_squads.sql` → `005_raids.sql`.
- `006_perf_rpcs.sql` adds read RPCs (`levelup_bootstrap`, `levelup_fight_counts_today`, `levelup_random_opponent_agent`, `levelup_raid_standings`). The app falls back to the old multi-query paths when they are missing, so it can be applied before or after deploying.
- `007_rankings_rpc.sql` adds `levelup_rankings` (top 100 computed in Postgres, ~0.3s vs 5–7s in JS). Rankings are served by `/api/rank` (`src/lib/rankings.ts`, falls back to the JS path if the RPC is missing), CDN-cached 2 min fresh + 24 h stale-while-revalidate, and the rank page shows the last cached copy instantly (`useRankings`). Don't page all agent dimensions from the browser.
- Migrations 006 and 007 are applied in production (2026-10-11).
- Set `SUPABASE_SERVICE_ROLE_KEY` in Vercel (production + preview, sensitive). Without it, routes throw when Supabase is configured.
- Balance constants live in `src/lib/tactical/constants.ts`; `src/lib/tactical/__tests__/balance.test.ts` enforces the targets. Re-run it after any tuning.
- Demo mode (no Supabase) cannot run full battles in the browser: demo data lives client-side while routes run server-side.
- Squads: `src/lib/squads.ts` (persistence, Elo, matchmaking), `src/lib/tactical/squad.ts` (engine), `/api/squad`, `/squad` builder page.
- Raids: `src/lib/raid/*`. Weekly cron `/api/cron/raid-weekly` (Monday 00:00 UTC, `vercel.json`) expires/pays the old boss and spawns the next one; requires `CRON_SECRET`.
- Raid difficulty: boss stats = 90th percentile of all agents (gear included) × `BOSS_STAT_MULT` (`bosses.ts`); boss damage × `BOSS_DAMAGE_MULT` in every phase (`raid-engine.ts`). Next boss HP aims for a day-6 kill (`nextBossHp` in `raid-cron.ts`, max 5× after an early kill). Rewards table lives in `src/lib/raid/rewards.ts` (client-safe, shown on `/raid`).
- Enable Supabase Realtime for `levelup_raid_bosses` and `levelup_raid_hits` (migration 005 adds them to the `supabase_realtime` publication; check Database → Replication). Without it `/raid` falls back to polling every 15s.
- Paid fight recharge: the client sends the payment signature to `/api/battle/recharge`, which verifies the transfer on-chain (`NEXT_PUBLIC_SOLANA_RPC_URL`, treasury, 0.05 SOL, < 15 min old) and records it in `levelup_fight_recharges`.
- The daily-growth cron also sweeps battle sessions abandoned for 30+ minutes and retries unfinished raid payouts.
- To spawn the first boss right after deploying, call the cron once: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/raid-weekly`.

## Gem Shop & Equipment

- Spec: `docs/superpowers/specs/2026-10-11-gem-shop-equipment-design.md`. Code: `src/lib/shop/*` (catalog, gems, shop-db/read, gear-db/read, shop-service, gear-service), routes `/api/shop`, `/api/shop/gems`, `/api/shop/buy`, `/api/shop/gear`, page `/shop`, `EquipmentPanel` on `/agents/[id]`.
- Gems are off-chain points: `levelup_gem_wallets` + `levelup_gem_ledger` (unique `ref` = idempotency) changed only via `levelup_gems_apply` (service role; refuses negative balances). Gem packs are verified on-chain (`verifySolPayment`) and credited once per signature.
- Prices/effects live in `src/lib/shop/catalog.ts` (no caps by design). Gear bonuses apply at battle time in `toSide` (`gearBonus`); fighters get gear via `withGear()`.
- Elixir growth logs use `narrative = "elixir:<itemId>"`; the daily growth job only treats `narrative IS NULL` logs as "already grown today".
- Migrations `008_gem_shop.sql` and `009_equipment.sql` must be applied in prod before deploying the shop.

## Agent NFTs

- Spec: `docs/superpowers/specs/2026-10-13-agent-nft-mint-design.md`. Code: `src/lib/nft/*` (metadata, render-avatar, verify-mint, eligibility, mint-service, nft-read), routes `/api/nft/{prepare,confirm}`, `MintNftPanel` on `/agents/[id]` (owner only).
- 0.05 SOL (`NFT_MINT_COST_SOL`) + Metaplex Core `create` go in **one** transaction built and partially signed by `/api/nft/prepare`; never split them. Memo `levelup:nft:<agentId>` keeps the payment from being redeemed elsewhere.
- `/prepare` reclaims an agent's pending reservation only after proving on-chain that its tx can't land (asset absent and block height past the row's `last_valid_block_height`). Don't replace this with a wall-clock TTL, because the blockhash is fetched after the Irys uploads. A wallet-signed authorization (`mint-auth.ts`, desktop only) gets the higher rate limit.
- One NFT per agent, frozen snapshot (agent keeps growing). Image = sprite rendered server-side to a 512×512 PNG (`renderAvatarPng`); attributes = role, 5 category totals, Total Power, all 50 dimensions. Trait names are permanent once minted.
- Setup: apply `010_nft_mints.sql`; fund a mint-authority keypair (pays Irys uploads); `NFT_MINT_AUTHORITY_SECRET=<base58> node scripts/create-nft-collection.mjs --network devnet|mainnet [--yes]`; set `NFT_MINT_AUTHORITY_SECRET` (sensitive), `NEXT_PUBLIC_NFT_COLLECTION_ADDRESS`, optionally `SOLANA_RPC_URL` / `IRYS_ADDRESS` in Vercel.
- Metaplex deps are pinned to umi 1.5.x via `overrides` in `pnpm-workspace.yaml` (umi 1.6 needs a newer web3.js); `@noble/hashes@1.8.0` is a direct dep for mpl-core's peer. Don't bump them casually.
