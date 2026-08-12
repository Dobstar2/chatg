import CoreGraphics

/// Pure coordinate and gesture helpers, separated so the thresholds can be unit tested.
enum HandGestureMath {
  static func distance(_ lhs: CGPoint, _ rhs: CGPoint) -> CGFloat {
    hypot(lhs.x - rhs.x, lhs.y - rhs.y)
  }

  static func clamp(_ value: CGFloat, lower: CGFloat, upper: CGFloat) -> CGFloat {
    min(max(value, lower), upper)
  }

  /// Converts Vision's bottom-left coordinate system into a top-left UI coordinate system.
  /// Gain expands or contracts movement around the center of the camera frame.
  static func transformedVisionPoint(
    _ location: CGPoint,
    mirrorHorizontally: Bool,
    gain: CGFloat
  ) -> CGPoint {
    let sourceX = mirrorHorizontally ? 1 - location.x : location.x
    let sourceY = 1 - location.y

    let adjustedX = 0.5 + ((sourceX - 0.5) * gain)
    let adjustedY = 0.5 + ((sourceY - 0.5) * gain)

    return CGPoint(
      x: clamp(adjustedX, lower: 0, upper: 1),
      y: clamp(adjustedY, lower: 0, upper: 1)
    )
  }

  /// Maps a normalized camera point through the same aspect-fill crop used by the preview layer.
  static func aspectFillPoint(
    normalizedPoint: CGPoint,
    sourceAspectRatio: CGFloat,
    destinationSize: CGSize
  ) -> CGPoint {
    guard destinationSize.width > 0, destinationSize.height > 0 else {
      return .zero
    }

    let safeAspectRatio = max(sourceAspectRatio, 0.01)
    let sourceSize = CGSize(width: safeAspectRatio, height: 1)
    let scale = max(
      destinationSize.width / sourceSize.width,
      destinationSize.height / sourceSize.height
    )

    let renderedSize = CGSize(
      width: sourceSize.width * scale,
      height: sourceSize.height * scale
    )
    let cropX = (renderedSize.width - destinationSize.width) / 2
    let cropY = (renderedSize.height - destinationSize.height) / 2

    return CGPoint(
      x: clamp(
        (normalizedPoint.x * renderedSize.width) - cropX, lower: 0, upper: destinationSize.width),
      y: clamp(
        (normalizedPoint.y * renderedSize.height) - cropY, lower: 0, upper: destinationSize.height)
    )
  }
}

enum PinchTransition: Equatable {
  case none
  case began
  case ended
}

/// Hysteresis prevents a noisy pinch distance from firing many taps in rapid succession.
struct PinchStateMachine {
  var beginThreshold: CGFloat = 0.42
  var endThreshold: CGFloat = 0.60
  private(set) var isPinching = false

  mutating func update(normalizedDistance: CGFloat) -> PinchTransition {
    if isPinching {
      if normalizedDistance > endThreshold {
        isPinching = false
        return .ended
      }
    } else if normalizedDistance < beginThreshold {
      isPinching = true
      return .began
    }

    return .none
  }

  mutating func reset() {
    isPinching = false
  }
}
