# Pocket VR tracking-foundation implementation report

## Scope completed in this preview

This is an isolated, static GitHub Pages-compatible tracking refactor. It intentionally leaves the current root experience untouched until physical iPhone validation is complete.

### Tracking architecture

- `HeadTrackingManager` owns the single recentered head quaternion.
- `CameraManager` owns rear-camera selection and prefers exposed ultra-wide / 0.5x devices.
- `HandTrackingManager` configures MediaPipe for two simultaneous hands and keeps independent left/right state.
- `GestureDetector` emits pinch start, held, release plus open, point, fist, grab, and relaxed states.
- Hand inference is adaptive and never queues overlapping requests.
- Rendering interpolates the latest valid hand pose independently from inference.

### 3D coordinate model

- Right-handed world space.
- `+X` right, `+Y` up, `-Z` forward.
- Camera-space hand depth is estimated from apparent palm width, active camera FOV, and a configurable physical palm-width model.
- Each 21-joint hand skeleton is converted to camera-space metres, then rotated into the same world space used by the head, panel, rays, and objects.
- Depth is bounded and filtered; it is explicitly an estimate rather than hardware depth.

### Interaction

- Independent left/right targets and pinch state.
- Near poke interaction on the spatial panel.
- Far index-ray hover and pinch selection.
- One-hand object grabbing.
- Separate objects can be held simultaneously.
- Two hands on one object control midpoint position, distance-based scale, and relative rotation.
- Lost hands stop interacting immediately, hold the last pose briefly for display, then fade.

### Debug and calibration

- Recenter View is separate from Recalibrate Hands.
- Developer debug mode shows render FPS, tracking FPS, inference time, confidence, hand XYZ, gesture, target, interaction mode, camera source, and head quaternion.
- Touch controls remain as fallback.

## Automated checks run

```text
node --check: all JavaScript and test modules passed
node --test: 15/15 tests passed
```

The tests cover quaternion behavior, ray-plane intersection, polygon hit testing, pinch transition semantics, two-hand identity continuity, monocular depth ordering, far UI activation, bounded two-hand scaling, relative asset paths, and local module resolution.

## Still required before root promotion

- Physical iPhone test with rear 0.5x camera exposure.
- Left-only, right-only, both-hands, crossed-hands, depth, tracking-loss, and two-hand manipulation tests.
- Verify MediaPipe model/WASM fetches on the deployed Pages URL.
- Sustained thermal/performance test.
- Decide whether to vendor MediaPipe runtime/model files for stronger offline reliability.
