# CryptoFolio — macOS Distribution

## Building a release DMG (no Apple Developer account)

### Step 1 — Build release .app from CLI

```bash
cd ~/Documents/Crypto_portfolio_calculator/CryptoFolio

xcodebuild \
  -scheme CryptoFolio \
  -configuration Release \
  -destination "platform=macOS" \
  CODE_SIGN_IDENTITY="-" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO \
  CONFIGURATION_BUILD_DIR=~/Desktop/CryptoFolio-build \
  build
```

### Step 2 — Ad-hoc sign

```bash
codesign --deep --force --options runtime --sign "-" \
  ~/Desktop/CryptoFolio-build/CryptoFolio.app

codesign --verify --verbose \
  ~/Desktop/CryptoFolio-build/CryptoFolio.app
```

### Step 3 — Package as DMG

```bash
mkdir -p ~/Desktop/CryptoFolio-dmg
cp -r ~/Desktop/CryptoFolio-build/CryptoFolio.app ~/Desktop/CryptoFolio-dmg/
ln -s /Applications ~/Desktop/CryptoFolio-dmg/Applications

hdiutil create \
  -volname "CryptoFolio" \
  -srcfolder ~/Desktop/CryptoFolio-dmg \
  -ov -format UDZO \
  ~/Desktop/CryptoFolio.dmg

rm -rf ~/Desktop/CryptoFolio-dmg
rm -rf ~/Desktop/CryptoFolio-build
```

DMG is at `~/Desktop/CryptoFolio.dmg`.

---

## What recipients need to do (Gatekeeper)

Because the app is not notarized, macOS will block it on first launch.
Recipients must:

1. Open the DMG → drag CryptoFolio to Applications
2. When macOS says "cannot be opened because the developer cannot be verified":
   - **Right-click → Open** → click **Open** in the dialog
   - OR: System Settings → Privacy & Security → scroll down → Open Anyway

This only needs to be done once.

---

## Requirements

- macOS 13 Ventura or later (Swift Charts requirement)
- Apple Silicon or Intel Mac

---

## Xcode project settings reference

| Setting | Value |
|---------|-------|
| Deployment Target | macOS 13.0 |
| Signing | Sign to Run Locally (no team) |
| Hardened Runtime | Enabled |
| App Sandbox | Enabled |
| Outgoing Connections (Client) | ✅ Required for CoinGecko API |
