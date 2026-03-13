# CLAUDE.md

## Solana

- Keypair for Solana DApps store: `~/.config/solana/level-up-by-yourself.json`
- Public address: `D9SuHgVnCDGcN15CfYN7ahVoByUNAiYDzLvvbteKUvvB`

## Solana dApp Store Publishing

### Build & Publish Flow
1. `cd mobile && ./scripts/build-dapp-store.sh` — generates release keystore (if missing) and builds signed APK
2. Update `cert_fingerprint` in `mobile/dapp-store/config.yaml` after generating a new keystore:
   ```bash
   keytool -list -v -keystore android/app/release.keystore -alias level-up-by-yourself -storepass levelup2026 | grep SHA-256
   ```
   Convert to lowercase, remove colons, paste into `config.yaml`.
3. `./scripts/publish-dapp-store.sh` — publishes to Solana dApp Store

### Version Bumping (required for each resubmission)
Update `versionCode` in **all three** places:
- `mobile/app.json` → `expo.android.versionCode`
- `mobile/android/app/build.gradle` → `defaultConfig.versionCode`
- `mobile/dapp-store/config.yaml` → `release.android_details.version_code`

### Known Issue: Debug Keystore Rejection
The dApp Store rejects APKs signed with the debug keystore ("dApp must be a production build"). The release build type in `build.gradle` must use `signingConfigs.release`, not `signingConfigs.debug`. After `expo prebuild --clean`, verify this hasn't been reverted.

### Release Signing Config
- Keystore: `mobile/android/app/release.keystore`
- Alias: `level-up-by-yourself`
- Credentials: `mobile/credentials.json` (used by EAS local builds)
