import SwiftUI

@main
struct SpatialHandsApp: App {
  @StateObject private var handTracker = HandTrackingController()

  var body: some Scene {
    WindowGroup {
      SpatialHomeView()
        .environmentObject(handTracker)
    }
  }
}
