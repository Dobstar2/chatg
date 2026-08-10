import SwiftUI

struct SpatialHomeView: View {
  @EnvironmentObject private var handTracker: HandTrackingController
  @State private var selectedTile: SpatialTile = .dashboard

  var body: some View {
    GeometryReader { geometry in
      let size = geometry.size
      let cursorPoint = HandGestureMath.aspectFillPoint(
        normalizedPoint: handTracker.normalizedPointer,
        sourceAspectRatio: handTracker.sourceAspectRatio,
        destinationSize: size
      )
      let hoveredTile = tile(at: cursorPoint, in: size)

      ZStack {
        CameraPreviewView(session: handTracker.captureSession)
          .ignoresSafeArea()

        LinearGradient(
          colors: [
            Color.black.opacity(0.78),
            Color.black.opacity(0.38),
            Color.black.opacity(0.72),
          ],
          startPoint: .top,
          endPoint: .bottom
        )
        .ignoresSafeArea()

        header
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 20)
          .padding(.top, 12)
          .frame(maxHeight: .infinity, alignment: .top)

        ForEach(Array(SpatialTile.allCases.enumerated()), id: \.offset) { index, tile in
          SpatialTileCard(
            tile: tile,
            isSelected: selectedTile == tile,
            isHovered: hoveredTile == tile
          ) {
            selectedTile = tile
          }
          .frame(
            width: tileFrame(index: index, in: size).width,
            height: tileFrame(index: index, in: size).height
          )
          .position(
            x: tileFrame(index: index, in: size).midX,
            y: tileFrame(index: index, in: size).midY
          )
        }

        detailDock
          .padding(.horizontal, 20)
          .padding(.bottom, 18)
          .frame(maxHeight: .infinity, alignment: .bottom)

        if handTracker.handVisible {
          HandCursor(isPinching: handTracker.isPinching)
            .position(cursorPoint)
            .allowsHitTesting(false)
        }
      }
      .contentShape(Rectangle())
      .onChange(of: handTracker.pinchEventCount) { _, _ in
        guard handTracker.handVisible,
          let pinchedTile = tile(at: cursorPoint, in: size)
        else {
          return
        }
        selectedTile = pinchedTile
      }
    }
    .background(Color.black)
    .preferredColorScheme(.dark)
    .onAppear {
      handTracker.start()
    }
    .onDisappear {
      handTracker.stop()
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 10) {
        Image(systemName: "hand.point.up.left.fill")
          .font(.title2)

        VStack(alignment: .leading, spacing: 1) {
          Text("SpatialHands")
            .font(.headline)
          Text("Spatial iOS interaction prototype")
            .font(.caption)
            .foregroundStyle(.secondary)
        }

        Spacer()

        Text(handTracker.cameraLabel)
          .font(.caption2.weight(.semibold))
          .padding(.horizontal, 10)
          .padding(.vertical, 7)
          .background(.thinMaterial, in: Capsule())
      }

      Text(handTracker.statusMessage)
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(2)
    }
    .padding(14)
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(.white.opacity(0.14), lineWidth: 1)
    }
  }

  @ViewBuilder
  private var detailDock: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Label(selectedTile.title, systemImage: selectedTile.symbol)
          .font(.headline)
        Spacer()
        Text(handTracker.handVisible ? "HAND ONLINE" : "TOUCH FALLBACK")
          .font(.caption2.weight(.bold))
          .foregroundStyle(handTracker.handVisible ? Color.green : Color.gray)
      }

      Text(selectedTile.detail)
        .font(.subheadline)
        .foregroundStyle(.secondary)

      if selectedTile == .tracking {
        Toggle("Mirror horizontal movement", isOn: $handTracker.mirrorHorizontally)
          .font(.caption)

        HStack {
          Text("Cursor reach")
            .font(.caption)
          Slider(
            value: Binding(
              get: { Double(handTracker.cursorGain) },
              set: { handTracker.cursorGain = CGFloat($0) }
            ),
            in: 0.8...1.6
          )
          Text(handTracker.cursorGain.formatted(.number.precision(.fractionLength(2))))
            .font(.caption.monospacedDigit())
            .frame(width: 38, alignment: .trailing)
        }
      } else {
        Text("Move your index fingertip over a tile and pinch thumb-to-index once.")
          .font(.caption)
          .foregroundStyle(.tertiary)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 24, style: .continuous)
        .stroke(.white.opacity(0.14), lineWidth: 1)
    }
  }

  private func tile(at point: CGPoint, in size: CGSize) -> SpatialTile? {
    for (index, tile) in SpatialTile.allCases.enumerated() {
      if tileFrame(index: index, in: size).contains(point) {
        return tile
      }
    }
    return nil
  }

  private func tileFrame(index: Int, in size: CGSize) -> CGRect {
    let horizontalMargin: CGFloat = 20
    let gap: CGFloat = 14
    let columns = 2
    let cardWidth = max(130, (size.width - (horizontalMargin * 2) - gap) / 2)
    let availableCardHeight = max(230, size.height - 410)
    let cardHeight = min(138, max(112, (availableCardHeight - gap) / 2))
    let top = min(204, max(174, size.height * 0.23))

    let column = index % columns
    let row = index / columns
    let x = horizontalMargin + CGFloat(column) * (cardWidth + gap)
    let y = top + CGFloat(row) * (cardHeight + gap)

    return CGRect(x: x, y: y, width: cardWidth, height: cardHeight)
  }
}

private enum SpatialTile: String, CaseIterable, Identifiable {
  case dashboard
  case media
  case scenes
  case tracking

  var id: String { rawValue }

  var title: String {
    switch self {
    case .dashboard: "Dashboard"
    case .media: "Media"
    case .scenes: "Scenes"
    case .tracking: "Tracking"
    }
  }

  var subtitle: String {
    switch self {
    case .dashboard: "Status and launcher"
    case .media: "Local media surface"
    case .scenes: "Spatial layout presets"
    case .tracking: "Cursor calibration"
    }
  }

  var detail: String {
    switch self {
    case .dashboard:
      "The dashboard is a safe, app-level spatial shell. It does not replace iOS or the Home Screen."
    case .media:
      "This tile is ready to connect to a future Photos or AVPlayer surface without sending camera frames off-device."
    case .scenes:
      "Scenes can become alternate SwiftUI layouts, backgrounds, or room-style launcher arrangements."
    case .tracking:
      "Use touch controls here to correct horizontal direction and adjust how far the cursor travels."
    }
  }

  var symbol: String {
    switch self {
    case .dashboard: "square.grid.2x2.fill"
    case .media: "play.rectangle.fill"
    case .scenes: "sparkles.rectangle.stack.fill"
    case .tracking: "scope"
    }
  }
}

private struct SpatialTileCard: View {
  let tile: SpatialTile
  let isSelected: Bool
  let isHovered: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      VStack(alignment: .leading, spacing: 10) {
        HStack {
          Image(systemName: tile.symbol)
            .font(.title2)
          Spacer()
          if isSelected {
            Image(systemName: "checkmark.circle.fill")
              .font(.subheadline)
          }
        }

        Spacer(minLength: 4)

        Text(tile.title)
          .font(.headline)
        Text(tile.subtitle)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
      .padding(16)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
          .stroke(
            isHovered || isSelected ? .white.opacity(0.78) : .white.opacity(0.14),
            lineWidth: isHovered ? 2 : 1
          )
      }
      .shadow(radius: isHovered ? 18 : 4)
      .scaleEffect(isHovered ? 1.035 : 1)
      .animation(.easeOut(duration: 0.12), value: isHovered)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(tile.title)
    .accessibilityHint("Selects the \(tile.title) spatial tile")
  }
}

private struct HandCursor: View {
  let isPinching: Bool

  var body: some View {
    ZStack {
      Circle()
        .fill(.white.opacity(0.16))
        .frame(width: isPinching ? 58 : 46, height: isPinching ? 58 : 46)

      Circle()
        .stroke(.white, lineWidth: isPinching ? 4 : 2)
        .frame(width: isPinching ? 36 : 28, height: isPinching ? 36 : 28)

      Circle()
        .fill(.white)
        .frame(width: 8, height: 8)
    }
    .shadow(radius: 10)
    .animation(.spring(response: 0.16, dampingFraction: 0.72), value: isPinching)
  }
}
