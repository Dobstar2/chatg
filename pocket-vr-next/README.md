# Pocket VR Next — Tracking Foundation

This folder is an isolated GitHub Pages preview for the tracking-first refactor. It does not replace the current root experience yet.

## Coordinate system

- World space is right-handed.
- `+X` points right.
- `+Y` points up.
- `-Z` points forward from the recentered head pose.
- MediaPipe image landmarks are converted into camera-space metres using the active camera FOV and an estimated palm-width depth model.
- Camera-space hand joints are rotated by the current recentered head orientation into world space.
- The world panel and objects are stored in the same world coordinate system.

## Tracking

- MediaPipe Tasks Vision Hand Landmarker runs entirely in the browser.
- `numHands` is set to `2`.
- Left/right identity combines handedness classification and wrist-position continuity.
- Hand depth is estimated from apparent palm width and is explicitly not millimetre-accurate hardware depth.
- Tracking inference is adaptive and never queues multiple simultaneous inference calls.
- Rendering interpolates the latest valid hand pose at the display refresh rate.

## Interaction

- Far interaction uses an index-finger ray intersecting the world-space panel plane.
- Near interaction uses fingertip proximity/poke crossing.
- Pinch transitions are stateful: start, held, release.
- Each hand can grab a separate cube.
- Both hands can grab one cube to move, scale, and rotate it.

## Current preview limitations

- Browser device orientation provides rotational head tracking, not absolute positional head tracking.
- Hand Z is estimated from monocular camera scale.
- The MediaPipe runtime/model are still loaded from their existing browser CDNs and should be vendored before a final offline-ready release.
- Physical iPhone testing is still required before promoting this preview to the root GitHub Pages build.
