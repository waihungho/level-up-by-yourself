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

# --- Config ---
KEYPAIR="$HOME/.config/solana/level-up-by-yourself.json"
RPC_URL="https://api.mainnet-beta.solana.com"
BUILD_TOOLS="$HOME/Library/Android/sdk/build-tools/36.1.0"

if [ ! -f "$KEYPAIR" ]; then
    echo -e "${RED}Error: Publisher keypair not found at $KEYPAIR${NC}"
    echo "Create one with: solana-keygen new -o $KEYPAIR"
    exit 1
fi
echo -e "${GREEN}Publisher: $(solana address -k $KEYPAIR)${NC}"
echo -e "${CYAN}Network:   $RPC_URL${NC}"

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

# --- Asset checks ---
echo "Checking assets..."
for f in "assets/icon-512.png" "assets/banner-1200x600.png" "assets/screenshot-1.png"; do
    if [ ! -f "$f" ]; then
        echo -e "${RED}Missing: $f${NC}"
        exit 1
    else
        echo -e "${GREEN}Found: $f${NC}"
    fi
done

if [ -f "assets/feature-1200x1200.png" ]; then
    echo -e "${GREEN}Found: assets/feature-1200x1200.png (feature graphic)${NC}"
else
    echo -e "${YELLOW}Optional: assets/feature-1200x1200.png not found (needed for Editor's Choice)${NC}"
fi

APK_PATH="../android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK_PATH" ]; then
    echo -e "${RED}Error: Signed APK not found at $APK_PATH${NC}"
    echo "Run ./scripts/build-dapp-store.sh first"
    exit 1
fi

# Show APK info
echo ""
echo -e "${CYAN}APK Info:${NC}"
APK_SIZE=$(ls -lh "$APK_PATH" | awk '{print $5}')
echo "  Size: $APK_SIZE"
if command -v aapt &> /dev/null || [ -f "$BUILD_TOOLS/aapt" ]; then
    AAPT="${BUILD_TOOLS}/aapt"
    VERSION_INFO=$($AAPT dump badging "$APK_PATH" 2>/dev/null | grep "versionCode" || true)
    ARCH_INFO=$($AAPT dump badging "$APK_PATH" 2>/dev/null | grep "native-code" || true)
    echo "  $VERSION_INFO"
    echo "  $ARCH_INFO"
fi

# --- Validate ---
echo ""
echo -e "${CYAN}Step 1: Validating...${NC}"
dapp-store validate -k "$KEYPAIR" -b "$BUILD_TOOLS" -u "$RPC_URL"

# --- Determine first publish vs update ---
echo ""
LAST_VERSION=$(grep -A1 "lastSubmittedVersionOnChain" config.yaml | grep "version_code" | awk '{print $2}' || echo "")

if [ -z "$LAST_VERSION" ] || [ "$LAST_VERSION" = "" ]; then
    echo -e "${YELLOW}First-time publish detected${NC}"

    echo ""
    echo -e "${CYAN}Step 2: Publisher NFT${NC}"
    read -p "Create Publisher NFT? (y/n): " CREATE_PUBLISHER
    if [ "$CREATE_PUBLISHER" = "y" ]; then
        dapp-store create publisher -k "$KEYPAIR" -u "$RPC_URL"
    fi

    echo ""
    echo -e "${CYAN}Step 3: App NFT${NC}"
    read -p "Create App NFT? (y/n): " CREATE_APP
    if [ "$CREATE_APP" = "y" ]; then
        dapp-store create app -k "$KEYPAIR" -u "$RPC_URL"
    fi

    echo ""
    echo -e "${CYAN}Step 4: Creating Release NFT...${NC}"
    dapp-store create release -k "$KEYPAIR" -u "$RPC_URL"

    echo ""
    echo -e "${CYAN}Step 5: Submitting to publisher portal...${NC}"
    dapp-store publish submit -k "$KEYPAIR" -u "$RPC_URL" \
        --complies-with-solana-dapp-store-policies \
        --requestor-is-authorized
else
    echo -e "${CYAN}Update detected (last on-chain version_code: $LAST_VERSION)${NC}"

    echo ""
    echo -e "${CYAN}Step 2: Creating Release NFT...${NC}"
    dapp-store create release -k "$KEYPAIR" -u "$RPC_URL"

    echo ""
    echo -e "${CYAN}Step 3: Submitting update to publisher portal...${NC}"
    dapp-store publish update -k "$KEYPAIR" -u "$RPC_URL" \
        --complies-with-solana-dapp-store-policies \
        --requestor-is-authorized
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Submission Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo "Review typically takes 1-2 business days."
echo "Check status: https://publisher.solanamobile.com"
