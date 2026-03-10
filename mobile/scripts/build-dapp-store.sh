#!/bin/bash
set -e

echo "============================================"
echo "  Level Up by Yourself - dApp Store Build"
echo "============================================"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Please run this script from the mobile directory${NC}"
    exit 1
fi

if ! command -v eas &> /dev/null; then
    echo -e "${YELLOW}EAS CLI not found. Installing...${NC}"
    npm install -g eas-cli
fi

KEYSTORE_PATH="android/app/levelup-release.keystore"
if [ ! -f "$KEYSTORE_PATH" ]; then
    echo -e "${YELLOW}Keystore not found. Creating new keystore...${NC}"
    echo "IMPORTANT: Save the password you enter!"
    mkdir -p android/app
    keytool -genkeypair -v \
        -storetype PKCS12 \
        -keystore "$KEYSTORE_PATH" \
        -alias levelup \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000
    echo -e "${GREEN}Keystore created at: $KEYSTORE_PATH${NC}"
    echo -e "${RED}BACKUP THIS FILE AND YOUR PASSWORD SECURELY!${NC}"
fi

echo "Step 1: Installing dependencies..."
npm install

echo ""
echo "Step 2: Running Expo prebuild..."
npx expo prebuild --platform android --clean

echo ""
echo "Step 3: Building release APK..."
eas build --profile solana-dapp-store --platform android --local

echo ""
echo -e "${GREEN}Build Complete!${NC}"
echo "APK: android/app/build/outputs/apk/release/app-release.apk"
echo ""
echo "Next: Sign the APK, then run ./scripts/publish-dapp-store.sh"
