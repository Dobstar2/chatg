# Pocket VR Spatial OS Changelog

## 0.3.0-candidate.1

### Interaction

- Promoted head/view aim to the primary navigation pointer.
- Added smart angular target assistance and target stickiness.
- Added unified InputManager actions.
- Added either-hand pinch confirmation.
- Added pinch hold/release states.
- Added touch-to-confirm fallback.
- Added optional dwell selection.
- Added keyboard and browser Gamepad API development/control paths.
- Kept precise hand position out of primary UI targeting.

### System

- Added Pocket Home.
- Added compact Dock.
- Added App Library with featured/recent/favourite concepts.
- Added Quick Settings.
- Added App Switcher.
- Added bounded spatial windows and gaze/head-driven move mode.
- Added notifications.
- Added compact status UI and premium centre reticle states.
- Added environment selection.
- Added system audio feedback.
- Added PerformanceManager with adaptive quality reduction.
- Added one candidate CameraCoordinator.
- Added capability checking.

### Apps

- Added Planetarium.
- Added Pocket Cinema.
- Added Portal.
- Added Hologram Lab.
- Added Target Rush Arcade.
- Added Music Room.
- Added Passthrough / Quick Peek foundations.
- Added Mini Worlds.
- Added Gallery.
- Added Browser launcher.
- Added Clock.
- Added Settings.
- Added Tracking Lab.
- Added Labs.
- Added System Info.

### Cinema

- Added normal 2D source rendering.
- Added real SBS-LR source-half-to-eye mapping.
- Added SBS-RL eye reversal.
- Added play/pause.
- Added seek.
- Added volume cycling.
- Added screen size and distance.
- Added lightweight curved-screen mode.

### Reliability

- Candidate is isolated under `pocket-os-030/`.
- Production root remains unchanged during development.
- Candidate does not register a service worker.
- Added GitHub Pages-safe relative paths.
- Added authoritative build constant and matching launch label.
- Added automated syntax and regression CI.

### Validation

- GitHub Actions PR CI: syntax check passed.
- GitHub Actions PR CI: regression suite passed.
- Physical iPhone acceptance remains required before production-root promotion.
