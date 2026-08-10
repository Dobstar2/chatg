# Pocket Spatial Runtime 0.4

Pocket Spatial 0.4 is the tracking-first browser runtime for the iPhone Safari / WebKit and GitHub Pages target.

## What ships in 0.4

- Three presentation modes using one world and interaction engine:
  - virtual-reality split stereo,
  - rear-camera passthrough headset mode,
  - handheld augmented-reality mode.
- Independent automatic left and right hand controllers. Either hand can operate the system alone; the second hand can join or leave without restarting the first.
- MediaPipe Hand Landmarker 0.10.35 with a transferable `VideoFrame` worker path where WebKit exposes the required APIs, one inference in flight at a time, stale-frame dropping, and automatic main-thread GPU/CPU fallback.
- Adaptive per-joint filtering, temporal handedness continuity, stabilized monocular depth, short visual prediction, filtered aim rays, pinch hysteresis, near-poke state transitions, grab offsets, bounded throw velocity, and independent/two-hand manipulation.
- Capture-time hand/head synchronization. A hand result is first transformed with the historical phone pose associated with its camera frame, then rendered from the newest predicted head pose.
- Fused head orientation using device orientation plus rotation-rate samples, a timestamped pose history, bounded display-time prediction, and a deterministic neck model. Accelerometer double-integration is deliberately not used for absolute position.
- World tracking tiers:
  - orientation anchor available by default,
  - optional 160 mm printed QR anchor for browser-based camera pose,
  - optional bounded optical-flow translation experiment when no marker is visible.
- Occlusion tiers:
  - virtual hand/object depth ordering by default,
  - optional low-rate person segmentation,
  - optional monocular scene depth,
  - optional WebGL2 depth-reprojected pseudo-stereo passthrough.
- Pocket Glass mobile-first launch UI, safe-area support, appearance and accessibility settings, touch fallback, installable-web-app metadata, and an expanded developer diagnostics overlay.
- Performance priority is enforced in code: optional segmentation and depth-reprojection effects are reduced before the hand-control cadence is sacrificed.

## Static release delivery

The root GitHub Pages document loads an immutable release payload from repository commit `a81268c8624acdf778ce1c1683e7f448e795b1c1`. The bootstrap verifies SHA-256 `c6d99a37edf4652962f4f96049e5bc565f3d9c3d950de7b6ce8f06df60f97ae1`, extracts the static files in the browser, and installs them in the GitHub Pages origin's Cache Storage through `sw-v040.js`. Later launches use the locally installed static release.

## Validation completed before publishing

- `node --check` succeeded for every JavaScript module in the 0.4 runtime.
- The runtime/static Node test suite completed with **15 passed, 0 failed**.
- Tests cover quaternion conventions, pose-history interpolation and bounded prediction, neck-model bounds, synthetic marker pose recovery, camera intrinsics, either-hand-only selection, single-fire near poke, channel-depth collapse, touch-look fallback, two-hand-to-one-hand grab rebasing, capture-time hand transformation, optical patch translation, release references, module resolution, and anchor/icon resources.
- The compressed release archive was re-hashed before publishing and matched the bootstrap's expected SHA-256.

## Acceptance still required on the physical target

No physical iPhone result is claimed by the automated checks. The production URL still needs a real-device pass for camera selection, worker availability, sustained thermal behavior, hand latency, head/hand synchronization, marker tracking, segmentation, scene-depth quality, pseudo-stereo artifacts, Safari fullscreen behavior, and long-session stability. Optional depth, segmentation, optical translation, and pseudo-stereo systems are marked experimental in the interface and fail back to the core hand/head runtime.
