import Foundation

// MARK: - Currency
enum Currency: String, CaseIterable, Codable {
    case usd = "usd"
    case eur = "eur"

    var code: String   { rawValue.uppercased() }
    var symbol: String { self == .usd ? "$" : "€" }
}

// MARK: - Chart time range
enum TimeRange: String, CaseIterable {
    case week      = "7D"
    case month     = "1M"
    case year      = "1Y"
    case fiveYears = "5Y"

    var days: Int {
        switch self {
        case .week:      return 7
        case .month:     return 30
        case .year:      return 365
        case .fiveYears: return 1825
        }
    }
}

// MARK: - Chart data point
struct PortfolioDataPoint: Identifiable {
    let id = UUID()
    let date: Date
    let value: Double
}

// MARK: - Coin
struct Coin: Identifiable, Codable, Hashable {
    let id: String
    let symbol: String
    let name: String
}

// MARK: - Exchange
struct Exchange: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let color: String
    let domain: String   // used to fetch favicon

    // Google favicon CDN — always up to date, no auth needed
    var logoURL: URL? {
        URL(string: "https://www.google.com/s2/favicons?domain=\(domain)&sz=64")
    }

    static let popular: [Exchange] = [
        Exchange(id: "coinbase",   name: "Coinbase",        color: "0052FF", domain: "coinbase.com"),
        Exchange(id: "binance",    name: "Binance",         color: "F0B90B", domain: "binance.com"),
        Exchange(id: "kraken",     name: "Kraken",          color: "5741D9", domain: "kraken.com"),
        Exchange(id: "bybit",      name: "Bybit",           color: "F7A600", domain: "bybit.com"),
        Exchange(id: "okx",        name: "OKX",             color: "BBBBBB", domain: "okx.com"),
        Exchange(id: "kucoin",     name: "KuCoin",          color: "00A3FF", domain: "kucoin.com"),
        Exchange(id: "gemini",     name: "Gemini",          color: "00DCFA", domain: "gemini.com"),
        Exchange(id: "bitfinex",   name: "Bitfinex",        color: "16B157", domain: "bitfinex.com"),
        Exchange(id: "bitstamp",   name: "Bitstamp",        color: "00A850", domain: "bitstamp.net"),
        Exchange(id: "crypto_com", name: "Crypto.com",      color: "1199FA", domain: "crypto.com"),
        Exchange(id: "wallet",     name: "Hardware Wallet", color: "FF6B35", domain: "ledger.com"),
        Exchange(id: "metamask",   name: "MetaMask",        color: "E8831D", domain: "metamask.io"),
        Exchange(id: "other",      name: "Other",           color: "666666", domain: ""),
    ]

    static func find(_ id: String) -> Exchange {
        popular.first { $0.id == id } ?? Exchange(id: id, name: id, color: "666666", domain: "")
    }
}

// MARK: - Holding
struct Holding: Identifiable, Codable {
    var id: UUID
    let coin: Coin
    var amount: Double
    var exchangeId: String

    init(coin: Coin, amount: Double, exchangeId: String) {
        self.id = UUID()
        self.coin = coin
        self.amount = amount
        self.exchangeId = exchangeId
    }

    var exchange: Exchange { Exchange.find(exchangeId) }
}

// MARK: - Aggregated holding (across exchanges)
struct AggregatedHolding: Identifiable {
    var id: String { coin.id }
    let coin: Coin
    var totalAmount: Double
    var breakdown: [(exchange: Exchange, amount: Double)]
}

// MARK: - CoinGecko price response
struct CoinPrice: Codable {
    let usd: Double?
    let eur: Double?
    let usdDailyChange: Double?
    let eurDailyChange: Double?

    enum CodingKeys: String, CodingKey {
        case usd
        case eur
        case usdDailyChange = "usd_24h_change"
        case eurDailyChange = "eur_24h_change"
    }
}

// MARK: - CoinGecko markets response (for image URLs)
struct CoinMarket: Codable {
    let id: String
    let image: String?
}

// MARK: - Sort + Group options
enum GroupMode: String, CaseIterable {
    case token    = "Token"
    case exchange = "Exchange"
    case all      = "All"
}

enum SortMode: String, CaseIterable {
    case value  = "Value"
    case name   = "Name"
    case change = "24h Change"
}

// MARK: - Popular coins
extension Coin {
    static let popular: [Coin] = [
        Coin(id: "bitcoin",       symbol: "BTC",   name: "Bitcoin"),
        Coin(id: "ethereum",      symbol: "ETH",   name: "Ethereum"),
        Coin(id: "solana",        symbol: "SOL",   name: "Solana"),
        Coin(id: "binancecoin",   symbol: "BNB",   name: "BNB"),
        Coin(id: "ripple",        symbol: "XRP",   name: "XRP"),
        Coin(id: "cardano",       symbol: "ADA",   name: "Cardano"),
        Coin(id: "dogecoin",      symbol: "DOGE",  name: "Dogecoin"),
        Coin(id: "polkadot",      symbol: "DOT",   name: "Polkadot"),
        Coin(id: "avalanche-2",   symbol: "AVAX",  name: "Avalanche"),
        Coin(id: "chainlink",     symbol: "LINK",  name: "Chainlink"),
        Coin(id: "matic-network", symbol: "MATIC", name: "Polygon"),
        Coin(id: "uniswap",       symbol: "UNI",   name: "Uniswap"),
        Coin(id: "litecoin",      symbol: "LTC",   name: "Litecoin"),
        Coin(id: "cosmos",        symbol: "ATOM",  name: "Cosmos"),
        Coin(id: "stellar",       symbol: "XLM",   name: "Stellar"),
        Coin(id: "monero",        symbol: "XMR",   name: "Monero"),
        Coin(id: "tron",          symbol: "TRX",   name: "TRON"),
        Coin(id: "the-sandbox",   symbol: "SAND",  name: "The Sandbox"),
        Coin(id: "decentraland",  symbol: "MANA",  name: "Decentraland"),
        Coin(id: "aave",          symbol: "AAVE",  name: "Aave"),
    ]
}
