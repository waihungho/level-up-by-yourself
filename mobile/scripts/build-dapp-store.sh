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

# Store keystore in a safe location outside android/ (which gets wiped by prebuild --clean)
KEYSTORE_SAFE_PATH="keystores/release.keystore"
KEYSTORE_BUILD_PATH="android/app/release.keystore"

if [ ! -f "$KEYSTORE_SAFE_PATH" ]; then
    echo -e "${YELLOW}Keystore not found. Creating new keystore...${NC}"
    mkdir -p keystores
    keytool -genkeypair -v \
        -storetype PKCS12 \
        -keystore "$KEYSTORE_SAFE_PATH" \
        -alias level-up-by-yourself \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -storepass levelup2026 \
        -keypass levelup2026 \
        -dname "CN=Level Up by Yourself, O=Level Up, L=Unknown, ST=Unknown, C=US"
    echo -e "${GREEN}Keystore created at: $KEYSTORE_SAFE_PATH${NC}"
    echo -e "${RED}BACKUP THIS FILE AND YOUR PASSWORD SECURELY!${NC}"
fi

echo "Step 1: Installing dependencies..."
npm install

echo ""
echo "Step 2: Running Expo prebuild..."
npx expo prebuild --platform android --clean

echo ""
echo "Step 3: Injecting release signing config..."
# Copy keystore into android/app/ (prebuild --clean wipes this directory)
cp "$KEYSTORE_SAFE_PATH" "$KEYSTORE_BUILD_PATH"
echo "Copied keystore to $KEYSTORE_BUILD_PATH"

# Optimize: build arm64-v8a only (Saga & Seeker are both arm64)
sed -i '' 's/reactNativeArchitectures=.*/reactNativeArchitectures=arm64-v8a/' android/gradle.properties
echo "Set architecture to arm64-v8a only"

# Patch build.gradle: add release signing config and use it for release builds
python3 << 'PYEOF'
import re

path = "android/app/build.gradle"
with open(path, "r") as f:
    content = f.read()

# Add release signing config after the debug signing config block
release_config = """        release {
            storeFile file('release.keystore')
            storePassword 'levelup2026'
            keyAlias 'level-up-by-yourself'
            keyPassword 'levelup2026'
        }"""

content = content.replace(
    "            keyPassword 'android'\n        }\n    }",
    "            keyPassword 'android'\n        }\n" + release_config + "\n    }"
)

# In the release buildType, replace signingConfigs.debug with signingConfigs.release
content = re.sub(
    r'(release \{[^}]*?)signingConfig signingConfigs\.debug',
    r'\1signingConfig signingConfigs.release',
    content,
    count=1,
    flags=re.DOTALL
)

with open(path, "w") as f:
    f.write(content)

print("Done - release signing config injected into build.gradle")
PYEOF

echo -e "${GREEN}Release signing config injected.${NC}"

echo ""
echo "Step 4: Building release APK with Gradle..."
cd android
./gradlew assembleRelease
cd ..

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK_PATH" ]; then
    echo ""
    echo -e "${GREEN}Build Complete!${NC}"
    echo "APK: $APK_PATH"
    echo ""
    echo "Next: Run ./scripts/publish-dapp-store.sh"
else
    echo -e "${RED}Build failed - APK not found at $APK_PATH${NC}"
    exit 1
fi
