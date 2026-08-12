# Pocket VR Spatial OS 0.3 Candidate — Implementation Report

## Release identity

- Build: `pocket-spatial-os-0.3.0-candidate.1`
- Visible label: `POCKET OS 0.3 C1`
- Development branch: `agent/pocket-spatial-os-030`
- Protected starting commit: `799cb14511f00f9bb1f2c764866acc4e8d9eb471`
- Production root at the start of this work: Hand Fix 0.2.2 / Safari Timer
- Candidate directory: `pocket-os-030/`
- Service worker registration: **none**

## Why this candidate exists

The primary operating model has been changed from hand-position aiming to an intentional head-aim interaction system:

**LOOK → TARGET → PINCH / TAP → SELECT**

Precise hand XYZ data is now visual/experimental input rather than the authoritative pointer for normal Pocket VR navigation.

## Architecture implemented

### HeadAimController

- centre-view spatial targeting
- angular target tolerance
- target priority scoring
- target distance contribution
- target-size assistance
- persistence/stickiness hysteresis
- no visible camera snapping

### InputManager

Normalises:

- head aim
- left-hand pinch
- right-hand pinch
- pinch hold
- pinch release
- touch confirmation
- dwell selection
- keyboard development controls
- Gamepad API buttons/axes

into standard interaction actions.

### AppManager

- app manifests
- launch/focus/close
- recents
- favourites
- maximum running-app budget
- transient system surfaces which do not consume normal app slots

### WindowManager

- floating window state
- focus
- close
- snap positions
- gaze/head-driven move mode
- bounded resize mode
- secondary-window performance gating

### CameraCoordinator

- one camera owner for the candidate runtime
- explicit camera state
- tracking/passthrough state transitions
- camera failure remains non-fatal to the OS

The current browser implementation uses the same available rear camera stream for tracking/passthrough where possible rather than claiming unsupported simultaneous-camera behaviour.

### PerformanceManager

- render FPS sampling
- Quality / Balanced / Performance modes
- automatic quality reduction after sustained low FPS
- DPR cap reduction before changing interaction semantics
- particle and secondary-window reductions in Performance mode

### NotificationCenter + SystemAudio

- short non-stacking spatial notification capsules
- restrained target/select/open/back audio feedback
- audio can be disabled

## Spatial operating system surfaces

Implemented:

- Home
- compact Pocket Dock
- App Library
- Quick Settings
- App Switcher
- status capsule
- premium centre reticle states
- recent apps
- favourites
- bounded multitasking
- secondary spatial windows
- settings
- system information
- Tracking Lab
- Labs

Normal HUD intentionally remains small.

## Flagship experiences implemented

### Pocket Cinema

- browser-compatible local video picker
- 2D playback
- SBS left/right playback
- SBS right/left playback
- independent source crop for each eye
- play/pause
- ±10 second seek
- volume cycle
- screen size
- screen distance
- flat screen
- lightweight curved screen strips
- controls can be hidden while watching

### Planetarium

- Sun
- Mercury, Venus, Earth, Mars, Jupiter and Saturn
- animated orbital positions
- time speed control
- pause/reset
- gaze-selectable planets
- planet focus transition and information

This is a lightweight educational/procedural representation, not an astronomical ephemeris.

### Portal

- spatial portal gallery
- Deep Space
- Ocean
- Dreamscape
- smooth visual transition state
- simple discoveries

### Hologram Lab

- stereo-projected model view
- rotation
- zoom
- model cycling
- auto rotate
- wireframe option
- direct hand manipulation remains experimental rather than required

### Arcade — Target Rush

- gaze-targeted spatial orbs
- pinch/touch confirmation
- score
- respawning targets
- restart

### Music Room

- browser-compatible local audio
- Web Audio analyser where available
- Rings, Tunnel and Calm visual modes
- performance-limited visualisation

### Passthrough / Quick Peek foundation

- live camera background
- Pocket VR HUD over camera
- brightness overlay control
- lightweight visual effects
- Quick Peek state
- explicit return to VR
- no claim of room reconstruction, physical anchors or safety certification

### Mini Worlds

- multiple floating diorama targets
- gaze selection
- expanded environment state
- return to the world shelf

## Additional apps

- Gallery with local image picker
- Browser launcher using the normal iPhone keyboard/address input and external Safari opening
- Clock
- Settings
- Tracking Lab
- Labs
- System Info

External websites are not falsely assumed to be iframe-embeddable.

## Hand tracking policy

Tracked hands remain useful for:

- pinch recognition
- hand presence
- simplified hand visualisation
- experimental features

Hand position no longer drives the primary navigation reticle.

Either hand may generate the primary pinch confirmation.

If hand tracking is missing, screen tap can still activate the current head target.

## Automated validation

GitHub Actions workflow: `Pocket OS 0.3 Candidate`

PR CI run #2 completed successfully:

- Syntax check: **PASS**
- Regression tests: **PASS**

The regression suite currently covers:

- centre head targeting
- disabled target exclusion
- head target angular rejection
- target priority
- target stickiness
- single-select pinch behaviour
- right-hand-only pinch
- pinch hold
- tracking-loss release
- touch confirmation
- dwell confirmation
- keyboard SELECT mapping
- app launch/recents
- transient system surfaces
- system back behaviour
- running-app budget
- window snapping
- bounded head-driven window movement
- resize limits
- 2D cinema eye mapping
- SBS-LR eye mapping
- SBS-RL eye mapping
- SBS aspect handling
- cinema format cycling
- flagship app catalogue
- compact dock constraints
- build-label consistency
- absence of candidate service-worker registration
- GitHub Pages-safe relative paths

## What has NOT been claimed as complete

The following require physical iPhone Safari/headset testing and are not marked as verified yet:

- perceived head-aim latency on iPhone 17
- real pinch reliability after extended use
- camera thermal behaviour
- Safari permission edge cases
- actual headset optical comfort/IPD fit
- local video codec compatibility for arbitrary user files
- sustained media + ML + rendering thermal performance
- Add to Home Screen behaviour
- real-world passthrough camera latency
- whether the existing historical `/chatg/` service-worker state on a previously contaminated device must be manually cleared

## Release safety

The production root was intentionally not modified by candidate development.

The safe promotion strategy is:

1. merge the additive `pocket-os-030/` candidate path
2. test that exact path on the real iPhone
3. fix candidate-only issues
4. only after physical acceptance, consider changing the root entry point

## Next engineering priorities

1. Physical iPhone acceptance testing
2. Tune head-target angular tolerance and stickiness from real headset data
3. Tune pinch thresholds only if necessary; do not return to hand-position aiming
4. Validate long-session thermal behaviour
5. Improve camera switching only where Safari exposes reliable behaviour
6. Expand flagship apps after controls remain stable
7. Keep advanced hand-position experiments isolated in Labs
