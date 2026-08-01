import SwiftUI

// MARK: - Coin image
struct CoinImageView: View {
    let coin: Coin
    let imageURL: String?
    var size: CGFloat = 48

    @Environment(\.theme) private var theme

    private var cornerRadius: CGFloat { size * 0.27 }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius)
                .fill(theme.goldDim)
                .overlay(RoundedRectangle(cornerRadius: cornerRadius).stroke(theme.goldBorder, lineWidth: 1))
                .frame(width: size, height: size)

            if let urlStr = imageURL, let url = URL(string: urlStr) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFit()
                            .frame(width: size * 0.68, height: size * 0.68)
                    default:
                        fallbackLabel
                    }
                }
            } else {
                fallbackLabel
            }
        }
        .frame(width: size, height: size)
    }

    private var fallbackLabel: some View {
        Text(coin.symbol)
            .font(.system(size: coin.symbol.count > 3 ? size * 0.19 : size * 0.23, weight: .bold, design: .monospaced))
            .foregroundColor(theme.gold)
    }
}

// MARK: - Exchange badge
enum BadgeSize { case small, medium }

struct ExchangeBadge: View {
    let exchange: Exchange
    let size: BadgeSize

    @Environment(\.theme) private var theme

    private var dim: CGFloat      { size == .small ? 22 : 30 }
    private var iconDim: CGFloat  { size == .small ? 14 : 20 }
    private var fontSize: CGFloat { size == .small ? 8  : 10 }

    var body: some View {
        ZStack {
            Circle()
                .fill(Color(hex: exchange.color).opacity(0.15))
                .overlay(Circle().stroke(Color(hex: exchange.color).opacity(0.3), lineWidth: 1))
                .frame(width: dim, height: dim)

            if let url = exchange.logoURL, !exchange.domain.isEmpty {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFit()
                            .frame(width: iconDim, height: iconDim)
                            .clipShape(Circle())
                    default:
                        fallbackLabel
                    }
                }
            } else {
                fallbackLabel
            }
        }
        .frame(width: dim, height: dim)
    }

    private var fallbackLabel: some View {
        Text(String(exchange.name.prefix(2)).uppercased())
            .font(.system(size: fontSize, weight: .bold, design: .monospaced))
            .foregroundColor(Color(hex: exchange.color))
    }
}
