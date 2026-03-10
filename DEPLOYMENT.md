# Deployment Report — Level Up by Yourself v1.0.0

## Date: 2026-03-10

## Network: Solana Mainnet

### RPC Configuration
- **Provider**: Helius
- **Web RPC**: `https://mainnet.helius-rpc.com` (via `NEXT_PUBLIC_SOLANA_RPC_URL`)
- **Mobile RPC**: `https://mainnet.helius-rpc.com` (hardcoded in `mobile/src/constants/config.ts`)
- **Network**: `mainnet-beta`

### On-Chain Addresses
- **Publisher Wallet**: `D9SuHgVnCDGcN15CfYN7ahVoByUNAiYDzLvvbteKUvvB`
- **App NFT**: `8U6X99rkxbh3mtE1RoKz7kTmRE2QR7sxTRknxdoRbQAY` ([Explorer](https://explorer.solana.com/address/8U6X99rkxbh3mtE1RoKz7kTmRE2QR7sxTRknxdoRbQAY))
- **Release NFT (v1.0.0)**: `23vKjJSqmfdLd2wWd8FBsrYmzMgZoEMxYhxejWbv16BQ` ([Explorer](https://explorer.solana.com/address/23vKjJSqmfdLd2wWd8FBsrYmzMgZoEMxYhxejWbv16BQ))
- **Treasury Wallet**: `D9SuHgVnCDGcN15CfYN7ahVoByUNAiYDzLvvbteKUvvB`

### APK Optimization
| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| APK Size | 65 MB | 21 MB | 68% |

**Optimizations applied:**
- Architecture: `arm64-v8a` only (Seeker phone target)
- R8 minification enabled (`android.enableMinifyInReleaseBuilds=true`)
- Resource shrinking enabled (`android.enableShrinkResourcesInReleaseBuilds=true`)
- JS bundle compression enabled (`enableBundleCompression=true`)
- PNG crunching enabled
- Network inspector disabled for release

### Solana dApp Store Submission
- **Status**: Submitted (pending review, ~3-4 business days)
- **Package**: `app.levelup.byyourself`
- **Publisher Email**: `wk.t202@gmail.com`
- **Keypair**: `~/.config/solana/level-up-by-yourself.json`
- **APK uploaded to Arweave**: `https://arweave.net/uilmHt7HcGDKqnggUcGsqRsUeiIuI2YUbxu0vlKyJ84`

### Assets (uploaded to Arweave)
- Icon (512x512): `https://arweave.net/pT-SSDXtdJIOkW0amMVjL0_2DPLs_xvpqbGW3wXuTVY`
- Banner (1200x600): `https://arweave.net/MKbG6A_BYHh1bdA-R3J8YsaFcyhMYf0a705ZiaO-23k`
- Screenshots: 4 uploaded

### Web App
- **URL**: https://level-up-by-yourself.vercel.app
- **Vercel env vars to update**: `NEXT_PUBLIC_SOLANA_RPC_URL` and `NEXT_PUBLIC_SOLANA_NETWORK` must be set to mainnet values

### Files Changed
- `.env.local` — switched from devnet to mainnet RPC
- `mobile/android/gradle.properties` — APK optimizations (arm64, R8, shrink)
- `mobile/dapp-store/config.yaml` — updated email, short description, cert fingerprint, App/Release NFT addresses
- `mobile/dapp-store/assets/` — resized icon to 512x512, screenshots to 1080px+ width
- `mobile/package.json` — fixed keypair path
- `mobile/scripts/publish-dapp-store.sh` — fixed keypair path
- `CLAUDE.md` — fixed keypair path
- `src/app/page.tsx` — added version number display

### Next Steps
- [ ] Wait for Solana dApp Store review (3-4 business days)
- [ ] Update Vercel environment variables to mainnet
- [ ] Set up a production signing keystore (currently using debug keystore)
- [ ] Monitor publisher portal: https://publisher.solanamobile.com
