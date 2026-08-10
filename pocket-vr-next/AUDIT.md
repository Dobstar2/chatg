# Existing SpatialHands audit — tracking first

## What was already working

- Rear-camera capture and browser permission flow.
- MediaPipe Tasks Vision hand landmarks in the browser.
- Device-orientation head rotation.
- A split stereo presentation and pinch-driven controls.
- Static GitHub Pages deployment.

## Root causes found in the current root build

1. **One-hand model configuration.** The current tracker is configured for one hand, which prevents independent left/right state.
2. **Large shared runtime.** Camera selection, hand inference, gesture logic, rendering, interaction, audio, and UI actions are tightly coupled in one script, making duplicated loops and regressions difficult to isolate.
3. **Screen-space hand rendering.** The current hand skeleton is primarily drawn from normalized image landmarks, so the hand behaves like an overlay rather than a consistent world-space object.
4. **Competing anchor patches.** Multiple historical camera/HUD/world-lock modules remain in the repository. Even when only some are loaded, the architecture makes it easy for more than one system to write transforms.
5. **Monocular depth is not named or calibrated as an estimate.** A reliable browser fallback needs explicit palm-scale calibration, bounds, filtering, and separate hand recalibration.
6. **Interaction is single-target and single-hand oriented.** The current pinch selection path does not provide independent per-hand targets, grabs, or two-hand object manipulation.
7. **No production path tests.** Relative imports, model/WASM URLs, and subdirectory hosting were not covered by automated checks.

## Refactor direction in this preview

- One head-tracking manager owns the recentered head quaternion.
- One camera manager owns rear/0.5 preference and FOV metadata.
- One two-hand manager owns left/right identity, 21 joints per hand, estimated depth, loss/recovery, confidence, velocity, gestures, targets, and grab state.
- One interaction manager owns near/far selection and one/two-hand object manipulation.
- One stereo renderer owns both eye views.
- The render loop runs independently from adaptive hand inference.
