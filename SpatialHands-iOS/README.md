# SpatialHands for iOS

SpatialHands is an independent, native SwiftUI prototype for a spatial, hand-controlled phone interface. It requests the iPhone's physical ultra-wide rear camera (the lens shown as **0.5x** in Apple's Camera app), uses Apple's Vision framework to detect one hand, moves a cursor with the index fingertip, and fires a selection when the thumb and index finger pinch.

This repository is **not a port of Meta Horizon OS**, does not contain Meta firmware, source code, artwork, or system assets, and cannot replace iOS. It is an app-level interaction prototype inspired by spatial-computing interfaces.

## Included

- Native SwiftUI interface with four spatial tiles.
- `AVCaptureSession` camera pipeline.
- Physical ultra-wide camera discovery with a 1x wide-camera fallback.
- On-device `VNDetectHumanHandPoseRequest` tracking.
- Smoothed index-finger cursor.
- Palm-scale-normalized pinch detection.
- Pinch hysteresis so one pinch produces one click.
- Haptic feedback on selection.
- Touch fallback for every tile.
- Horizontal mirror and cursor-reach calibration.
- Unit tests for coordinate transforms and pinch state.

## Requirements

- iPhone running iOS 17 or later.
- An iPhone model with an ultra-wide rear camera for the intended 0.5x view. Other models fall back to the standard rear camera.
- A Mac with Xcode capable of building for your installed iOS version.
- An Apple Account signed into Xcode. A paid developer membership is not required for basic personal-device testing, but free personal-team installs need periodic reprovisioning.

The camera and Vision hand-pose APIs do not work meaningfully in the iOS Simulator. Test on a physical iPhone.

## Install on your iPhone

1. Clone or download this repository.
2. Open `SpatialHands.xcodeproj` in Xcode.
3. Select the **SpatialHands** target, open **Signing & Capabilities**, and choose your Apple development team.
4. If Xcode reports that the bundle identifier is unavailable, change `com.dobstar.spatialhands` to a unique value such as `com.yourname.spatialhands`.
5. Connect your iPhone, trust the Mac, enable Developer Mode when iOS requests it, and choose the phone as the run destination.
6. Press **Run** in Xcode.
7. Grant camera access the first time the app opens.

The committed Xcode project is ready to open. `project.yml` is also included so the project can be regenerated with [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```bash
brew install xcodegen
xcodegen generate
```

## Use it

The 0.5x lens is on the back of the phone, so the camera must actually see the hand. Prop the phone on a stand or place it where the rear camera faces the interaction area.

1. Keep one whole hand in frame, approximately 40-120 cm from the phone.
2. Point with the index fingertip to move the cursor.
3. Bring the thumb and index fingertip together once to select the highlighted tile.
4. Open **Tracking** and use touch if horizontal movement is reversed or the cursor cannot reach the edges.

## Architecture

```text
Rear camera frame
      |
AVCaptureVideoDataOutput
      |
VNDetectHumanHandPoseRequest
      |
indexTip + thumbTip + wrist + middleMCP
      |
coordinate transform + smoothing + pinch state machine
      |
SwiftUI cursor + tile hit testing
```

All frame processing happens locally in the app. This starter has no analytics, upload, advertising, or camera-networking code.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for implementation notes and extension points.

## Important limitations

- This is a launcher-style demo inside one app. iOS does not let a third-party app replace SpringBoard or globally control arbitrary apps with a camera cursor.
- The rear 0.5x camera cannot see a hand that is hidden behind the phone or holding it outside the lens view.
- Vision returns 2D landmarks. This prototype does not infer full 3D depth or occlusion.
- Camera framing, lighting, skin-to-background contrast, and motion blur affect tracking quality.
- The app is locked to portrait to keep camera-to-screen mapping predictable.

## License and trademarks

Code is available under the MIT License. Meta, Horizon, Meta Horizon OS, and Quest are trademarks of their respective owner. This project is unaffiliated with and not endorsed by Meta Platforms, Inc.
