import SwiftUI

struct ContentView: View {
    @EnvironmentObject var vm: PortfolioViewModel
    @Environment(\.openWindow) private var openWindow
    @Environment(\.theme) private var t

    @State private var showAddSheet  = false
    @State private var holdingToEdit: Holding? = nil
    @State private var showSettings  = false

    var body: some View {
        NavigationStack {
            ZStack {
                t.appBg.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {

                        TotalPortfolioCard(vm: vm, onOpenChart: {
                            openWindow(id: "chart", value: "main")
                            Task { await vm.fetchHistoricalData() }
                        })
                        .padding(.horizontal).padding(.top, 8)

                        if let err = vm.errorMessage {
                            ErrorBanner(message: err).padding(.horizontal)
                        }

                        if !vm.holdings.isEmpty {
                            ControlBar(vm: vm).padding(.horizontal)
                        }

                        switch vm.groupMode {
                        case .all:
                            FlatHoldingsView(vm: vm, onEdit: { holdingToEdit = $0 }).padding(.horizontal)
                        case .exchange:
                            ExchangeGroupedView(vm: vm, onEdit: { holdingToEdit = $0 }).padding(.horizontal)
                        case .token:
                            TokenGroupedView(vm: vm).padding(.horizontal)
                        }

                        creditsFooter.padding(.top, 12).padding(.bottom, 24)
                    }
                }
            }
            .navigationTitle("CRYPTOFOLIO")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            #endif
            .toolbar {
                ToolbarItem(placement: leadingPlacement) {
                    Button { Task { await vm.fetchPrices() } } label: {
                        Image(systemName: "arrow.clockwise")
                            .rotationEffect(.degrees(vm.isLoading ? 360 : 0))
                            .animation(vm.isLoading ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: vm.isLoading)
                    }
                    .tint(t.gold)
                }
                ToolbarItemGroup(placement: trailingPlacement) {
                    Button { showAddSheet = true  } label: { Image(systemName: "plus") }.tint(t.gold)
                    Button { showSettings = true  } label: { Image(systemName: "gearshape.fill") }.tint(t.gold)
                }
            }
            .sheet(isPresented: $showAddSheet) { AddHoldingView(vm: vm, existingHolding: nil) }
            .sheet(item: $holdingToEdit)        { AddHoldingView(vm: vm, existingHolding: $0) }
            .sheet(isPresented: $showSettings)  { SettingsView(vm: vm) }
        }
    }

    private var leadingPlacement: ToolbarItemPlacement {
        #if os(iOS)
        return .navigationBarLeading
        #else
        return .automatic
        #endif
    }

    private var trailingPlacement: ToolbarItemPlacement {
        #if os(iOS)
        return .navigationBarTrailing
        #else
        return .automatic
        #endif
    }

    private var creditsFooter: some View {
        Text("Made with ♥ by Pedro Viegas and Claude.ai — 2026")
            .font(.system(size: 10, design: .monospaced))
            .foregroundColor(t.textFaint)
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
    }
}

// MARK: - Total Portfolio Card
struct TotalPortfolioCard: View {
    @ObservedObject var vm: PortfolioViewModel
    let onOpenChart: () -> Void
    @Environment(\.theme) private var t

    var changeColor: Color { vm.totalChange24h >= 0 ? t.green : t.red }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text("TOTAL PORTFOLIO VALUE")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(t.textTertiary).tracking(3)
                Spacer()
                Text(vm.currency.code)
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundColor(t.gold.opacity(0.7))
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(Capsule().fill(t.goldDim).overlay(Capsule().stroke(t.goldBorder, lineWidth: 1)))
            }

            if vm.holdings.isEmpty {
                Text("—").font(.system(size: 42, weight: .bold, design: .monospaced)).foregroundColor(t.textPrimary)
            } else {
                Text(vm.format(vm.totalValue))
                    .font(.system(size: 38, weight: .bold, design: .monospaced))
                    .foregroundColor(t.textPrimary).minimumScaleFactor(0.6).lineLimit(1)

                if !vm.prices.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "triangle.fill")
                            .rotationEffect(.degrees(vm.totalChange24h >= 0 ? 0 : 180))
                            .font(.system(size: 9))
                        Text("\(vm.format(abs(vm.totalChange24h))) (24h)")
                            .font(.system(size: 13, weight: .medium, design: .monospaced))
                    }
                    .foregroundColor(changeColor)
                }
            }

            if let updated = vm.lastUpdated {
                Text("Updated \(updated, style: .time)")
                    .font(.system(size: 10, design: .monospaced)).foregroundColor(t.textFaint)
            }

            Button(action: onOpenChart) {
                HStack(spacing: 6) {
                    Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 11))
                    Text("VIEW PORTFOLIO CHART")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced)).tracking(1)
                }
                .foregroundColor(t.gold)
                .frame(maxWidth: .infinity).padding(.vertical, 9)
                .background(RoundedRectangle(cornerRadius: 9).fill(t.goldDim)
                    .overlay(RoundedRectangle(cornerRadius: 9).stroke(t.goldBorder, lineWidth: 1)))
            }
            .buttonStyle(.plain).padding(.top, 6)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 22).padding(.horizontal, 20)
        .background(RoundedRectangle(cornerRadius: 16).fill(t.goldCardBg)
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(t.goldCardBorder, lineWidth: 1)))
    }
}

// MARK: - Control Bar
struct ControlBar: View {
    @ObservedObject var vm: PortfolioViewModel
    @Environment(\.theme) private var t

    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 0) {
                ForEach(GroupMode.allCases, id: \.self) { mode in
                    Button { withAnimation(.easeInOut(duration: 0.2)) { vm.groupMode = mode } } label: {
                        Text(mode.rawValue)
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundColor(vm.groupMode == mode ? .black : t.textTertiary)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(vm.groupMode == mode ? t.gold : Color.clear)
                            .clipShape(RoundedRectangle(cornerRadius: 7))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(3)
            .background(RoundedRectangle(cornerRadius: 10).fill(t.cardBg)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(t.border, lineWidth: 1)))

            Spacer()

            Menu {
                ForEach(SortMode.allCases, id: \.self) { mode in
                    Button { vm.sortMode = mode } label: {
                        HStack { Text(mode.rawValue); if vm.sortMode == mode { Image(systemName: "checkmark") } }
                    }
                }
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "arrow.up.arrow.down").font(.system(size: 11))
                    Text(vm.sortMode.rawValue).font(.system(size: 11, weight: .medium, design: .monospaced))
                }
                .foregroundColor(t.textSecondary).padding(.horizontal, 12).padding(.vertical, 7)
                .background(RoundedRectangle(cornerRadius: 10).fill(t.cardBg)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(t.border, lineWidth: 1)))
            }
            .menuStyle(.borderlessButton)
        }
    }
}

// MARK: - Two-column grid layout
private let twoColumnGrid = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

// MARK: - Flat Holdings View (2-column grid)
struct FlatHoldingsView: View {
    @ObservedObject var vm: PortfolioViewModel
    let onEdit: (Holding) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("HOLDINGS", count: vm.holdings.count)
            if vm.holdings.isEmpty { EmptyPortfolioView() }
            else {
                LazyVGrid(columns: twoColumnGrid, spacing: 12) {
                    ForEach(vm.sortedHoldings) { h in
                        HoldingCard(holding: h, vm: vm, showExchangeBadge: true, onEdit: { onEdit(h) })
                            .contextMenu {
                                Button { onEdit(h) } label: { Label("Edit", systemImage: "pencil") }
                                Button(role: .destructive) { vm.remove(holding: h) } label: { Label("Remove", systemImage: "trash") }
                            }
                    }
                }
            }
        }
    }
}

// MARK: - Exchange Grouped View (2-column grid per exchange)
struct ExchangeGroupedView: View {
    @ObservedObject var vm: PortfolioViewModel
    let onEdit: (Holding) -> Void
    @Environment(\.theme) private var t

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            if vm.holdings.isEmpty { EmptyPortfolioView() }
            else {
                ForEach(vm.holdingsByExchange, id: \.exchange.id) { group in
                    VStack(alignment: .leading, spacing: 10) {
                        // Exchange header — full width
                        HStack {
                            ExchangeBadge(exchange: group.exchange, size: .medium)
                            Text(group.exchange.name.uppercased())
                                .font(.system(size: 11, weight: .bold, design: .monospaced))
                                .foregroundColor(t.textSecondary).tracking(1.5)
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(vm.format(group.totalValue))
                                    .font(.system(size: 13, weight: .bold, design: .monospaced)).foregroundColor(t.textPrimary)
                                Text("\(group.holdings.count) asset\(group.holdings.count == 1 ? "" : "s")")
                                    .font(.system(size: 10, design: .monospaced)).foregroundColor(t.textTertiary)
                            }
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: 10)
                            .fill(Color(hex: group.exchange.color).opacity(0.06))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: group.exchange.color).opacity(0.15), lineWidth: 1)))

                        // Holdings in 2-column grid
                        LazyVGrid(columns: twoColumnGrid, spacing: 12) {
                            ForEach(group.holdings) { h in
                                HoldingCard(holding: h, vm: vm, showExchangeBadge: false, onEdit: { onEdit(h) })
                                    .contextMenu {
                                        Button { onEdit(h) } label: { Label("Edit", systemImage: "pencil") }
                                        Button(role: .destructive) { vm.remove(holding: h) } label: { Label("Remove", systemImage: "trash") }
                                    }
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Token Grouped View (2-column grid, tap for breakdown sheet)
struct TokenGroupedView: View {
    @ObservedObject var vm: PortfolioViewModel
    @Environment(\.theme) private var t
    @State private var selectedAgg: AggregatedHolding? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("TOKENS", count: vm.holdingsByToken.count)
            if vm.holdings.isEmpty { EmptyPortfolioView() }
            else {
                LazyVGrid(columns: twoColumnGrid, spacing: 12) {
                    ForEach(vm.holdingsByToken) { agg in
                        TokenCard(agg: agg, vm: vm)
                            .onTapGesture { selectedAgg = agg }
                    }
                }
            }
        }
        .sheet(item: $selectedAgg) { agg in
            TokenBreakdownSheet(agg: agg, vm: vm)
        }
    }
}

// MARK: - Holding Card (compact 2-col card for Flat + Exchange views)
struct HoldingCard: View {
    let holding: Holding
    @ObservedObject var vm: PortfolioViewModel
    let showExchangeBadge: Bool
    let onEdit: () -> Void

    @Environment(\.theme) private var t
    @State private var isHovered = false

    private var value: Double?  { vm.price(for: holding.coin.id).map { $0 * holding.amount } }
    private var change: Double? { vm.dailyChange(for: holding.coin.id) }
    private var isPos: Bool     { (change ?? 0) >= 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Top: icon + change badge
            HStack(alignment: .top) {
                CoinImageView(coin: holding.coin, imageURL: vm.coinImages[holding.coin.id], size: 40)
                Spacer()
                if let c = change {
                    let color = isPos ? t.green : t.red
                    Text(c.asPercentChange)
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(color)
                        .padding(.horizontal, 6).padding(.vertical, 3)
                        .background(Capsule().fill(color.opacity(0.12)))
                }
            }
            .padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 10)

            // Middle: name + amount
            VStack(alignment: .leading, spacing: 2) {
                Text(holding.coin.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(t.textPrimary)
                    .lineLimit(1)
                Text(formatAmount(holding.amount) + " " + holding.coin.symbol)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(t.textTertiary)
            }
            .padding(.horizontal, 14)

            Spacer(minLength: 8)

            // Bottom: value + exchange badge
            HStack(alignment: .center) {
                if let v = value {
                    Text(vm.format(v))
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                        .foregroundColor(t.textPrimary)
                        .minimumScaleFactor(0.7).lineLimit(1)
                } else {
                    Text("—").font(.system(size: 14, weight: .bold, design: .monospaced)).foregroundColor(t.textFaint)
                }
                Spacer()
                if showExchangeBadge {
                    ExchangeBadge(exchange: holding.exchange, size: .small)
                }
            }
            .padding(.horizontal, 14).padding(.bottom, 14)
        }
        .frame(maxWidth: .infinity, minHeight: 130)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isHovered ? t.cardBgHover : t.rowBg)
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(isHovered ? t.borderHover : t.border, lineWidth: 1))
        )
        .animation(.easeInOut(duration: 0.15), value: isHovered)
        .onHover { isHovered = $0 }
        .contextMenu {
            Button { onEdit() } label: { Label("Edit", systemImage: "pencil") }
            Button(role: .destructive) { vm.remove(holding: holding) } label: { Label("Remove", systemImage: "trash") }
        }
    }
}

// MARK: - Token Card (2-col card for Token view)
struct TokenCard: View {
    let agg: AggregatedHolding
    @ObservedObject var vm: PortfolioViewModel

    @Environment(\.theme) private var t
    @State private var isHovered = false

    private var totalValue: Double { (vm.price(for: agg.coin.id) ?? 0) * agg.totalAmount }
    private var change: Double?    { vm.dailyChange(for: agg.coin.id) }
    private var isPos: Bool        { (change ?? 0) >= 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Top: icon + change badge
            HStack(alignment: .top) {
                CoinImageView(coin: agg.coin, imageURL: vm.coinImages[agg.coin.id], size: 40)
                Spacer()
                if let c = change {
                    let color = isPos ? t.green : t.red
                    Text(c.asPercentChange)
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(color)
                        .padding(.horizontal, 6).padding(.vertical, 3)
                        .background(Capsule().fill(color.opacity(0.12)))
                }
            }
            .padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 10)

            // Middle: name + amount
            VStack(alignment: .leading, spacing: 2) {
                Text(agg.coin.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(t.textPrimary)
                    .lineLimit(1)
                Text(formatAmount(agg.totalAmount) + " " + agg.coin.symbol)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(t.textTertiary)
            }
            .padding(.horizontal, 14)

            Spacer(minLength: 8)

            // Bottom: value + exchange count
            HStack(alignment: .center) {
                Text(vm.format(totalValue))
                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                    .foregroundColor(t.textPrimary)
                    .minimumScaleFactor(0.7).lineLimit(1)
                Spacer()
                if agg.breakdown.count > 1 {
                    Text("\(agg.breakdown.count) ex.")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(t.textFaint)
                        .padding(.horizontal, 5).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 4).fill(t.cardBg)
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(t.border, lineWidth: 1)))
                }
            }
            .padding(.horizontal, 14).padding(.bottom, 14)
        }
        .frame(maxWidth: .infinity, minHeight: 130)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isHovered ? t.cardBgHover : t.rowBg)
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(isHovered ? t.borderHover : t.border, lineWidth: 1))
        )
        .animation(.easeInOut(duration: 0.15), value: isHovered)
        .onHover { isHovered = $0 }
    }
}

// MARK: - Token Breakdown Sheet
struct TokenBreakdownSheet: View {
    let agg: AggregatedHolding
    @ObservedObject var vm: PortfolioViewModel

    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var t

    private var totalValue: Double { (vm.price(for: agg.coin.id) ?? 0) * agg.totalAmount }
    private var change: Double?    { vm.dailyChange(for: agg.coin.id) }
    private var isPos: Bool        { (change ?? 0) >= 0 }

    var body: some View {
        NavigationStack {
            ZStack {
                t.sheetBg.ignoresSafeArea()
                VStack(spacing: 0) {
                    // Header card
                    HStack(spacing: 16) {
                        CoinImageView(coin: agg.coin, imageURL: vm.coinImages[agg.coin.id], size: 56)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(agg.coin.name)
                                .font(.system(size: 18, weight: .bold)).foregroundColor(t.textPrimary)
                            Text(formatAmount(agg.totalAmount) + " " + agg.coin.symbol)
                                .font(.system(size: 12, design: .monospaced)).foregroundColor(t.textTertiary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 4) {
                            Text(vm.format(totalValue))
                                .font(.system(size: 18, weight: .bold, design: .monospaced)).foregroundColor(t.textPrimary)
                            if let c = change {
                                let color = isPos ? t.green : t.red
                                Text(c.asPercentChange)
                                    .font(.system(size: 11, weight: .semibold, design: .monospaced)).foregroundColor(color)
                                    .padding(.horizontal, 7).padding(.vertical, 3)
                                    .background(Capsule().fill(color.opacity(0.12)))
                            }
                        }
                    }
                    .padding(20)
                    .background(RoundedRectangle(cornerRadius: 14).fill(t.goldCardBg)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(t.goldCardBorder, lineWidth: 1)))
                    .padding()

                    // Per-exchange breakdown
                    VStack(alignment: .leading, spacing: 0) {
                        Text("BY EXCHANGE")
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundColor(t.textTertiary).tracking(3)
                            .padding(.horizontal).padding(.bottom, 10)

                        VStack(spacing: 0) {
                            ForEach(agg.breakdown.sorted { $0.amount > $1.amount }, id: \.exchange.id) { item in
                                let itemValue = (vm.price(for: agg.coin.id) ?? 0) * item.amount
                                HStack(spacing: 12) {
                                    ExchangeBadge(exchange: item.exchange, size: .medium)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.exchange.name)
                                            .font(.system(size: 13, weight: .medium)).foregroundColor(t.textPrimary)
                                        Text(formatAmount(item.amount) + " " + agg.coin.symbol)
                                            .font(.system(size: 11, design: .monospaced)).foregroundColor(t.textTertiary)
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 2) {
                                        Text(vm.format(itemValue))
                                            .font(.system(size: 13, weight: .bold, design: .monospaced)).foregroundColor(t.textPrimary)
                                        // % of total
                                        let pct = totalValue > 0 ? item.amount / agg.totalAmount * 100 : 0
                                        Text(String(format: "%.1f%%", pct))
                                            .font(.system(size: 10, design: .monospaced)).foregroundColor(t.textTertiary)
                                    }
                                }
                                .padding(.horizontal, 16).padding(.vertical, 14)
                                if item.exchange.id != agg.breakdown.sorted(by: { $0.amount > $1.amount }).last?.exchange.id {
                                    Divider().background(t.subtleBorder).padding(.leading, 56)
                                }
                            }
                        }
                        .background(RoundedRectangle(cornerRadius: 14).fill(t.rowBg)
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(t.border, lineWidth: 1)))
                        .padding(.horizontal)
                    }

                    Spacer()
                }
                .padding(.top, 8)
            }
            .navigationTitle(agg.coin.name)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: {
                    #if os(iOS)
                    return ToolbarItemPlacement.navigationBarTrailing
                    #else
                    return ToolbarItemPlacement.automatic
                    #endif
                }()) {
                    Button("Done") { dismiss() }
                        .foregroundColor(t.gold).fontWeight(.semibold)
                }
            }
        }
    }
}

// MARK: - Empty State
struct EmptyPortfolioView: View {
    @Environment(\.theme) private var t
    var body: some View {
        VStack(spacing: 10) {
            Text("◈").font(.system(size: 44)).foregroundColor(t.textFaint)
            Text("No assets yet").font(.system(size: 14, design: .monospaced)).foregroundColor(t.textTertiary)
            Text("Click + to add your first token").font(.system(size: 11, design: .monospaced)).foregroundColor(t.textFaint)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 60)
    }
}

// MARK: - Error Banner
struct ErrorBanner: View {
    let message: String
    @Environment(\.theme) private var t
    var body: some View {
        HStack {
            Image(systemName: "exclamationmark.triangle")
            Text(message).font(.system(size: 12, design: .monospaced))
        }
        .foregroundColor(t.red).padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(t.red.opacity(0.08))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(t.red.opacity(0.2), lineWidth: 1)))
    }
}

// MARK: - Shared helpers
private func sectionHeader(_ title: String, count: Int) -> some View {
    _SectionHeader(title: title, count: count)
}

private struct _SectionHeader: View {
    let title: String; let count: Int
    @Environment(\.theme) private var t
    var body: some View {
        HStack {
            Text(title).font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(t.textTertiary).tracking(3)
            Text("\(count)").font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(t.gold.opacity(0.7))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Capsule().fill(t.goldDim))
        }
    }
}

private func formatAmount(_ v: Double) -> String {
    v == v.rounded() && v < 1_000_000 ? String(format: "%.0f", v) : String(format: "%g", v)
}
