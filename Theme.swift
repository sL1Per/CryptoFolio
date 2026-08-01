import SwiftUI

// MARK: - Theme
// All colors in the app go through here so dark/light mode works correctly.

struct Theme {
    let scheme: ColorScheme

    // ── Backgrounds ──
    var appBg: Color {
        scheme == .dark ? Color(hex: "080b10") : Color(hex: "f0f2f5")
    }
    var sheetBg: Color {
        scheme == .dark ? Color(hex: "0a0d12") : Color(hex: "f7f8fa")
    }
    var cardBg: Color {
        scheme == .dark ? Color.white.opacity(0.03) : Color.white.opacity(0.85)
    }
    var cardBgHover: Color {
        scheme == .dark ? Color.white.opacity(0.06) : Color(hex: "e8eaed")
    }
    var rowBg: Color {
        scheme == .dark ? Color.white.opacity(0.03) : Color.white
    }
    var dropdownBg: Color {
        scheme == .dark ? Color(hex: "0d1117") : Color.white
    }
    var groupHeaderBg: Color {
        scheme == .dark ? Color.black.opacity(0.2) : Color(hex: "f0f2f5")
    }
    var insetBg: Color {
        scheme == .dark ? Color.black.opacity(0.25) : Color(hex: "eaecef")
    }

    // ── Borders ──
    var border: Color {
        scheme == .dark ? Color.white.opacity(0.06) : Color.black.opacity(0.07)
    }
    var borderHover: Color {
        scheme == .dark ? Color(hex: "ffc850").opacity(0.15) : Color(hex: "ffc850").opacity(0.5)
    }
    var subtleBorder: Color {
        scheme == .dark ? Color.white.opacity(0.04) : Color.black.opacity(0.05)
    }
    var fieldBorder: Color {
        scheme == .dark ? Color.white.opacity(0.1) : Color.black.opacity(0.12)
    }

    // ── Text ──
    var textPrimary: Color {
        scheme == .dark ? Color(hex: "e0e0e0") : Color(hex: "111111")
    }
    var textSecondary: Color {
        scheme == .dark ? Color(hex: "888888") : Color(hex: "555555")
    }
    var textTertiary: Color {
        scheme == .dark ? Color(hex: "555555") : Color(hex: "999999")
    }
    var textFaint: Color {
        scheme == .dark ? Color(hex: "333333") : Color(hex: "cccccc")
    }
    var navTitle: Color {
        scheme == .dark ? Color.white : Color(hex: "111111")
    }

    // ── Fields ──
    var fieldBg: Color {
        scheme == .dark ? Color.white.opacity(0.05) : Color.white
    }
    var lockedFieldBg: Color {
        scheme == .dark ? Color.white.opacity(0.02) : Color(hex: "f0f0f0")
    }

    // ── Gold (same in both modes) ──
    let gold          = Color(hex: "ffc850")
    let goldDim       = Color(hex: "ffc850").opacity(0.08)
    let goldBorder    = Color(hex: "ffc850").opacity(0.15)
    let goldCardBg    = Color(hex: "ffc850").opacity(0.05)
    let goldCardBorder = Color(hex: "ffc850").opacity(0.12)

    // ── Status ──
    let green  = Color(hex: "00d97e")
    let red    = Color(hex: "ff4d6d")
}

// MARK: - Environment key
struct ThemeKey: EnvironmentKey {
    static let defaultValue = Theme(scheme: .dark)
}

extension EnvironmentValues {
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

// MARK: - Color hex init (shared)
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8)  & 0xFF) / 255
        let b = Double(int & 0xFF)         / 255
        self.init(red: r, green: g, blue: b)
    }
}
