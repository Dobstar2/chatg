# Pocket VR 0.3 Candidate — Physical iPhone Acceptance

Do not mark these items as passed unless they are tested on the real target iPhone in Safari/WebKit or Add to Home Screen mode.

## Build identity

- [ ] Launch screen visibly says `POCKET OS 0.3 C1`.
- [ ] Browser title matches the same build.
- [ ] Reloading the candidate path does not show Safari Timer / Fix E / another older build.

## Head aim

- [ ] Slow left/right head movement keeps the centre reticle stable.
- [ ] Slow up/down movement is stable.
- [ ] Fast movement does not create intolerable lag.
- [ ] Looking between adjacent buttons does not flicker continuously.
- [ ] A highlighted target remains sticky through tiny involuntary head movement.
- [ ] Looking clearly at a new target changes the highlight promptly.
- [ ] The camera/view itself never visibly snaps to assisted targets.
- [ ] Recenter makes the current view direction the new forward direction.
- [ ] Landscape-left orientation behaves correctly.
- [ ] Landscape-right orientation behaves correctly.

## Pinch confirmation

- [ ] Left hand alone can select.
- [ ] Right hand alone can select.
- [ ] Either hand can disappear and the OS remains usable.
- [ ] Returning hand tracking restores pinch without restarting the OS where the tracker supports reacquisition.
- [ ] 20 deliberate pinches produce approximately one activation per pinch.
- [ ] Holding a pinch does not repeatedly click the target.
- [ ] Long pinch produces one hold state.
- [ ] Release exits hold/move mode.
- [ ] Visible hand jitter does not move the primary reticle.

## Touch fallback

- [ ] With no hands visible, look at a target and tap the screen to activate it.
- [ ] The tap does not need to land directly on the virtual button.
- [ ] Drag-to-look works when Device Orientation permission is unavailable.
- [ ] Normal iPhone keyboard appears for the Browser address field.
- [ ] Video/audio/image file pickers open only from the trusted touch action bar.

## Home / system navigation

- [ ] Home is readable without a giant permanent developer HUD.
- [ ] Pocket Dock targets are comfortably selectable.
- [ ] Library opens and launches apps.
- [ ] Quick Settings opens and closes cleanly.
- [ ] App Switcher changes focus.
- [ ] Home / Back controls remain available in immersive apps.
- [ ] No immersive app traps the user.
- [ ] Notifications disappear automatically.

## Cinema

### 2D

- [ ] Choose a browser-compatible 2D video.
- [ ] Both eyes receive the same full source image.
- [ ] Play/Pause works.
- [ ] -10s / +10s seek works.
- [ ] Volume control works.
- [ ] Screen size changes.
- [ ] Screen distance changes.
- [ ] Flat/Curved changes rendering without major frame loss.

### SBS-LR

- [ ] Load known left/right SBS test footage.
- [ ] Left eye receives only the left source half.
- [ ] Right eye receives only the right source half.
- [ ] Stereo depth direction looks correct.

### SBS-RL

- [ ] Reverse-eye SBS mode swaps the two source halves correctly.

## Planetarium

- [ ] Planet targets highlight by gaze.
- [ ] Pinch/tap enters planet focus.
- [ ] Pause, speed and reset controls work.
- [ ] Return from planet focus works.
- [ ] Frame rate remains comfortable.

## Portal

- [ ] Deep Space portal opens.
- [ ] Ocean portal opens.
- [ ] Dreamscape portal opens.
- [ ] Portal transition is visually smooth enough for headset use.
- [ ] Return control is always available.

## Hologram Lab

- [ ] Rotate left/right works.
- [ ] Zoom works.
- [ ] Model cycling works.
- [ ] Auto rotate toggles.
- [ ] Wireframe toggles.

## Arcade

- [ ] Targets are comfortable to acquire with head aim.
- [ ] Select feedback feels immediate.
- [ ] Score increments once per target.
- [ ] New target appears after hit.
- [ ] Restart works.

## Music Room

- [ ] Local browser-compatible audio can be chosen.
- [ ] Playback works after the required trusted tap.
- [ ] Visuals respond to real audio spectrum.
- [ ] Visuals do not make audio stutter.
- [ ] Mode switching works.

## Mini Worlds

- [ ] Multiple dioramas are visible/selectable.
- [ ] Selected world expands.
- [ ] Return to Mini Worlds works.

## Gallery / Browser / utilities

- [ ] Gallery local image picker works.
- [ ] Selected images remain local to the page unless the user explicitly opens another action.
- [ ] Browser address entry uses native keyboard.
- [ ] Browser opens external page in Safari instead of pretending blocked sites can be embedded.
- [ ] Clock displays local device time.
- [ ] System Info only displays web-observable information.
- [ ] Tracking Lab debug details remain out of normal Home.

## Passthrough / Quick Peek

- [ ] Camera image appears without an avoidable frozen frame.
- [ ] Pocket UI remains readable over camera image.
- [ ] Brightness overlay changes readability.
- [ ] Quick Peek has a clear Return to VR target.
- [ ] If pinch becomes unavailable, touch remains usable.
- [ ] Returning to VR restores normal virtual environment.
- [ ] No UI calls passthrough Quest-quality room reconstruction or safety-certified vision.

## Performance / endurance

- [ ] Run for at least 10 minutes without steadily increasing interaction latency.
- [ ] Run Cinema for at least 10 minutes.
- [ ] Run tracking + Planetarium/Arcade for at least 10 minutes.
- [ ] No unbounded notification accumulation.
- [ ] No growing inference queue is visible in Tracking Lab.
- [ ] Performance mode reduces render cost before breaking input.
- [ ] Secondary windows reduce/disable in Performance mode.
- [ ] Device heat is monitored subjectively and severe thermal degradation is recorded.

## Safari lifecycle

- [ ] Background Safari for 10 seconds and return.
- [ ] Head tracking resumes.
- [ ] Hand tracker resumes/reacquires where supported.
- [ ] Candidate does not require a full reload after ordinary background/foreground.
- [ ] Rotate away and back to landscape without permanently breaking stereo canvas sizing.
- [ ] Browser chrome / VisualViewport changes do not leave a black strip over one eye.

## Deployment / cache

- [ ] Candidate URL loads directly from GitHub Pages.
- [ ] Hard reload still loads the candidate.
- [ ] Candidate itself registers no service worker.
- [ ] Existing historical Pocket Spatial worker does not replace candidate content on the test device.
- [ ] If historical site data must be cleared, record that as a migration requirement before any root promotion.

## Promotion rule

Only promote the candidate to the production root after the control, Cinema, lifecycle and deployment sections are acceptable on the real iPhone.
