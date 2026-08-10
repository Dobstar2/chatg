import CoreGraphics
import XCTest

@testable import SpatialHands

final class HandGestureMathTests: XCTestCase {
  func testVisionPointFlipsVerticalAxis() {
    let point = HandGestureMath.transformedVisionPoint(
      CGPoint(x: 0.25, y: 0.80),
      mirrorHorizontally: false,
      gain: 1
    )

    XCTAssertEqual(point.x, 0.25, accuracy: 0.0001)
    XCTAssertEqual(point.y, 0.20, accuracy: 0.0001)
  }

  func testVisionPointCanMirrorHorizontalAxis() {
    let point = HandGestureMath.transformedVisionPoint(
      CGPoint(x: 0.20, y: 0.50),
      mirrorHorizontally: true,
      gain: 1
    )

    XCTAssertEqual(point.x, 0.80, accuracy: 0.0001)
    XCTAssertEqual(point.y, 0.50, accuracy: 0.0001)
  }

  func testPinchStateMachineUsesHysteresis() {
    var machine = PinchStateMachine(beginThreshold: 0.42, endThreshold: 0.60)

    XCTAssertEqual(machine.update(normalizedDistance: 0.40), .began)
    XCTAssertTrue(machine.isPinching)
    XCTAssertEqual(machine.update(normalizedDistance: 0.50), .none)
    XCTAssertTrue(machine.isPinching)
    XCTAssertEqual(machine.update(normalizedDistance: 0.62), .ended)
    XCTAssertFalse(machine.isPinching)
  }

  func testAspectFillMappingAccountsForHorizontalCrop() {
    let point = HandGestureMath.aspectFillPoint(
      normalizedPoint: CGPoint(x: 0.5, y: 0.5),
      sourceAspectRatio: 9.0 / 16.0,
      destinationSize: CGSize(width: 390, height: 844)
    )

    XCTAssertEqual(point.x, 195, accuracy: 0.01)
    XCTAssertEqual(point.y, 422, accuracy: 0.01)
  }
}
