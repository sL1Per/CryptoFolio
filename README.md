# CryptoFolio – SwiftUI App

A native iOS & macOS crypto portfolio tracker using the CoinGecko free API.

---

## Files
- `CryptoFolioApp.swift` – App entry point
- `Models.swift` – Data models (Coin, Holding, CoinPrice)
- `PortfolioViewModel.swift` – API calls, persistence, computed totals
- `ContentView.swift` – Main screen + portfolio card
- `HoldingRow.swift` – Individual holding row component
- `AddHoldingView.swift` – Sheet to add/update tokens

---

## Setup in Xcode (5 minutes)

1. **Create a new Xcode project**
   - Open Xcode → File → New → Project
   - Choose **Multiplatform > App**
   - Name it `CryptoFolio`
   - Interface: **SwiftUI**, Language: **Swift**
   - Click Next and save somewhere

2. **Replace the generated files**
   - Delete `ContentView.swift` from the project (Move to Trash)
   - Delete `[AppName]App.swift` from the project (Move to Trash)

3. **Add these files**
   - Drag all 6 `.swift` files from this folder into your Xcode project
   - When prompted: ✅ "Copy items if needed", ✅ Add to target

4. **Add Network permission** (for CoinGecko API)
   - Select your project in the navigator → Signing & Capabilities
   - The app uses standard URLSession – no special entitlements needed
   - Make sure "Outgoing Connections (Client)" is checked under App Sandbox (macOS)

5. **Run it**
   - Select iPhone simulator or your Mac as the target
   - Press ▶ (Cmd+R)

---

## Features
- Live prices from CoinGecko (free, no API key)
- Add/remove holdings with token amounts
- Total portfolio value + 24h change
- Per-coin: price, value, 24h % change badge
- Holdings persist across app launches (UserDefaults)
- Pull-to-refresh via the ↻ button
- Works on iPhone, iPad, and Mac (Designed for iPad / Mac Catalyst)

---

## Notes
- CoinGecko free API has a rate limit (~30 calls/min) — if you hit it, wait 60s
- To add coins not in the list, you can extend `Coin.popular` in `Models.swift` with any CoinGecko coin ID (find IDs at coingecko.com)
