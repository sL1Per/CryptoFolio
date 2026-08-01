import SwiftUI

struct SettingsView: View {
    @ObservedObject var vm: PortfolioViewModel
    @AppStorage("appearance") private var appearanceRaw: String = AppearanceMode.system.rawValue
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var t

    private var appearance: AppearanceMode {
        AppearanceMode(rawValue: appearanceRaw) ?? .system
    }

    var body: some View {
        NavigationStack {
            ZStack {
                t.sheetBg.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {

                        // ── Currency ──
                        settingsSection(title: "CURRENCY") {
                            HStack(spacing: 10) {
                                ForEach(Currency.allCases, id: \.self) { c in
                                    currencyOption(c)
                                }
                            }
                        }

                        // ── Appearance ──
                        settingsSection(title: "APPEARANCE") {
                            VStack(spacing: 8) {
                                ForEach(AppearanceMode.allCases, id: \.self) { mode in
                                    appearanceOption(mode)
                                }
                            }
                        }

                        // ── About ──
                        settingsSection(title: "ABOUT") {
                            VStack(spacing: 12) {
                                aboutRow(icon: "chart.line.uptrend.xyaxis", label: "App",      value: "CryptoFolio")
                                Divider().background(t.subtleBorder)
                                aboutRow(icon: "hammer.fill",               label: "Made by",  value: "Pedro Viegas & Claude.ai")
                                Divider().background(t.subtleBorder)
                                aboutRow(icon: "globe",                     label: "Prices",   value: "CoinGecko API")
                                Divider().background(t.subtleBorder)
                                aboutRow(icon: "c.circle",                  label: "Year",     value: "2026")
                            }
                        }

                        Spacer(minLength: 40)
                    }
                    .padding(.horizontal).padding(.top, 24)
                }
            }
            .navigationTitle("Settings")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            #endif
            .toolbar {
                ToolbarItem(placement: donePlacement) {
                    Button("Done") { dismiss() }.foregroundColor(t.gold).fontWeight(.semibold)
                }
            }
        }
    }

    // MARK: - Currency option

    private func currencyOption(_ c: Currency) -> some View {
        let isSelected = vm.currency == c
        return Button { vm.setCurrency(c) } label: {
            HStack(spacing: 10) {
                Text(c.symbol)
                    .font(.system(size: 18, weight: .bold, design: .monospaced))
                    .foregroundColor(isSelected ? .black : t.gold)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(c.code)
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundColor(isSelected ? .black : t.textPrimary)
                    Text(c == .usd ? "US Dollar" : "Euro")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(isSelected ? Color.black.opacity(0.6) : t.textTertiary)
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.black).font(.system(size: 16))
                }
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 12)
                .fill(isSelected ? t.gold : t.fieldBg)
                .overlay(RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.clear : t.fieldBorder, lineWidth: 1)))
        }
        .buttonStyle(.plain).frame(maxWidth: .infinity)
    }

    // MARK: - Appearance option

    private func appearanceOption(_ mode: AppearanceMode) -> some View {
        let isSelected = appearance == mode
        return Button {
            withAnimation(.easeInOut(duration: 0.2)) { appearanceRaw = mode.rawValue }
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(isSelected ? t.goldDim : t.fieldBg)
                        .overlay(Circle().stroke(isSelected ? t.gold.opacity(0.4) : t.fieldBorder, lineWidth: 1))
                        .frame(width: 36, height: 36)
                    Image(systemName: mode.icon)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(isSelected ? t.gold : t.textTertiary)
                }
                Text(mode.label)
                    .font(.system(size: 14, weight: .medium, design: .monospaced))
                    .foregroundColor(isSelected ? t.textPrimary : t.textSecondary)
                Spacer()
                ZStack {
                    Circle().stroke(isSelected ? t.gold : t.textFaint, lineWidth: 2).frame(width: 20, height: 20)
                    if isSelected { Circle().fill(t.gold).frame(width: 11, height: 11) }
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: 12)
                .fill(isSelected ? t.goldDim : t.fieldBg)
                .overlay(RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? t.gold.opacity(0.2) : t.fieldBorder, lineWidth: 1)))
        }
        .buttonStyle(.plain)
    }

    // MARK: - About row

    private func aboutRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 13)).foregroundColor(t.textTertiary).frame(width: 20)
            Text(label).font(.system(size: 12, design: .monospaced)).foregroundColor(t.textTertiary)
            Spacer()
            Text(value).font(.system(size: 12, design: .monospaced)).foregroundColor(t.textSecondary)
        }
        .padding(.horizontal, 4)
    }

    // MARK: - Section wrapper

    private func settingsSection<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(t.textTertiary).tracking(3)
            content()
        }
    }

    private var donePlacement: ToolbarItemPlacement {
        #if os(iOS)
        .navigationBarTrailing
        #else
        .automatic
        #endif
    }
}
