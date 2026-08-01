import SwiftUI

struct HoldingRow: View {
    let holding: Holding
    @ObservedObject var vm: PortfolioViewModel
    let showExchangeBadge: Bool
    let onEdit: () -> Void

    @Environment(\.theme) private var t
    @State private var isHovered = false

    private var priceValue: Double?   { vm.price(for: holding.coin.id) }
    private var holdingValue: Double? { priceValue.map { $0 * holding.amount } }
    private var change: Double?       { vm.dailyChange(for: holding.coin.id) }
    private var isPositive: Bool      { (change ?? 0) >= 0 }

    var body: some View {
        HStack(spacing: 14) {

            CoinImageView(coin: holding.coin, imageURL: vm.coinImages[holding.coin.id], size: 46)

            VStack(alignment: .leading, spacing: 3) {
                Text(holding.coin.name)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(t.textPrimary)
                HStack(spacing: 5) {
                    Text("\(formatAmount(holding.amount)) tokens")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(t.textTertiary)
                    if showExchangeBadge {
                        Text("·").foregroundColor(t.textFaint).font(.system(size: 11))
                        ExchangeBadge(exchange: holding.exchange, size: .small)
                        Text(holding.exchange.name)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(t.textTertiary)
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                if let value = holdingValue {
                    Text(vm.format(value))
                        .font(.system(size: 16, weight: .bold, design: .monospaced))
                        .foregroundColor(t.textPrimary)
                } else if vm.isLoading {
                    ProgressView().scaleEffect(0.7)
                } else {
                    Text("—").font(.system(size: 16, weight: .bold, design: .monospaced)).foregroundColor(t.textFaint)
                }

                HStack(spacing: 6) {
                    if let p = priceValue {
                        Text(vm.format(p))
                            .font(.system(size: 11, design: .monospaced)).foregroundColor(t.textTertiary)
                    }
                    if let c = change {
                        let color = isPositive ? t.green : t.red
                        Text(c.asPercentChange)
                            .font(.system(size: 10, weight: .semibold, design: .monospaced))
                            .foregroundColor(color)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Capsule().fill(color.opacity(0.12)))
                    }
                }
            }

            HStack(spacing: 4) {
                Button { onEdit() } label: {
                    Image(systemName: "pencil")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(t.gold)
                        .frame(width: 30, height: 30)
                        .background(RoundedRectangle(cornerRadius: 8).fill(t.goldDim)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(t.goldBorder, lineWidth: 1)))
                }
                .buttonStyle(.plain).opacity(isHovered ? 1 : 0)

                Button { vm.remove(holding: holding) } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(t.red)
                        .frame(width: 30, height: 30)
                        .background(RoundedRectangle(cornerRadius: 8).fill(t.red.opacity(0.08))
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(t.red.opacity(0.15), lineWidth: 1)))
                }
                .buttonStyle(.plain).opacity(isHovered ? 1 : 0)
            }
            .animation(.easeInOut(duration: 0.15), value: isHovered)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isHovered ? t.cardBgHover : t.rowBg)
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(isHovered ? t.borderHover : t.border, lineWidth: 1))
        )
        .animation(.easeInOut(duration: 0.15), value: isHovered)
        .onHover { isHovered = $0 }
    }

    private func formatAmount(_ v: Double) -> String {
        v == v.rounded() && v < 1_000_000 ? String(format: "%.0f", v) : String(format: "%g", v)
    }
}
