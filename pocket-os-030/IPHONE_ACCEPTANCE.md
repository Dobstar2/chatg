# Pocket VR 1.0 RC1 — iPhone acceptance

All boxes below remain unchecked. Desktop Chromium/WebKit and mocked API tests do not establish physical iPhone acceptance.

## Open the right build

- [ ] Use a verified isolated HTTPS preview ending in `/pocket-os-030/`.
- [ ] Welcome, title and About identify **Pocket VR 1.0 RC1** (`pocket-vr-1.0.0-rc.1`).
- [ ] Fresh/private tab and reload show this candidate, not the current live C1.
- [ ] No historical root worker redirects or intercepts the candidate. Record Safari website-data migration only if needed; do not clear unrelated origin data.
- [ ] Direct nested paths load scripts, fixture, worker/WASM/model dependencies with correct MIME types. No mixed content.

## Startup and controls

- [ ] Try on screen works without camera/motion permission; tap actual controls and drag empty space.
- [ ] Headset entry remains usable if motion is denied or ignored, or permission grants without samples.
- [ ] Landscape-left and landscape-right axes, recenter, sensor staleness and drag/resume transitions feel correct.
- [ ] Tutorial highlights/selects, skips and replays. Hold screen for Home works even when facing away.
- [ ] Home, Library, Controls, Recenter and Exit remain reachable from every app.
- [ ] Per-eye text is readable in the actual lenses; alignment limits/Reset are useful and comfortable.
- [ ] Assistance never turns the camera. Dwell shows progress, cancels on gaze departure and does not repeat.
- [ ] Touch cancellation and typing in search/address fields do not select or trigger VR shortcuts.

## Optional camera and pinch

- [ ] Camera starts only after explicitly enabling pinch/passthrough.
- [ ] Cancel/exit/background during ignored permission/model download cannot later activate hardware.
- [ ] Denied camera, offline CDN/model, interrupted track and Retry remain recoverable.
- [ ] 20 deliberate left-hand pinches and 20 right-hand pinches each give one activation per pinch.
- [ ] Holding never repeats; moving gaze keeps a hold on its original target.
- [ ] Tracking loss releases manipulation; return while pinched cannot click until opened/rearmed.
- [ ] A second hand cannot steal, duplicate or release the controlling hand's action.
- [ ] Pinch remains reliable after 10 minutes. Record actual latency/inference measurements.

## Shell and windows

- [ ] Search, all categories, every Library page, saved apps and actual recency order work/persist.
- [ ] Empty searches and empty saved/recent states are clear.
- [ ] Move/resize/snap/scale change the actual surface and its targets; pin prevents movement/resize.
- [ ] Close removes the app, targets and media resources. Switcher focuses/clears labelled previews.
- [ ] Home plus two-app budget stays responsive in each quality mode.
- [ ] Reduce Motion, Solid Surfaces, High Contrast and room brightness affect actual Canvas output.

## Local media

- [ ] Cinema opens representative iPhone MP4/H.264/AAC files and handles unsupported files clearly.
- [ ] Play rejection exposes a browser-trusted tap. Play/pause, buffering, seek, ended and replacement work.
- [ ] Original stereo fixture: LR sends red LEFT only to left eye and blue RIGHT only to right; RL swaps. 2D sends the full image to both.
- [ ] Aspect, size, distance, hide/show controls and iPhone volume buttons behave correctly. Room brightness leaves movie pixels unchanged.
- [ ] Gallery handles landscape/portrait/EXIF photos, bad images, >6 photos, every page, single view and slideshow without stretching.
- [ ] Closing/replacing large photo batches remains within memory limits. Reload honestly asks for reselection.
- [ ] Music local MP3/AAC/WAV plays after a trusted tap. Visual response uses actual audio. Background/suspended AudioContext recovers on tap.

## Experiences and lifecycle

- [ ] Focus start/pause/reset/completion and catch-up after backgrounding work; Clock shows correct local time.
- [ ] Planet selection, descriptions and time controls are comfortable and labelled illustrative.
- [ ] Portal destinations/return, Hologram models/zoom/rotation, Mini Worlds expansion/return work.
- [ ] Arcade starts, scores once, ends after 30 s, shows results and restarts.
- [ ] Passthrough uses available mono camera, survives interruption/retry and exits. Stay seated; delayed feed is not a navigation aid.
- [ ] External Browser uses native entry and opens a separate tab; return preserves the workspace.
- [ ] Safari background/foreground, pagehide/pageshow, back-forward navigation, orientation and toolbar/VisualViewport changes recover.
- [ ] Fullscreen/orientation/wake-lock rejection does not block use. Exiting releases camera/audio/wake lock.
- [ ] Run Cinema 10 minutes, tracking + a scene 10 minutes and repeated app/media replacement. Record comfort, memory pressure, frame rate and subjective heat honestly.

No production-root promotion or 1.0 final label until these checks pass on the target iPhone/headset. The owner-private RC preview is https://pocket-vr-rc1-20261027.angel-accoun-7378.chatgpt.site. It was checked in desktop Chromium/WebKit. The existing public GitHub Pages candidate still serves C1. All physical-device boxes remain pending.
