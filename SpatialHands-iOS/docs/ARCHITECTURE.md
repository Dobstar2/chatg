# Architecture

## Goal

Create an iPhone-native spatial interface whose primary pointer is a hand seen by the rear camera. The app deliberately remains inside normal iOS application boundaries.

## Capture pipeline

`HandTrackingController` owns one `AVCaptureSession`. It discovers physical back cameras in this order:

1. `builtInUltraWideCamera` for the intended 0.5x field of view.
2. `builtInWideAngleCamera` as a compatibility fallback.

The session runs at 1280x720 when supported and discards late frames. Vision processing is throttled to approximately 20 frames per second so the UI remains responsive and the device is less likely to thermally throttle.

## Landmark extraction

Each selected frame is passed to `VNDetectHumanHandPoseRequest` with `maximumHandCount = 1`. Four joints are used:

- `indexTip`: pointer location.
- `thumbTip`: pinch endpoint.
- `wrist`: hand-scale reference.
- `middleMCP`: hand-scale reference.

A point must exceed the minimum confidence threshold before it is accepted.

## Pinch recognition

Raw thumb-to-index distance changes with how near the hand is to the lens. The implementation divides that distance by the wrist-to-middle-MCP distance. The resulting palm-relative number is fed into `PinchStateMachine`.

Two thresholds form hysteresis:

- Begin pinch below `0.42`.
- End pinch above `0.60`.

The gap prevents landmark noise around one threshold from creating repeated clicks.

## Pointer mapping

Vision uses a normalized coordinate system with its origin at the lower-left. SwiftUI uses a top-left origin. `HandGestureMath` flips the vertical axis, optionally mirrors horizontal movement, and expands movement around the center using `cursorGain`.

The camera preview uses aspect fill. The camera image can therefore be cropped at the sides or top/bottom. `aspectFillPoint` applies the same crop math before placing the SwiftUI cursor.

## Interaction model

The main tiles are both normal SwiftUI buttons and explicit rectangles used for hand-pointer hit testing. This provides:

- Hand pinch selection.
- Touch fallback.
- VoiceOver labels for basic accessibility.

## Privacy model

No captured frame leaves the process. The app has no networking layer. Adding cloud features later should keep camera upload opt-in and clearly disclosed.

## Extension ideas

- Add a calibration wizard that records comfortable pointer bounds.
- Add dwell selection for users who cannot pinch.
- Add two-hand gestures for zoom or window resizing.
- Add `PhotosPicker` and `AVPlayer` to turn the Media tile into a real local surface.
- Add Core ML gesture classification after collecting consented training data.
- Add a front-camera mode for handheld use, while keeping the rear 0.5x mode as the default requested experience.
