# Pocket VR 1.0 RC1 — implementation report

Branch: `agent/pocket-spatial-os-030-c2`. Baseline: `e28e4b2`.
Build identity: `pocket-vr-1.0.0-rc.1`, visible as **Pocket VR 1.0 RC1**.
The original root and legacy entry points are retained. No service worker was added.

## What changed

- Welcome offers screen or headset use. Home starts immediately without camera, model, audio, fullscreen or motion permission completion. Optional motion has a 3.5 s wait; camera has 10 s; hand initialization has 12 s. Local module failures expose Reload. Three consecutive frame failures expose recovery.
- A real look/select tutorial has Skip and Replay. Landscape guidance, recentering, bounded view alignment and Reset are available. Hold the screen for Home; the dock offers Home, Library, Controls and Recenter. Controls includes Exit.
- A single Canvas renderer replaces the candidate's renderer patch chain. `scene/layout.js` supplies the visible bounds and targets. Reused original pictograms, shared design tokens, readable per-eye labels, restrained sage/teal materials and composed Studio, Observatory and Ocean scenes provide a coherent identity. No WebGL migration or new runtime framework was necessary.
- Input updates aim before pinch/dwell. Removed/disabled/occluded targets lose focus immediately. A deliberate pinch has one controlling hand; confidence/safety gates, loss/reacquisition rearming and original-target holds prevent duplicate or inherited interactions. Pointer cancellation is not a tap. Native fields isolate shortcuts.
- Library has native search, All/Favourites/Recent/Media/Utility/Labs, actual recency ordering, add/remove saved apps, safe persistence, empty states and pagination covering the full catalogue.
- Window transforms change the actual app surface and hit bounds. Arrange exposes move, resize, pin, snap, smaller/larger and close. Switcher previews are explicitly labelled and include useful time/photo information. Budget: Home plus at most two apps; inactive media pauses; expensive scenes render only when active. There are no fake secondary app windows.
- Cinema follows load/data/play/wait/pause/end/error events, preserves aspect and eye crop, has trusted playback recovery, timeline/seek, screen size/distance, hide/show controls, room brightness and honest system-volume guidance. Unsupported curved-screen and software-volume controls are absent. A tiny original H.264 fixture and SVG fallback verify eye mapping.
- Gallery reaches every photo in a batch of up to 48, preserves aspect/orientation through browser image decoding, reports load/decode errors and supports grid/single/slideshow. Decode is serialized, visible images are downsampled to at most 1024×768, and only the current six tiles or current/next image are retained. One full source image may temporarily exist during decode. New selection/close revokes URLs; selection is not claimed to survive reload.
- Music uses a real analyser, one shared AudioContext, trusted activation/resume, actual playback/error state, three visual modes and no microphone request.
- Focus catches up elapsed monotonic time after throttling/backgrounding, explicitly starts/pauses/resets and signals completion on resume if background execution was suspended. Clock uses local device time. Settings validates storage, supports appearance/accessibility/performance and resets only Pocket preferences.
- Planetarium has selectable planets, descriptions and time controls labelled illustrative. Portal changes into real composed destinations and returns. Hologram has distinct procedural ship/orb/cube studies. Mini Worlds has inspectable city/island/forest dioramas. Arcade has instructions, a 30 s round, one-hit scoring, results and restart. Labs remain explicitly experimental procedural experiences.
- Camera, tracker, wake lock and audio suspend on hide/exit. A late permission result is stopped before video attachment. Model completion after cancellation is disposed. Safari's canonical tracker and continuous timer path are preserved. Existing inference is serial on the main thread; the worker path already enforces one in-flight frame.
- The shared adaptive filter now responds to sustained displacement after its raw derivative settles. Invalid orientation events no longer count as sensor samples. Shared regressions pass.

## Validation and evidence

Baseline: 56/56 candidate tests; 28/29 shared tracking tests. Both baseline screenshots are saved separately.

Final commands (from repository root unless noted):

```sh
node --test pocket-os-030/tests/*.test.js
node --test pocket-vr-next/tests/*.test.*
cd pocket-os-030
node scripts/check.mjs
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec playwright install chromium webkit
node scripts/serve.mjs
# In another terminal, same directory:
node scripts/browser-qa.cjs
node scripts/build.mjs
```

On this Windows workstation the browser command used `POCKET_BROWSER_CHANNEL=msedge` for Chromium and `PLAYWRIGHT_BROWSERS_PATH` for the downloaded WebKit binary. The exact run output accompanies the handoff. Playwright 1.62.1 and Prettier 3.6.2 are pinned in `pnpm-lock.yaml`. Browser QA uses real pointer/native input actions, with read-only coordinate/state inspection enabled only by `?qa=1`. Mocked API/lifecycle cases are identified in the results. Physical sensors are not simulated evidence of hardware acceptance.

Candidate unit tests: **68/68**. Shared tracking: **29/29**. All candidate JavaScript syntax checked. Browser flows and captured renders cover cold entry/tutorial, no camera request, search, persistence, 13-photo paging/cache bounds, window transforms/pinning, media errors, H.264 and WAV playback in Chromium, the spatial experiences, real stereo pixel mapping in both directions, viewport changes, pointer cancellation, module recovery and pending-motion fallback. Screenshot names and exact outcomes are in `browser-results.txt` and the QA folder.

**Windows WebKit media limitation:** this engine advertises codecs but rejects the committed H.264 video and generated WAV. Its tests validate the visible error paths and static stereo fallback, not successful media playback. Safari on the actual iPhone remains an acceptance gate.

## Build and deployment

`node scripts/build.mjs` produces `pocket-os-030/dist/` containing the candidate plus the required sibling `pocket-vr-next/core` and `tracking` paths. Serve/upload the **whole dist folder**, retaining both siblings. It is a static build: no account, paid backend, Xcode or installation is required.

The existing HTTPS candidate URL was checked on 2026-10-27 and returned HTTP 200 with title `Pocket VR - POCKET OS 0.3 C1-H1-I1`. It is **not this RC**. Remote heads still matched the inspected baseline before committing. The repository has test workflows and main-only Pages smoke checking, but no configured branch preview deployment. This change adds downloadable CI evidence/static artifacts; it does not change production hosting or merge main.

Minimal independent HTTPS setup: download/extract the static artifact; create a separate user-owned static-host site or preview repository; publish its dist root unchanged; open `/pocket-os-030/`. A GitHub Pages preview repository can use a `gh-pages` branch with those extracted files at its root and Pages set to that branch. Do not redirect the existing production repository's Pages settings. Once published, verify the visible RC1 label, both eye canvases, JavaScript/SVG/MP4 MIME types, no service-worker controller and direct nested URL loading before device acceptance.

## Remaining limitations

Physical motion orientation/latency in both landscapes, headset optics/comfort, pinch reliability, Safari codec/trusted activation behavior, real camera interruptions, thermal endurance and 10-minute mixed tracking/media sessions have not been tested here. Canvas surfaces use world-projected centres and conservative billboard presentation rather than full perspective-correct WebGL meshes. Tracking still depends on optional external model/CDN downloads. No spatial anchors, room reconstruction, DRM embedding or navigation-safety claims are made. No HTTPS RC preview is claimed until an isolated host is configured and checked.

## API references checked

- https://www.w3.org/TR/orientation-event/ — trusted permission requests and actual sample handling.
- https://w3c.github.io/mediacapture-main/ — permission requests and stream/track lifetime.
- https://html.spec.whatwg.org/multipage/media.html — media readiness/events and play promises.
- https://playwright.dev/docs/browsers — engine-specific browser installation and codec limits.
