import Foundation
import SwiftUI
import Combine

// MARK: - Appearance Mode
enum AppearanceMode: String, CaseIterable {
    case system = "system"
    case dark   = "dark"
    case light  = "light"

    var label: String {
        switch self {
        case .system: return "System"
        case .dark:   return "Dark"
        case .light:  return "Light"
        }
    }

    var icon: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .dark:   return "moon.fill"
        case .light:  return "sun.max.fill"
        }
    }
}

// MARK: - Chart cache entry
private struct ChartCacheEntry: Codable {
    let coinId: String
    let currency: String
    let range: String
    let fetchedAt: Date
    let points: [(ts: Double, price: Double)]

    // Encode/decode the tuples manually
    enum CodingKeys: String, CodingKey { case coinId, currency, range, fetchedAt, tsList, priceList }

    init(coinId: String, currency: String, range: String, fetchedAt: Date, points: [(ts: Double, price: Double)]) {
        self.coinId = coinId; self.currency = currency; self.range = range
        self.fetchedAt = fetchedAt; self.points = points
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        coinId    = try c.decode(String.self,  forKey: .coinId)
        currency  = try c.decode(String.self,  forKey: .currency)
        range     = try c.decode(String.self,  forKey: .range)
        fetchedAt = try c.decode(Date.self,    forKey: .fetchedAt)
        let ts    = try c.decode([Double].self, forKey: .tsList)
        let pr    = try c.decode([Double].self, forKey: .priceList)
        points    = zip(ts, pr).map { ($0, $1) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(coinId,    forKey: .coinId)
        try c.encode(currency,  forKey: .currency)
        try c.encode(range,     forKey: .range)
        try c.encode(fetchedAt, forKey: .fetchedAt)
        try c.encode(points.map(\.ts),    forKey: .tsList)
        try c.encode(points.map(\.price), forKey: .priceList)
    }
}

@MainActor
class PortfolioViewModel: ObservableObject {

    // MARK: - Published state
    @Published var holdings: [Holding] = []
    @Published var prices: [String: CoinPrice] = [:]
    @Published var coinImages: [String: String] = [:]
    @Published var isLoading = false
    @Published var lastUpdated: Date? = nil
    @Published var errorMessage: String? = nil
    @Published var groupMode: GroupMode = .token
    @Published var sortMode: SortMode = .value
    @Published var currency: Currency = .usd
    @Published var selectedTimeRange: TimeRange = .week
    @Published var historicalData: [PortfolioDataPoint] = []
    @Published var isLoadingChart = false
    @Published var chartError: String? = nil
    @Published var chartLoadingStatus: String = ""   // e.g. "Fetching BTC…"
    @Published var chartCachedAt: Date? = nil           // date of oldest cache entry shown
    @Published var chartIsStale: Bool = false            // true when showing stale/partial cache

    // MARK: - In-memory chart cache: key = "coinId|currency|range"
    private var chartCache: [String: ChartCacheEntry] = [:]
    private let chartCacheKey = "cryptofolio_chartcache_v1"

    // MARK: - Cache TTL per range
    private func cacheTTL(for range: TimeRange) -> TimeInterval {
        switch range {
        case .week:      return 10 * 60        //  10 minutes
        case .month:     return 60 * 60        //   1 hour
        case .year:      return 6 * 60 * 60    //   6 hours
        case .fiveYears: return 24 * 60 * 60   //  24 hours
        }
    }

    private func cacheKey(coinId: String, currency: Currency, range: TimeRange) -> String {
        "\(coinId)|\(currency.rawValue)|\(range.rawValue)"
    }

    private func isCacheValid(_ entry: ChartCacheEntry, range: TimeRange) -> Bool {
        Date().timeIntervalSince(entry.fetchedAt) < cacheTTL(for: range)
    }

    // MARK: - Currency helpers
    func price(for coinId: String) -> Double? {
        switch currency {
        case .usd: return prices[coinId]?.usd
        case .eur: return prices[coinId]?.eur
        }
    }

    func dailyChange(for coinId: String) -> Double? {
        switch currency {
        case .usd: return prices[coinId]?.usdDailyChange
        case .eur: return prices[coinId]?.eurDailyChange
        }
    }

    func format(_ value: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = currency.code
        f.maximumFractionDigits = value < 1 ? 6 : 2
        return f.string(from: NSNumber(value: value)) ?? "\(currency.symbol)0.00"
    }

    func setCurrency(_ c: Currency) {
        currency = c
        UserDefaults.standard.set(c.rawValue, forKey: "cryptofolio_currency")
        Task { await fetchPrices() }
        Task { await fetchHistoricalData() }
    }

    // MARK: - Computed totals
    var totalValue: Double {
        holdings.reduce(0) { $0 + (price(for: $1.coin.id) ?? 0) * $1.amount }
    }

    var totalChange24h: Double {
        holdings.reduce(0) {
            let p = price(for: $1.coin.id) ?? 0
            let c = dailyChange(for: $1.coin.id) ?? 0
            return $0 + p * $1.amount * c / 100
        }
    }

    // MARK: - Sorted flat list
    var sortedHoldings: [Holding] {
        holdings.sorted { a, b in
            switch sortMode {
            case .value:  return (price(for: a.coin.id) ?? 0) * a.amount > (price(for: b.coin.id) ?? 0) * b.amount
            case .name:   return a.coin.name < b.coin.name
            case .change: return (dailyChange(for: a.coin.id) ?? 0) > (dailyChange(for: b.coin.id) ?? 0)
            }
        }
    }

    // MARK: - Grouped by exchange
    var holdingsByExchange: [(exchange: Exchange, holdings: [Holding], totalValue: Double)] {
        let ids = Array(Set(holdings.map(\.exchangeId)))
        return ids.map { exId in
            let group = sortedHoldings.filter { $0.exchangeId == exId }
            let total = group.reduce(0.0) { $0 + (price(for: $1.coin.id) ?? 0) * $1.amount }
            return (Exchange.find(exId), group, total)
        }
        .sorted { $0.totalValue > $1.totalValue }
    }

    // MARK: - Aggregated by token
    var holdingsByToken: [AggregatedHolding] {
        var map: [String: AggregatedHolding] = [:]
        for h in holdings {
            if var agg = map[h.coin.id] {
                agg.totalAmount += h.amount
                agg.breakdown.append((exchange: h.exchange, amount: h.amount))
                map[h.coin.id] = agg
            } else {
                map[h.coin.id] = AggregatedHolding(coin: h.coin, totalAmount: h.amount, breakdown: [(h.exchange, h.amount)])
            }
        }
        return map.values.sorted { a, b in
            switch sortMode {
            case .value:  return (price(for: a.coin.id) ?? 0) * a.totalAmount > (price(for: b.coin.id) ?? 0) * b.totalAmount
            case .name:   return a.coin.name < b.coin.name
            case .change: return (dailyChange(for: a.coin.id) ?? 0) > (dailyChange(for: b.coin.id) ?? 0)
            }
        }
    }

    // MARK: - Init
    init() {
        if let saved = UserDefaults.standard.string(forKey: "cryptofolio_currency"),
           let c = Currency(rawValue: saved) { currency = c }
        loadHoldings()
        loadChartCache()
        Task { await fetchPrices() }
    }

    // MARK: - Portfolio management
    func addHolding(coin: Coin, amount: Double, exchangeId: String) {
        holdings.append(Holding(coin: coin, amount: amount, exchangeId: exchangeId))
        saveHoldings()
        Task { await fetchPrices() }
    }

    func update(holding: Holding, amount: Double, exchangeId: String) {
        guard let idx = holdings.firstIndex(where: { $0.id == holding.id }) else { return }
        holdings[idx].amount = amount
        holdings[idx].exchangeId = exchangeId
        saveHoldings()
    }

    func remove(holding: Holding) {
        holdings.removeAll { $0.id == holding.id }
        saveHoldings()
    }

    func remove(at offsets: IndexSet) {
        holdings.remove(atOffsets: offsets)
        saveHoldings()
    }

    // MARK: - Current prices + images
    func fetchPrices() async {
        guard !holdings.isEmpty else { return }
        isLoading = true
        errorMessage = nil

        let ids = Array(Set(holdings.map { $0.coin.id })).joined(separator: ",")
        let urlStr = "https://api.coingecko.com/api/v3/simple/price?ids=\(ids)&vs_currencies=usd,eur&include_24hr_change=true"

        if let url = URL(string: urlStr) {
            do {
                let (data, response) = try await URLSession.shared.data(from: url)
                if let http = response as? HTTPURLResponse, http.statusCode == 429 {
                    errorMessage = "Rate limited – wait a moment and try again"
                } else {
                    prices = try JSONDecoder().decode([String: CoinPrice].self, from: data)
                    lastUpdated = Date()
                }
            } catch {
                errorMessage = "Failed to fetch prices: \(error.localizedDescription)"
            }
        }

        await fetchCoinImages(ids: ids)
        isLoading = false
    }

    func fetchCoinImages(ids: String) async {
        let needed = ids.split(separator: ",").map(String.init).filter { coinImages[$0] == nil }
        guard !needed.isEmpty else { return }
        let urlStr = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=\(needed.joined(separator: ","))&per_page=250&sparkline=false"
        guard let url = URL(string: urlStr) else { return }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let markets = try JSONDecoder().decode([CoinMarket].self, from: data)
            for m in markets { if let img = m.image { coinImages[m.id] = img } }
        } catch {}
    }

    // MARK: - Historical chart data
    // Rule: ALWAYS show cached data. Never blank the chart. Errors only shown when nothing cached.
    func fetchHistoricalData(forceRefresh: Bool = false) async {
        guard !holdings.isEmpty else { historicalData = []; return }

        let range     = selectedTimeRange
        let cur       = currency
        let uniqueIds = Array(Set(holdings.map { $0.coin.id }))

        // Step 1: Always render whatever is in cache immediately (stale or not)
        let cachedHistories = buildHistoriesFromCache(coinIds: uniqueIds, currency: cur, range: range)
        if !cachedHistories.isEmpty {
            historicalData = buildPortfolioDataPoints(coinHistories: cachedHistories)
            // Show oldest cache date so user knows how fresh the data is
            chartCachedAt = cachedHistories.keys
                .compactMap { chartCache[cacheKey(coinId: $0, currency: cur, range: range)]?.fetchedAt }
                .min()
            chartIsStale = uniqueIds.contains { coinId in
                let key = cacheKey(coinId: coinId, currency: cur, range: range)
                guard let entry = chartCache[key] else { return true }
                return !isCacheValid(entry, range: range)
            }
            // Clear any previous hard error — we have data to show
            chartError = nil
        }

        // Step 2: Determine which coins need fetching
        let staleIds = uniqueIds.filter { coinId in
            let key = cacheKey(coinId: coinId, currency: cur, range: range)
            guard let entry = chartCache[key] else { return true }
            return forceRefresh || !isCacheValid(entry, range: range)
        }

        guard !staleIds.isEmpty else {
            isLoadingChart = false
            chartLoadingStatus = ""
            chartIsStale = false
            return
        }

        isLoadingChart = true
        // Don't clear chartError here — only set it if we end up with NO data at all

        var fetchedHistories = cachedHistories  // accumulate on top of cache

        for (index, coinId) in staleIds.enumerated() {
            let displayId = coinId.uppercased()
                .replacingOccurrences(of: "-2", with: "")
                .replacingOccurrences(of: "-NETWORK", with: "")
            chartLoadingStatus = "Updating \(displayId)… (\(index + 1)/\(staleIds.count))"

            if index > 0 {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }

            let result = await fetchSingleCoinHistory(coinId: coinId, currency: cur, range: range)

            switch result {
            case .success(let points):
                let entry = ChartCacheEntry(coinId: coinId, currency: cur.rawValue,
                                            range: range.rawValue, fetchedAt: Date(), points: points)
                chartCache[cacheKey(coinId: coinId, currency: cur, range: range)] = entry
                saveChartCache()
                fetchedHistories[coinId] = points
                historicalData = buildPortfolioDataPoints(coinHistories: fetchedHistories)
                // Update cache timestamp after each success
                chartCachedAt = fetchedHistories.keys
                    .compactMap { chartCache[cacheKey(coinId: $0, currency: cur, range: range)]?.fetchedAt }
                    .min()

            case .rateLimited:
                chartLoadingStatus = "Rate limited — waiting 15s to retry…"
                try? await Task.sleep(nanoseconds: 15_000_000_000)

                let retry = await fetchSingleCoinHistory(coinId: coinId, currency: cur, range: range)
                if case .success(let points) = retry {
                    let entry = ChartCacheEntry(coinId: coinId, currency: cur.rawValue,
                                                range: range.rawValue, fetchedAt: Date(), points: points)
                    chartCache[cacheKey(coinId: coinId, currency: cur, range: range)] = entry
                    saveChartCache()
                    fetchedHistories[coinId] = points
                    historicalData = buildPortfolioDataPoints(coinHistories: fetchedHistories)
                } else {
                    // Rate limited twice — stop fetching, keep showing what we have
                    chartLoadingStatus = ""
                    // Only show error banner if we have NOTHING to display
                    if historicalData.isEmpty {
                        chartError = "Rate limited. Try again in a minute."
                    }
                    break
                }

            case .failure(let msg):
                print("Chart fetch failed for \(coinId): \(msg)")
                if historicalData.isEmpty {
                    chartError = "Could not load chart data."
                }
            }
        }

        isLoadingChart = false
        chartLoadingStatus = ""
        // Recompute staleness after all fetches complete
        chartIsStale = uniqueIds.contains { coinId in
            let key = cacheKey(coinId: coinId, currency: cur, range: range)
            guard let entry = chartCache[key] else { return true }
            return !isCacheValid(entry, range: range)
        }
    }

    // MARK: - Single coin fetch result
    private enum FetchResult {
        case success([(ts: Double, price: Double)])
        case rateLimited
        case failure(String)
    }

    private func fetchSingleCoinHistory(coinId: String, currency: Currency, range: TimeRange) async -> FetchResult {
        let urlStr = "https://api.coingecko.com/api/v3/coins/\(coinId)/market_chart?vs_currency=\(currency.rawValue)&days=\(range.days)&precision=2"
        guard let url = URL(string: urlStr) else { return .failure("Bad URL") }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            if let http = response as? HTTPURLResponse {
                if http.statusCode == 429 { return .rateLimited }
                if http.statusCode != 200 { return .failure("HTTP \(http.statusCode)") }
            }
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let arr  = json["prices"] as? [[Double]] else {
                return .failure("Parse error")
            }
            return .success(arr.map { ($0[0], $0[1]) })
        } catch {
            return .failure(error.localizedDescription)
        }
    }

    // MARK: - Build histories dict from cache (always returns whatever exists, ignores TTL)
    private func buildHistoriesFromCache(coinIds: [String], currency: Currency, range: TimeRange) -> [String: [(ts: Double, price: Double)]] {
        var result: [String: [(ts: Double, price: Double)]] = [:]
        for id in coinIds {
            let key = cacheKey(coinId: id, currency: currency, range: range)
            if let entry = chartCache[key] {
                result[id] = entry.points
            }
        }
        return result
    }

    // MARK: - Build portfolio data points from coin histories
    private func buildPortfolioDataPoints(coinHistories: [String: [(ts: Double, price: Double)]]) -> [PortfolioDataPoint] {
        guard !coinHistories.isEmpty else { return [] }

        let refTimestamps = (coinHistories.values.max(by: { $0.count < $1.count }) ?? []).map(\.ts)
        guard !refTimestamps.isEmpty else { return [] }

        var lookups: [String: [Double: Double]] = [:]
        for (id, hist) in coinHistories {
            lookups[id] = Dictionary(uniqueKeysWithValues: hist.map { ($0.ts, $0.price) })
        }

        var coinTotals: [String: Double] = [:]
        for h in holdings { coinTotals[h.coin.id, default: 0] += h.amount }

        // Only use coins we actually have history for
        let availableIds = Set(coinHistories.keys)

        return refTimestamps.compactMap { ts -> PortfolioDataPoint? in
            var total = 0.0
            var hasAny = false
            for (id, amount) in coinTotals where availableIds.contains(id) {
                guard let lk = lookups[id] else { continue }
                let price: Double
                if let exact = lk[ts] {
                    price = exact
                } else if let closest = lk.keys.min(by: { abs($0 - ts) < abs($1 - ts) }),
                          let p = lk[closest] {
                    price = p
                } else { continue }
                total += price * amount
                hasAny = true
            }
            guard hasAny else { return nil }
            return PortfolioDataPoint(date: Date(timeIntervalSince1970: ts / 1000), value: total)
        }
        .sorted { $0.date < $1.date }
    }

    // MARK: - Holdings persistence
    private let holdingsKey = "cryptofolio_holdings_v2"

    private func saveHoldings() {
        if let data = try? JSONEncoder().encode(holdings) {
            UserDefaults.standard.set(data, forKey: holdingsKey)
        }
    }

    private func loadHoldings() {
        guard let data   = UserDefaults.standard.data(forKey: holdingsKey),
              let decoded = try? JSONDecoder().decode([Holding].self, from: data) else { return }
        holdings = decoded
    }

    // MARK: - Chart cache persistence
    private func saveChartCache() {
        let entries = Array(chartCache.values)
        if let data = try? JSONEncoder().encode(entries) {
            UserDefaults.standard.set(data, forKey: chartCacheKey)
        }
    }

    private func loadChartCache() {
        guard let data    = UserDefaults.standard.data(forKey: chartCacheKey),
              let entries = try? JSONDecoder().decode([ChartCacheEntry].self, from: data) else { return }
        for entry in entries {
            let key = "\(entry.coinId)|\(entry.currency)|\(entry.range)"
            chartCache[key] = entry
        }
        // Pre-populate historicalData from cache if holdings are ready
        if !holdings.isEmpty {
            let ids = Array(Set(holdings.map { $0.coin.id }))
            let histories = buildHistoriesFromCache(coinIds: ids, currency: currency, range: selectedTimeRange)
            if !histories.isEmpty {
                historicalData = buildPortfolioDataPoints(coinHistories: histories)
            }
        }
    }
}

// MARK: - Formatters
extension Double {
    var asPercentChange: String {
        "\(self >= 0 ? "+" : "")\(String(format: "%.2f", self))%"
    }
}
