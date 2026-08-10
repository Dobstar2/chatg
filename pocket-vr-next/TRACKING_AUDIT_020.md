# Pocket VR Hand Tracking Audit — 0.2.0

## Scope

Target: modern iPhone Safari/WebKit on GitHub Pages, with two hands treated as independent controllers.

This document separates code-level findings from physical-device acceptance. No physical iPhone result is claimed here unless it has actually been measured on the production Pages URL.

## Before — tracking-foundation 0.1.x

### Model and camera path

- MediaPipe Tasks Vision Hand Landmarker 0.10.14.
- `runningMode: VIDEO`, `numHands: 2`.
- The rear camera is passed directly to `detectForVideo(video, timestamp)`; there is no canvas copy in the tracking path.
- Camera request is 640×480-ish, capped at 960×720 and 30 FPS, with rear/0.5× preference.

### Inference scheduling

- Inference used a `setTimeout` polling loop.
- Base interval was 66 ms; adaptive interval was bounded to 48–110 ms.
- Because the next timer was scheduled only after synchronous `detectForVideo()` returned, there was no unbounded inference queue.
- There was no browser video-frame callback, camera-frame freshness metric, or dropped-frame metric.

### Identity

- Handedness plus wrist-position continuity were used.
- A two-detection direct-vs-swapped assignment existed, but there was no wrist-velocity prediction and the handedness mismatch penalty could still influence unstable frames strongly.

### Coordinate conversion and depth

- Root depth was estimated almost entirely from one cue: apparent index-MCP-to-pinky-MCP palm width.
- The conversion multiplied normalized palm distance by video width, which did not account for the vertical pixel scale of diagonally separated landmarks.
- Depth used exponential smoothing with a 55/85 ms time constant depending on the size of the jump.
- Per-landmark X/Y/Z were then projected from the same root depth with a normalized landmark-Z offset.
- MediaPipe world landmarks were collected but were not used to stabilize local hand geometry.

### Temporal filtering and rendering

- Every joint used the same exponential smoothing time constant (42 ms).
- Wrist, palm, fingertips, depth, and ray direction therefore had the same basic filtering strategy despite different noise/latency requirements.
- The rendered pose only changed when a new inference result changed the filtered landmarks; there was no render-time prediction/interpolation state.

### Gesture detection

- Pinch was normalized by palm width and already had hysteresis: start at 0.34, release at 0.54.
- Pinch transitions used a serial so a held pinch did not intentionally create repeated `PinchStart` events.
- Gesture confidence was not connected to tracking quality, so a poor frame could still influence transitions.

### Interaction

- Near UI, far ray, pinch UI, poke and grabbing were handled in one hand-update method without an explicit high-level input state machine.
- Far ray direction used the index finger segment directly and had no separate ray filter.
- Button hit regions matched their visible bounds for direct selection; far aim assistance was minimal.
- Poke used an absolute plane distance, which loses which side of the plane the fingertip is on.
- Grab contact offset was already preserved.
- Release velocity/throw physics did not exist.
- Two-hand midpoint/scale/rotation existed but did not use explicit interaction states and had limited smoothing.

## After — tracking-controls 0.2.0

### Authoritative pipeline

The active root build now has one hand pipeline:

Camera frame
→ MediaPipe detection
→ temporal left/right assignment
→ raw landmarks
→ quality validation
→ multi-cue depth / camera-space conversion
→ adaptive temporal filters
→ velocity estimation
→ stable gesture state
→ interaction pose
→ short visual prediction
→ world transform
→ interaction state machine
→ stereo rendering

Old 0.1 tracking files remain in the repository for history but are not imported by the 0.2 root app.

### Fresh-frame scheduling

- Uses `HTMLVideoElement.requestVideoFrameCallback()` when available and falls back to a short timer when not.
- Registers the next frame callback after processing instead of queuing work.
- Processes the newest delivered video frame and skips duplicate media times.
- Tracks presented-frame gaps, browser-frame freshness, inference duration and an estimated tracking-to-render delay.
- Adaptive inference interval is 42–88 ms and is based on measured inference duration.

### Stable two-hand identity

- Each side keeps independent image-space wrist position and velocity.
- Assignment compares the next detection against predicted wrist location.
- Handedness remains useful evidence but a single contradictory handedness frame is not enough to override strong spatial continuity.
- Left/right tracking, gesture, quality, target, interaction state and grab state are independent.

### Tracking quality

Each hand exposes a quality score and user-facing quality state:

- Excellent
- Good
- Limited
- Lost

The quality heuristic combines handedness confidence, wrist-motion continuity, field-of-view edge proximity and usable palm size.

Low quality disables precise interaction before the visual hand is immediately removed. Short loss persists/fades the pose; longer loss removes it.

### Depth and root transform

- Palm width is measured in true pixel X/Y distance rather than normalized distance multiplied only by width.
- Palm length (wrist→middle MCP) is a second independent root-depth cue.
- The robust median of width-depth and length-depth is used as the raw monocular depth estimate.
- A dedicated depth filter rejects implausible one-frame Z steps and applies stronger filtering to depth than lateral motion.
- MediaPipe world-landmark local Z is used when available to stabilize the finger skeleton around the root instead of allowing the entire hand to breathe with one normalized Z value.
- Each hand now exposes a root transform: palm-center position, side/up/forward basis and stabilized hand scale.
- Finger joints are also stored relative to that palm root.

Depth is still monocular estimated depth, not hardware-measured depth.

### Adaptive filtering

- One-Euro-style adaptive filters replace one fixed smoothing value.
- Wrist/palm roots use steadier parameters.
- Fingertips use faster, more velocity-responsive parameters.
- Z uses separate stronger filtering parameters from X/Y.
- Confidence scales how strongly a new observation is trusted.
- Fast movement increases cutoff and follows the hand more directly; stationary movement remains steadier.

### Visual prediction

- Filtered interaction joints are kept separate from rendered visual joints.
- Rendering applies only a short 0–32 ms velocity prediction window.
- Prediction is bounded per joint so a tracking spike cannot produce a large visual overshoot.
- Interaction uses the stable filtered pose rather than relying entirely on the predicted visual pose.

### Gesture system

- Pinch remains normalized by palm width.
- Hysteresis is retained with separate start/release thresholds.
- Pinch ratio itself is adaptively filtered.
- Very low-quality frames cannot create a new pinch click.
- Continuous `pinchStrength` is available separately from `start / held / release` transitions.

### Far pointer

- Ray origin uses the filtered index MCP.
- Direction blends multiple index-finger segments instead of one raw segment.
- Origin and direction have a dedicated filter separate from visual-hand filtering.
- Far button selection has a modest expanded hit region and short target persistence; the visible ray is not snapped or bent.

### Near/far and input priority

Per-hand explicit states include:

- UNTRACKED
- IDLE
- NEAR_UI
- FAR_AIMING
- PINCHING_UI
- POKING
- GRABBING
- TWO_HAND_GRAB
- CALIBRATING

Priority is:

1. direct near UI
2. valid object grab
3. far-ray UI

Near/far mode uses different enter/exit thresholds so it does not flicker at one distance boundary.

### Poke controls

- Poke uses signed distance to the panel plane.
- The runtime tracks approach/contact/pressed/release state.
- A press fires on a plane-crossing transition and does not repeat every frame while the finger remains through the panel.

### Grabbing and throwing

- Pinch must begin on a plausible direct or clearly ray-targeted object.
- Contact offset is preserved, so the object does not teleport to the palm center.
- Release velocity uses a multi-frame velocity estimate, is clamped, and feeds bounded object motion.
- Two-hand scale has minimum-distance protection and bounded scale.
- Two-hand position/scale/rotation values receive modest smoothing.

### Debugging and measurement

Press the Debug button repeatedly to cycle:

- off
- metrics
- raw skeleton
- filtered skeleton
- raw + filtered skeleton

Debug metrics include:

- render FPS
- tracking FPS
- inference milliseconds
- browser frame freshness
- estimated tracking-to-render delay
- dropped camera frames observed
- tracking model
- camera resolution/lens
- performance mode
- head quaternion
- left/right quality
- left/right handedness confidence
- raw and filtered wrist XYZ
- raw and filtered depth
- pinch strength/ratio/phase
- gesture
- interaction state
- target
- reticle state

## Automated regression tests

`tests/tracking-controls-v020.test.mjs` covers:

- stationary-noise filtering and fast response
- depth-spike rejection
- one-start / held / one-release pinch behavior
- identity continuity through a contradictory handedness frame
- one-shot far pinch activation
- one-shot poke activation
- grab contact-offset preservation
- release-velocity clamping
- bounded two-hand scale
- velocity-spike clamping

CI also performs `node --check` on the new tracking/control modules.

## Physical iPhone 17 production acceptance — still required

The following must be measured on the real GitHub Pages URL before claiming the tracking project is finished:

1. stationary hand jitter
2. fast left/right motion latency
3. slow precise motion
4. depth motion
5. both hands independently
6. crossed-hand identity
7. 20 deliberate pinches
8. long held pinch
9. nearby button grid accuracy
10. direct poke presses
11. repeated object grabs
12. moderate throws
13. two-hand scale
14. one-hand loss while other remains active
15. smooth recovery
16. hand consistency while rotating device
17. sustained-session latency/thermal behavior
18. production GitHub Pages verification

Use Debug → metrics/raw/filtered/both during that acceptance pass and record the observed FPS, inference time, estimated delay, quality and failure cases. The code now has the instrumentation required to make a real before/after comparison instead of guessing.
