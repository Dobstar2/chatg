# Asset provenance and network dependencies

- Welcome SVG scene, Studio/Observatory/Ocean procedural scenes, dioramas and stereo fixtures: original work for this contribution. New standalone SVG/MP4 fixtures and welcome artwork are dedicated under CC0-1.0. No photographed persons, brands, remote images or copied commercial assets are used.
- `scene/icons.js` draws the existing repository's Pocket VR pictograms as a normal utility, extracted from `renderer-icons-v1.js`; no external icon font is required.
- `assets/stereo-test.mp4`: 640×180, two original red/blue LEFT/RIGHT panels, about 2.4 seconds, silent H.264. Recreate with `node scripts/make-fixture.cjs` in an H.264-capable Chromium browser. The committed fixture is sufficient; regeneration is optional.
- `assets/stereo-test.svg`: matching static fallback, also usable when a browser has no video decoder.
- Optional hand tracking dynamically requests MediaPipe Tasks Vision **0.10.35**, its WASM files from `cdn.jsdelivr.net`, and the versioned Google hand-landmarker float16 model from `storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`. Existing shared runtime URLs are preserved. MediaPipe software is Apache-2.0; upstream license/model documentation remains authoritative. These downloads begin only after enabling pinch camera. CDN failure leaves touch usable.
- No camera frames, photo files, audio or video files are uploaded. Blob URLs and decoded image surfaces are local to this page. Browser launcher explicitly opens a user-entered external website, which then has its own network behavior.
- Build/test-only packages are pinned in `pnpm-lock.yaml`: Playwright and Prettier. The static app has no new package-install requirement.
