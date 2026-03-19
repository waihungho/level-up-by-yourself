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
