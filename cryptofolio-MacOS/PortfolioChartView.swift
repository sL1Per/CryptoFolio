import SwiftUI
import Charts

struct ChartWindowView: View {
    @EnvironmentObject var vm: PortfolioViewModel
    @Environment(\.theme) private var t

    var body: some View {
        ZStack {
            t.appBg.ignoresSafeArea()
            VStack(spacing: 0) {
                headerBar
                Divider().background(t.subtleBorder)
                chartArea
                Divider().background(t.subtleBorder)
                statsBar
                Divider().background(t.subtleBorder)
                timeRangeBar
            }
        }
        .onAppear {
            if vm.historicalData.isEmpty && !vm.holdings.isEmpty {
                Task { await vm.fetchHistoricalData() }
            }
        }
        .onChange(of: vm.selectedTimeRange) {
            Task { await vm.fetchHistoricalData() }
        }
    }

    // MARK: - Header

    private var headerBar: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text("PORTFOLIO HISTORY")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(t.textTertiary).tracking(3)
                Text(vm.format(vm.totalValue))
                    .font(.system(size: 28, weight: .bold, design: .monospaced))
                    .foregroundColor(t.textPrimary)
            }
            Spacer()
            if let change = periodChange {
                VStack(alignment: .trailing, spacing: 3) {
                    Text(vm.selectedTimeRange.rawValue + " CHANGE")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(t.textFaint).tracking(2)
                    HStack(spacing: 4) {
                        Image(systemName: isPositivePeriod ? "arrow.up.right" : "arrow.down.right")
                            .font(.system(size: 12, weight: .bold))
                        Text(change.asPercentChange)
                            .font(.system(size: 18, weight: .bold, design: .monospaced))
                    }
                    .foregroundColor(isPositivePeriod ? t.green : t.red)
                }
            }
            VStack(alignment: .trailing, spacing: 4) {
                Button { Task { await vm.fetchHistoricalData(forceRefresh: true) } } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 14))
                        .foregroundColor(vm.isLoadingChart ? t.textFaint : t.gold)
                        .rotationEffect(.degrees(vm.isLoadingChart ? 360 : 0))
                        .animation(vm.isLoadingChart ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: vm.isLoadingChart)
                }
                .buttonStyle(.plain).disabled(vm.isLoadingChart)

                if !vm.chartLoadingStatus.isEmpty {
                    Text(vm.chartLoadingStatus)
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(t.textFaint)
                        .animation(.easeInOut, value: vm.chartLoadingStatus)
                } else if vm.chartIsStale, let cached = vm.chartCachedAt {
                    HStack(spacing: 3) {
                        Image(systemName: "clock").font(.system(size: 8))
                        Text("Cached \(cached, style: .relative) ago")
                            .font(.system(size: 9, design: .monospaced))
                    }
                    .foregroundColor(t.textFaint.opacity(0.7))
                } else if let cached = vm.chartCachedAt, !vm.isLoadingChart {
                    Text("Updated \(cached, style: .time)")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(t.textFaint.opacity(0.5))
                }
            }
        }
        .padding(.horizontal, 24).padding(.vertical, 18)
    }

    // MARK: - Chart

    private var chartArea: some View {
        ZStack {
            // Always prefer showing chart data if we have it
            if !vm.historicalData.isEmpty {
                chart
                // Overlay a subtle "stale" banner if data is old and we're not actively loading
                if vm.chartIsStale && !vm.isLoadingChart {
                    VStack {
                        staleBanner
                        Spacer()
                    }
                }
            } else if vm.isLoadingChart {
                loadingView
            } else if let err = vm.chartError {
                errorView(err)
            } else {
                emptyView
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var staleBanner: some View {
        HStack(spacing: 6) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 10))
            Text("Showing cached data — tap ↻ to refresh")
                .font(.system(size: 10, design: .monospaced))
        }
        .foregroundColor(t.gold.opacity(0.7))
        .padding(.horizontal, 12).padding(.vertical, 6)
        .background(
            Capsule()
                .fill(t.goldDim)
                .overlay(Capsule().stroke(t.goldBorder, lineWidth: 1))
        )
        .padding(.top, 12)
    }

    private var chart: some View {
        Chart(vm.historicalData) { point in
            AreaMark(x: .value("Date", point.date), y: .value("Value", point.value))
                .foregroundStyle(LinearGradient(
                    colors: [lineColor.opacity(0.2), lineColor.opacity(0.0)],
                    startPoint: .top, endPoint: .bottom))
                .interpolationMethod(.catmullRom)
            LineMark(x: .value("Date", point.date), y: .value("Value", point.value))
                .foregroundStyle(lineColor)
                .lineStyle(StrokeStyle(lineWidth: 2.5))
                .interpolationMethod(.catmullRom)
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: xAxisCount)) { val in
                AxisGridLine().foregroundStyle(t.subtleBorder)
                AxisValueLabel {
                    if let date = val.as(Date.self) {
                        Text(xLabel(date)).font(.system(size: 10, design: .monospaced)).foregroundColor(t.textTertiary)
                    }
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 5)) { val in
                AxisGridLine().foregroundStyle(t.subtleBorder)
                AxisValueLabel {
                    if let v = val.as(Double.self) {
                        Text(yLabel(v)).font(.system(size: 10, design: .monospaced)).foregroundColor(t.textTertiary)
                    }
                }
            }
        }
        .chartYScale(domain: .automatic(includesZero: false))
        .padding(.horizontal, 24).padding(.vertical, 12)
    }

    // MARK: - Stats bar

    private var statsBar: some View {
        HStack(spacing: 0) {
            statCell(label: "START",       value: vm.historicalData.first.map { vm.format($0.value) } ?? "—")
            statDivider
            statCell(label: "CURRENT",     value: vm.historicalData.last.map  { vm.format($0.value) } ?? "—", highlight: true)
            statDivider
            statCell(label: "PEAK",        value: vm.historicalData.max(by: { $0.value < $1.value }).map { vm.format($0.value) } ?? "—")
            statDivider
            statCell(label: "LOW",         value: vm.historicalData.min(by: { $0.value < $1.value }).map { vm.format($0.value) } ?? "—")
            statDivider
            statCell(label: "ABS. CHANGE", value: absoluteChange.map { vm.format(abs($0)) } ?? "—",
                     changeColor: absoluteChange.map { $0 >= 0 ? t.green : t.red })
        }
        .padding(.vertical, 4)
    }

    private func statCell(label: String, value: String, highlight: Bool = false, changeColor: Color? = nil) -> some View {
        VStack(spacing: 4) {
            Text(label).font(.system(size: 9, design: .monospaced)).foregroundColor(t.textFaint).tracking(1.5)
            Text(value).font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundColor(changeColor ?? (highlight ? t.gold : t.textSecondary))
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 12)
    }

    private var statDivider: some View {
        Rectangle().fill(t.subtleBorder).frame(width: 1).padding(.vertical, 10)
    }

    // MARK: - Time range bar

    private var timeRangeBar: some View {
        HStack(spacing: 6) {
            ForEach(TimeRange.allCases, id: \.self) { range in
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) { vm.selectedTimeRange = range }
                } label: {
                    Text(range.rawValue)
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundColor(vm.selectedTimeRange == range ? .black : t.textTertiary)
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                        .background(vm.selectedTimeRange == range ? t.gold : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 24).padding(.vertical, 12)
    }

    // MARK: - State views

    private var loadingView: some View {
        VStack(spacing: 10) {
            ProgressView()
            Text("Fetching chart data…").font(.system(size: 12, design: .monospaced)).foregroundColor(t.textTertiary)
        }
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle").font(.system(size: 28)).foregroundColor(t.textTertiary)
            Text(msg).font(.system(size: 12, design: .monospaced)).foregroundColor(t.textTertiary).multilineTextAlignment(.center)
            Button("Retry") { Task { await vm.fetchHistoricalData(forceRefresh: true) } }
                .font(.system(size: 12, design: .monospaced)).foregroundColor(t.gold).buttonStyle(.plain)
        }
    }

    private var emptyView: some View {
        VStack(spacing: 10) {
            Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 32)).foregroundColor(t.textFaint)
            Text("Add holdings to see your chart").font(.system(size: 12, design: .monospaced)).foregroundColor(t.textTertiary)
        }
    }

    // MARK: - Helpers

    private var periodChange: Double? {
        guard let first = vm.historicalData.first?.value, let last = vm.historicalData.last?.value, first > 0 else { return nil }
        return (last - first) / first * 100
    }

    private var absoluteChange: Double? {
        guard let first = vm.historicalData.first?.value, let last = vm.historicalData.last?.value else { return nil }
        return last - first
    }

    private var isPositivePeriod: Bool { (periodChange ?? 0) >= 0 }
    private var lineColor: Color { isPositivePeriod ? t.gold : t.red }

    private var xAxisCount: Int {
        switch vm.selectedTimeRange {
        case .week: return 7; case .month: return 6; case .year: return 12; case .fiveYears: return 5
        }
    }

    private func xLabel(_ date: Date) -> String {
        let f = DateFormatter()
        switch vm.selectedTimeRange {
        case .week:      f.dateFormat = "EEE d"
        case .month:     f.dateFormat = "MMM d"
        case .year:      f.dateFormat = "MMM yy"
        case .fiveYears: f.dateFormat = "yyyy"
        }
        return f.string(from: date)
    }

    private func yLabel(_ v: Double) -> String {
        let s = vm.currency.symbol
        if v >= 1_000_000 { return "\(s)\(String(format: "%.1fM", v/1_000_000))" }
        if v >= 1_000     { return "\(s)\(String(format: "%.0fK", v/1_000))" }
        return "\(s)\(String(format: "%.0f", v))"
    }
}
