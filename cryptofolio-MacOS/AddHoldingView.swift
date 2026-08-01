import SwiftUI

struct AddHoldingView: View {
    @ObservedObject var vm: PortfolioViewModel
    let existingHolding: Holding?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var t

    @State private var searchText = ""
    @State private var selectedCoin: Coin? = nil
    @State private var amountText = ""
    @State private var selectedExchangeId: String = Exchange.popular[0].id
    @State private var customExchangeName = ""
    @State private var showCustomExchange = false
    @FocusState private var amountFocused: Bool

    private var isEditing: Bool { existingHolding != nil }

    private var filteredCoins: [Coin] {
        if searchText.isEmpty { return Coin.popular }
        let q = searchText.lowercased()
        return Coin.popular.filter { $0.name.lowercased().contains(q) || $0.symbol.lowercased().contains(q) }
    }

    private var canSave: Bool {
        guard selectedCoin != nil, let amt = Double(amountText), amt > 0 else { return false }
        if showCustomExchange { return !customExchangeName.trimmingCharacters(in: .whitespaces).isEmpty }
        return true
    }

    private var effectiveExchangeId: String {
        showCustomExchange
            ? customExchangeName.trimmingCharacters(in: .whitespaces).lowercased().replacingOccurrences(of: " ", with: "_")
            : selectedExchangeId
    }

    var body: some View {
        NavigationStack {
            ZStack {
                t.sheetBg.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 0) {
                        coinSection.padding(.horizontal).padding(.top, 20)
                        if !isEditing && !filteredCoins.isEmpty {
                            coinDropdown.padding(.horizontal).padding(.top, 6)
                        }
                        exchangeSection.padding(.horizontal).padding(.top, 20)
                        amountSection.padding(.horizontal).padding(.top, 20)
                        if let coin = selectedCoin, let amount = Double(amountText), amount > 0 {
                            HoldingPreview(coin: coin, amount: amount, vm: vm).padding(.horizontal).padding(.top, 16)
                        }
                        saveButton.padding(.horizontal).padding(.top, 28).padding(.bottom, 32)
                    }
                }
            }
            .navigationTitle(isEditing ? "Edit \(existingHolding?.coin.name ?? "")" : "Add Token")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            #endif
            .toolbar {
                ToolbarItem(placement: cancelPlacement) {
                    Button("Cancel") { dismiss() }.foregroundColor(t.gold)
                }
            }
            .onAppear {
                if let h = existingHolding {
                    selectedCoin = h.coin; amountText = fmt(h.amount)
                    selectedExchangeId = h.exchangeId; searchText = h.coin.name
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { amountFocused = true }
                }
            }
        }
    }

    // MARK: - Sections

    private var coinSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("COIN")
            if isEditing { lockedCoinRow } else { coinSearchField }
        }
    }

    private var exchangeSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("EXCHANGE")
            if isEditing { lockedExchangeRow } else { exchangeSelector }
        }
    }

    private var amountSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("AMOUNT OF TOKENS")
            HStack {
                TextField("e.g. 0.5", text: $amountText)
                    #if os(iOS)
                    .keyboardType(.decimalPad)
                    #endif
                    .focused($amountFocused)
                    .foregroundColor(t.textPrimary)
                    .font(.system(size: 14, design: .monospaced))
                if isEditing, let current = existingHolding?.amount {
                    HStack(spacing: 6) {
                        quickBtn("½") { amountText = fmt(current / 2) }
                        quickBtn("2×") { amountText = fmt(current * 2) }
                    }
                }
            }
            .padding(12).background(fieldBg)

            if isEditing,
               let current = existingHolding?.amount,
               let newAmt = Double(amountText), newAmt != current {
                HStack(spacing: 6) {
                    Text("Current: \(fmt(current))").foregroundColor(t.textTertiary)
                    Image(systemName: "arrow.right").foregroundColor(t.textFaint)
                    Text("New: \(fmt(newAmt))").foregroundColor(t.gold)
                }
                .font(.system(size: 11, design: .monospaced)).padding(.horizontal, 4)
            }
        }
    }

    private var saveButton: some View {
        Button {
            guard let coin = selectedCoin, let amount = Double(amountText) else { return }
            if isEditing, let existing = existingHolding {
                vm.update(holding: existing, amount: amount, exchangeId: effectiveExchangeId)
            } else {
                vm.addHolding(coin: coin, amount: amount, exchangeId: effectiveExchangeId)
            }
            dismiss()
        } label: {
            Text(isEditing ? "SAVE CHANGES" : "ADD TO PORTFOLIO")
                .font(.system(size: 12, weight: .bold, design: .monospaced)).tracking(2)
                .foregroundColor(.black)
                .frame(maxWidth: .infinity).padding(.vertical, 16)
                .background(LinearGradient(
                    colors: canSave ? [t.gold, Color(hex: "ff9d00")] : [t.textFaint, t.textFaint],
                    startPoint: .leading, endPoint: .trailing))
                .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .disabled(!canSave)
    }

    // MARK: - Subviews

    private var lockedCoinRow: some View {
        HStack(spacing: 12) {
            if let coin = selectedCoin {
                CoinImageView(coin: coin, imageURL: vm.coinImages[coin.id], size: 32)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(selectedCoin?.name ?? "").font(.system(size: 14)).foregroundColor(t.textPrimary)
                Text(selectedCoin?.symbol ?? "").font(.system(size: 11, design: .monospaced)).foregroundColor(t.textTertiary)
            }
            Spacer()
            Image(systemName: "lock.fill").font(.system(size: 11)).foregroundColor(t.textTertiary)
        }
        .padding(12).background(lockedBg)
    }

    private var lockedExchangeRow: some View {
        HStack(spacing: 10) {
            ExchangeBadge(exchange: Exchange.find(selectedExchangeId), size: .medium)
            Text(Exchange.find(selectedExchangeId).name).font(.system(size: 14)).foregroundColor(t.textPrimary)
            Spacer()
            Image(systemName: "lock.fill").font(.system(size: 11)).foregroundColor(t.textTertiary)
        }
        .padding(12).background(lockedBg)
    }

    private var coinSearchField: some View {
        HStack {
            Image(systemName: "magnifyingglass").foregroundColor(t.textTertiary).font(.system(size: 14))
            TextField("Search Bitcoin, ETH, SOL...", text: $searchText)
                .foregroundColor(t.textPrimary).font(.system(size: 14, design: .monospaced))
                .autocorrectionDisabled()
                .onChange(of: searchText) { selectedCoin = nil }
        }
        .padding(12).background(fieldBg)
    }

    private var coinDropdown: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(filteredCoins.prefix(8)) { coin in
                    CoinOptionRow(coin: coin, isSelected: selectedCoin?.id == coin.id, imageURL: vm.coinImages[coin.id])
                        .onTapGesture { selectedCoin = coin; searchText = coin.name; amountFocused = true }
                    Divider().background(t.subtleBorder)
                }
            }
        }
        .frame(maxHeight: 220)
        .background(RoundedRectangle(cornerRadius: 12).fill(t.dropdownBg)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(t.border, lineWidth: 1)))
    }

    private var exchangeSelector: some View {
        VStack(spacing: 8) {
            let columns = [GridItem(.adaptive(minimum: 110))]
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(Exchange.popular) { exchange in
                    let isSelected = !showCustomExchange && selectedExchangeId == exchange.id
                    Button {
                        if exchange.id == "other" { showCustomExchange = true }
                        else { showCustomExchange = false; selectedExchangeId = exchange.id }
                    } label: {
                        HStack(spacing: 8) {
                            ExchangeBadge(exchange: exchange, size: .small)
                            Text(exchange.name).font(.system(size: 11, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .foregroundColor(isSelected ? .black : t.textSecondary)
                        .padding(.horizontal, 10).padding(.vertical, 9).frame(maxWidth: .infinity)
                        .background(RoundedRectangle(cornerRadius: 8)
                            .fill(isSelected ? Color(hex: exchange.color) : t.fieldBg)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(isSelected ? Color.clear : t.fieldBorder, lineWidth: 1)))
                    }
                    .buttonStyle(.plain)
                }
            }
            if showCustomExchange {
                HStack {
                    Image(systemName: "building.columns").foregroundColor(t.textTertiary).font(.system(size: 13))
                    TextField("Exchange name...", text: $customExchangeName)
                        .foregroundColor(t.textPrimary).font(.system(size: 14, design: .monospaced)).autocorrectionDisabled()
                }
                .padding(12).background(fieldBg)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }

    // MARK: - Helpers

    private func sectionLabel(_ text: String) -> some View {
        Text(text).font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundColor(t.textTertiary).tracking(2)
    }

    private func quickBtn(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(.system(size: 11, weight: .bold, design: .monospaced)).foregroundColor(t.gold)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(RoundedRectangle(cornerRadius: 6).fill(t.goldDim)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(t.goldBorder, lineWidth: 1)))
        }
        .buttonStyle(.plain)
    }

    private var fieldBg: some View {
        RoundedRectangle(cornerRadius: 10).fill(t.fieldBg)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(t.fieldBorder, lineWidth: 1))
    }

    private var lockedBg: some View {
        RoundedRectangle(cornerRadius: 10).fill(t.lockedFieldBg)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(t.subtleBorder, lineWidth: 1))
    }

    private var cancelPlacement: ToolbarItemPlacement {
        #if os(iOS)
        .navigationBarLeading
        #else
        .automatic
        #endif
    }

    private func fmt(_ v: Double) -> String {
        v == v.rounded() && v < 1_000_000 ? String(format: "%.0f", v) : String(format: "%g", v)
    }
}

// MARK: - Coin Option Row
struct CoinOptionRow: View {
    let coin: Coin
    let isSelected: Bool
    let imageURL: String?
    @Environment(\.theme) private var t

    var body: some View {
        HStack(spacing: 12) {
            CoinImageView(coin: coin, imageURL: imageURL, size: 30)
            VStack(alignment: .leading, spacing: 1) {
                Text(coin.name).font(.system(size: 13)).foregroundColor(t.textPrimary)
                Text(coin.symbol).font(.system(size: 10, design: .monospaced)).foregroundColor(t.textTertiary)
            }
            Spacer()
            if isSelected {
                Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundColor(t.gold)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(isSelected ? t.goldDim : Color.clear)
        .contentShape(Rectangle())
    }
}

// MARK: - Holding Preview
struct HoldingPreview: View {
    let coin: Coin
    let amount: Double
    @ObservedObject var vm: PortfolioViewModel
    @Environment(\.theme) private var t

    private var coinPrice: Double? { vm.price(for: coin.id) }
    private var value: Double?     { coinPrice.map { $0 * amount } }

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text("ESTIMATED VALUE").font(.system(size: 9, design: .monospaced)).foregroundColor(t.textTertiary).tracking(2)
                if let v = value {
                    Text(vm.format(v)).font(.system(size: 18, weight: .bold, design: .monospaced)).foregroundColor(t.textPrimary)
                } else {
                    Text("Price not loaded yet").font(.system(size: 13, design: .monospaced)).foregroundColor(t.textTertiary)
                }
            }
            Spacer()
            if let p = coinPrice {
                VStack(alignment: .trailing, spacing: 3) {
                    Text("PER TOKEN").font(.system(size: 9, design: .monospaced)).foregroundColor(t.textTertiary).tracking(2)
                    Text(vm.format(p)).font(.system(size: 14, design: .monospaced)).foregroundColor(t.textSecondary)
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 12).fill(t.goldCardBg)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(t.goldCardBorder, lineWidth: 1)))
    }
}
