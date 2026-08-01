import SwiftUI

@main
struct CryptoFolioApp: App {
    @StateObject private var vm = PortfolioViewModel()
    @AppStorage("appearance") private var appearanceRaw: String = AppearanceMode.system.rawValue

    private var preferredScheme: ColorScheme? {
        switch AppearanceMode(rawValue: appearanceRaw) ?? .system {
        case .dark:   return .dark
        case .light:  return .light
        case .system: return nil
        }
    }

    var body: some Scene {
        WindowGroup {
            ThemeWrapper(preferredScheme: preferredScheme) {
                ContentView()
                    .environmentObject(vm)
            }
        }
        .defaultSize(width: 480, height: 780)

        WindowGroup(id: "chart", for: String.self) { _ in
            ThemeWrapper(preferredScheme: preferredScheme) {
                ChartWindowView()
                    .environmentObject(vm)
            }
        }
        .defaultSize(width: 680, height: 480)
    }
}

// MARK: - ThemeWrapper
// Reads the actual resolved color scheme and injects a Theme into the environment.
struct ThemeWrapper<Content: View>: View {
    let preferredScheme: ColorScheme?
    @ViewBuilder let content: () -> Content
    @Environment(\.colorScheme) private var systemScheme

    private var resolvedScheme: ColorScheme {
        preferredScheme ?? systemScheme
    }

    var body: some View {
        content()
            .preferredColorScheme(preferredScheme)
            .environment(\.theme, Theme(scheme: resolvedScheme))
    }
}
