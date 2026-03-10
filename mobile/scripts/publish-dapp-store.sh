#!/bin/bash
set -e

echo "============================================"
echo "  Level Up by Yourself - dApp Store Publish"
echo "============================================"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

KEYPAIR="$HOME/.config/solana/level-up-by-yourself.json"
if [ ! -f "$KEYPAIR" ]; then
    echo -e "${RED}Error: Publisher keypair not found at $KEYPAIR${NC}"
    echo "Create one with: solana-keygen new -o $KEYPAIR"
    exit 1
fi
echo -e "${GREEN}Publisher: $(solana address -k $KEYPAIR)${NC}"

if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Please run this script from the mobile directory${NC}"
    exit 1
fi

if ! command -v dapp-store &> /dev/null; then
    echo -e "${YELLOW}dApp Store CLI not found. Installing...${NC}"
    npm install -g @solana-mobile/dapp-store-cli
fi

cd dapp-store

if [ ! -f "config.yaml" ]; then
    echo -e "${RED}Error: config.yaml not found${NC}"
    exit 1
fi

echo "Checking assets..."
for f in "assets/icon-512.png" "assets/banner-1200x600.png" "assets/screenshot-1.png"; do
    if [ ! -f "$f" ]; then
        echo -e "${RED}Missing: $f${NC}"
        exit 1
    else
        echo -e "${GREEN}Found: $f${NC}"
    fi
done

APK_PATH="../android/app/build/outputs/apk/release/app-release-signed.apk"
if [ ! -f "$APK_PATH" ]; then
    echo -e "${RED}Error: Signed APK not found at $APK_PATH${NC}"
    exit 1
fi

echo ""
echo -e "${CYAN}Step 1: Validating...${NC}"
dapp-store validate -k "$KEYPAIR"

echo ""
echo -e "${CYAN}Step 2: Publisher NFT${NC}"
read -p "Create Publisher NFT? (y/n): " CREATE_PUBLISHER
if [ "$CREATE_PUBLISHER" = "y" ]; then
    dapp-store create publisher -k "$KEYPAIR"
fi

echo ""
echo -e "${CYAN}Step 3: App NFT${NC}"
read -p "Create App NFT? (y/n): " CREATE_APP
if [ "$CREATE_APP" = "y" ]; then
    dapp-store create app -k "$KEYPAIR"
fi

echo ""
echo -e "${CYAN}Step 4: Creating Release NFT...${NC}"
dapp-store create release -k "$KEYPAIR"

echo ""
echo -e "${CYAN}Step 5: Submitting...${NC}"
dapp-store submit -k "$KEYPAIR"

echo ""
echo -e "${GREEN}Submission Complete!${NC}"
echo "Review typically takes 1-3 business days."
echo "Check status: https://publisher.solanamobile.com"
