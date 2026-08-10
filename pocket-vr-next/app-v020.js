import { qRotateVec } from './core/math.js';
import { HeadTrackingManager } from './tracking/head-tracking.js?v=020';
import { CameraManager } from './tracking/camera-manager.js?v=020';
import { HandTrackingManagerV2 } from './tracking/hand-tracking-v020.js';
import { InteractionManagerV2 } from './scene/interaction-manager-v020.js';
import { StereoRenderer } from './scene/stereo-renderer.js?v=020';

const BUILD = 'tracking-controls-0.2.0';
const DEBUG_MODES = ['off', 'metrics', 'raw', 'filtered', 'both'];
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17],
];

function formatVec(v) {
  if (!v) return '-';
  return `${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}`;
}

class PocketVRApp {
  constructor() {
    this.video = document.getElementById('trackingVideo');
    this.leftCanvas = document.getElementById('leftEyeCanvas');
    this.rightCanvas = document.getElementById('rightEyeCanvas');
    this.stereoRoot = document.getElementById('stereoRoot');
    this.eyes = [...document.querySelectorAll('#stereoRoot > .eye')];
    this.startOverlay = document.getElementById('startOverlay');
    this.enterButton = document.getElementById('enterButton');
    this.startStatus = document.getElementById('startStatus');
    this.permissionList = document.getElementById('permissionList');
    this.buildLabel = document.getElementById('buildLabel');
    this.touchRecenter = document.getElementById('touchRecenter');
    this.touchCalibrate = document.getElementById('touchCalibrate');

    this.head = new HeadTrackingManager();
    this.camera = new CameraManager(this.video);
    this.hands = new HandTrackingManagerV2(this.video, this.camera);
    this.interaction = new InteractionManagerV2();
    this.renderer = new StereoRenderer(this.leftCanvas, this.rightCanvas, this.interaction);

    this.running = false;
    this.cameraInfo = null;
    this.statusText = 'WAITING';
    this.debugModeIndex = 0;
    this.lastHandCount = -1;
    this.lowFpsFrames = 0;
    this.lastDebugUpdateAt = 0;

    this._frame = this._frame.bind(this);
    this._syncViewportGeometry = this._syncViewportGeometry.bind(this);
    this._createDebugUi();
    this._bindEvents();
    this._stampBuild();
    this._syncViewportGeometry();
    requestAnimationFrame(this._frame);
  }

  _createDebugUi() {
    this.debugRoot = document.createElement('div');
    Object.assign(this.debugRoot.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '40',
      pointerEvents: 'none',
      display: 'none',
    });
    this.debugRoot.innerHTML = `
      <pre data-debug-eye="left"></pre>
      <pre data-debug-eye="right"></pre>
    `;
    [...this.debugRoot.querySelectorAll('pre')].forEach((pre, index) => {
      Object.assign(pre.style, {
        position: 'absolute',
        left: index === 0 ? '8px' : 'calc(50% + 8px)',
        top: '68px',
        width: 'calc(50% - 16px)',
        maxHeight: 'calc(100% - 78px)',
        overflow: 'hidden',
        margin: '0',
        padding: '7px',
        borderRadius: '10px',
        background: 'rgba(0,0,0,.78)',
        color: '#cfe4ff',
        font: '700 7px/1.28 ui-monospace, SFMono-Regular, Menlo, monospace',
        whiteSpace: 'pre-wrap',
      });
    });
    document.body.appendChild(this.debugRoot);

    this.debugCanvases = this.eyes.map((eye) => {
      const canvas = document.createElement('canvas');
      Object.assign(canvas.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        zIndex: '15',
        pointerEvents: 'none',
        display: 'none',
      });
      eye.appendChild(canvas);
      return canvas;
    });
  }

  _bindEvents() {
    this.enterButton.addEventListener('click', () => this.enter());
    this.touchRecenter.addEventListener('click', () => this.recenterHead());
    this.touchCalibrate.addEventListener('click', () => this.recalibrateHands());

    window.addEventListener('resize', this._syncViewportGeometry, { passive: true });
    window.addEventListener('orientationchange', () => {
      setTimeout(this._syncViewportGeometry, 80);
      setTimeout(this._syncViewportGeometry, 350);
    }, { passive: true });
    window.visualViewport?.addEventListener('resize', this._syncViewportGeometry, { passive: true });

    this.camera.addEventListener('status', (event) => {
      const labels = {
        permission: 'Camera permission requested',
        selecting: 'Selecting rear 0.5× camera',
        ready: 'Rear camera ready',
        stopped: 'Camera stopped',
      };
      this._setPermissionState('camera', labels[event.detail] || event.detail);
    });

    this.hands.addEventListener('status', (event) => {
      const labels = {
        'loading-model': 'Hand tracker loading',
        'ready-gpu': 'Two-hand tracker ready (GPU)',
        'ready-cpu': 'Two-hand tracker ready (CPU)',
        'ready-cached': 'Two-hand tracker ready',
      };
      this._setPermissionState('hands', labels[event.detail] || event.detail);
    });

    this.hands.addEventListener('error', (event) => {
      console.error('Hand tracking frame error', event.detail);
      this.statusText = 'TRACK RETRY';
    });

    this.hands.addEventListener('calibration-start', () => {
      this.statusText = 'CALIBRATING HANDS';
    });

    this.hands.addEventListener('calibrated', (event) => {
      const side = event.detail?.side?.toUpperCase() || 'HAND';
      this.statusText = `${side} CALIBRATED`;
      setTimeout(() => { if (this.running) this.statusText = 'READY'; }, 900);
    });

    this.hands.addEventListener('frame', (event) => {
      const hands = event.detail;
      const trackedSides = ['left', 'right'].filter((side) => hands[side]?.tracked);
      const count = trackedSides.length;
      if (count !== this.lastHandCount) {
        this.lastHandCount = count;
        const labels = ['Looking for hands', 'One hand detected', 'Two hands detected'];
        this._setPermissionState('hands', labels[count]);
      }
      if (count === 0 && this.running) this.statusText = 'TRACKING LOST';
      else if (count === 1) this.statusText = `${trackedSides[0].toUpperCase()} ${hands[trackedSides[0]].quality.toUpperCase()}`;
      else if (count === 2) this.statusText = `L:${hands.left.quality.toUpperCase()} R:${hands.right.quality.toUpperCase()}`;
    });

    this.interaction.addEventListener('action', (event) => {
      this._handleAction(event.detail.action, event.detail.side);
    });

    [this.leftCanvas, this.rightCanvas].forEach((canvas, eyeIndex) => {
      canvas.addEventListener('pointerdown', (event) => {
        if (!this.running) return;
        const rect = canvas.getBoundingClientRect();
        const action = this.renderer.hitTestUi(eyeIndex, event.clientX - rect.left, event.clientY - rect.top);
        if (action) this._handleAction(action, 'touch');
      });
    });

    window.addEventListener('pagehide', () => this.stop());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.statusText = 'PAUSED';
        this.hands.pause();
      } else if (this.running) {
        this.hands.resume();
        this.statusText = 'READY';
        this._syncViewportGeometry();
        // Do not carry stale release velocity across a background/foreground jump.
        for (const hand of Object.values(this.hands.getHands())) hand.velocity = { x: 0, y: 0, z: 0 };
      }
    });
  }

  async enter() {
    if (this.running || this.enterButton.disabled) return;
    this.enterButton.disabled = true;
    this.statusText = 'STARTING';
    this.startStatus.textContent = 'Starting fresh-frame two-hand tracking…';
    this._setPermissionState('motion', 'Motion permission requested');
    this._setPermissionState('camera', 'Camera permission requested');
    this._setPermissionState('hands', 'Waiting for camera');

    this._requestImmersiveMode();

    const [motionResult, cameraResult] = await Promise.allSettled([
      this.head.requestPermission(),
      this.camera.start(),
    ]);

    if (motionResult.status === 'fulfilled') {
      this.head.start();
      this._setPermissionState('motion', 'Head tracking ready');
    } else {
      console.warn('Motion permission unavailable', motionResult.reason);
      this._setPermissionState('motion', 'Head tracking denied — touch fallback active');
    }

    if (cameraResult.status === 'rejected') {
      this.startStatus.textContent = cameraResult.reason?.message || 'Rear camera failed to start.';
      this._setPermissionState('camera', 'Rear camera failed');
      this.enterButton.disabled = false;
      this.statusText = 'CAMERA ERROR';
      return;
    }

    this.cameraInfo = cameraResult.value;
    this._setPermissionState(
      'camera',
      this.cameraInfo.lens === 'rear-0.5'
        ? 'Rear 0.5× camera confirmed'
        : 'Rear camera ready — 0.5× requested where exposed'
    );

    try {
      await this.hands.initialize();
      this.hands.start();
      this._setPermissionState('hands', 'Looking for left + right hands');
    } catch (error) {
      console.error('Hand tracker failed to initialize', error);
      this._setPermissionState('hands', 'Hand tracker failed — touch fallback active');
      this.statusText = 'HAND MODEL ERROR';
    }

    this.running = true;
    this.startOverlay.classList.add('hidden');
    document.body.classList.add('running');
    this.statusText = 'SHOW BOTH HANDS';
    this._syncViewportGeometry();
    setTimeout(() => this.head.recenter(), 420);
  }

  stop() {
    this.running = false;
    this.hands.stop();
    this.head.stop();
    this.camera.stop();
  }

  recenterHead() {
    this.head.recenter();
    this.statusText = 'VIEW RECENTERED';
    setTimeout(() => { if (this.running) this.statusText = 'READY'; }, 900);
  }

  recalibrateHands() {
    const started = this.hands.recalibrateHands();
    this.statusText = started ? 'HOLD HANDS STEADY' : 'SHOW A HAND FIRST';
  }

  _handleAction(action, side) {
    switch (action) {
      case 'recenter':
        this.recenterHead();
        break;
      case 'recalibrate':
        this.recalibrateHands();
        break;
      case 'debug':
        this.debugModeIndex = (this.debugModeIndex + 1) % DEBUG_MODES.length;
        this._applyDebugMode();
        this.statusText = `DEBUG ${DEBUG_MODES[this.debugModeIndex].toUpperCase()}`;
        break;
      case 'reset-objects':
        this.interaction.resetObjects();
        this.statusText = 'OBJECTS RESET';
        break;
      case 'performance':
        this.statusText = `MODE ${this.renderer.togglePerformanceMode().toUpperCase()}`;
        break;
      case 'exit':
        this.stop();
        this.startOverlay.classList.remove('hidden');
        document.body.classList.remove('running');
        this.enterButton.disabled = false;
        this.enterButton.textContent = 'Re-enter Pocket VR';
        this.statusText = 'EXITED';
        this.lastHandCount = -1;
        break;
      default:
        this.statusText = `${action.toUpperCase()} · ${String(side).toUpperCase()}`;
        break;
    }
  }

  _frame(now) {
    const headOrientation = this.head.getOrientation();
    const handStates = this.hands.sampleForRender(now);

    for (const side of ['left', 'right']) {
      const hand = handStates[side];
      for (let i = 0; i < 21; i += 1) {
        hand.rawJointsWorld[i] = qRotateVec(headOrientation, hand.rawJointsCamera[i]);
        hand.jointsInteractionWorld[i] = qRotateVec(headOrientation, hand.jointsInteractionCamera[i]);
        hand.jointsWorld[i] = qRotateVec(headOrientation, hand.jointsCamera[i]);
      }
      hand.rayOriginWorld = qRotateVec(headOrientation, hand.rayOriginCamera);
      hand.rayDirectionWorld = qRotateVec(headOrientation, hand.rayDirectionCamera);
      hand.velocityWorld = qRotateVec(headOrientation, hand.velocity);
    }

    if (this.running) this.interaction.update(handStates, now);

    const metrics = this.hands.getMetrics();
    this.renderer.render({
      now,
      headOrientation,
      hands: handStates,
      cameraInfo: this.cameraInfo,
      trackingStats: {
        trackingFps: metrics.trackingFps,
        inferenceMs: metrics.inferenceMs,
      },
      statusText: this.statusText,
    });

    this._drawDebugSkeleton(headOrientation, handStates);
    this._updateDebugText(now, handStates, metrics, headOrientation);
    this._adaptivePerformance();
    requestAnimationFrame(this._frame);
  }

  _adaptivePerformance() {
    if (!this.running || !Number.isFinite(this.renderer.fps) || this.renderer.fps <= 0) return;
    if (this.renderer.fps < 43) this.lowFpsFrames += 1;
    else this.lowFpsFrames = Math.max(0, this.lowFpsFrames - 2);

    // Controls and tracking win over graphics. Drop renderer resolution before
    // changing the hand model cadence.
    if (this.lowFpsFrames > 100 && this.renderer.performanceMode === 'balanced') {
      this.renderer.togglePerformanceMode();
      this.lowFpsFrames = 0;
      this.statusText = 'AUTO PERFORMANCE';
    }
  }

  _applyDebugMode() {
    const mode = DEBUG_MODES[this.debugModeIndex];
    this.debugRoot.style.display = mode === 'off' ? 'none' : 'block';
    const skeletonVisible = ['raw', 'filtered', 'both'].includes(mode);
    this.debugCanvases.forEach((canvas) => { canvas.style.display = skeletonVisible ? 'block' : 'none'; });
    // The custom debug display contains more useful tracking data than the old renderer overlay.
    this.renderer.setDebug(false);
  }

  _drawDebugSkeleton(headOrientation, hands) {
    const mode = DEBUG_MODES[this.debugModeIndex];
    if (!['raw', 'filtered', 'both'].includes(mode)) return;

    this.debugCanvases.forEach((canvas, eyeIndex) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      for (const side of ['left', 'right']) {
        const hand = hands[side];
        if (!hand.tracked && hand.fade <= 0) continue;
        const sets = [];
        if (mode === 'raw' || mode === 'both') sets.push({ points: hand.rawJointsWorld, color: 'rgba(255,196,90,.72)', radius: 2 });
        if (mode === 'filtered' || mode === 'both') sets.push({ points: hand.jointsInteractionWorld, color: side === 'left' ? '#69efff' : '#ff72d4', radius: 3 });

        for (const set of sets) {
          const projected = set.points.map((point) => this.renderer._project(point, eyeIndex, headOrientation));
          ctx.strokeStyle = set.color;
          ctx.fillStyle = set.color;
          ctx.lineWidth = 1.2;
          for (const [a, b] of HAND_CONNECTIONS) {
            if (!projected[a] || !projected[b]) continue;
            ctx.beginPath();
            ctx.moveTo(projected[a].x, projected[a].y);
            ctx.lineTo(projected[b].x, projected[b].y);
            ctx.stroke();
          }
          projected.forEach((point) => {
            if (!point) return;
            ctx.beginPath();
            ctx.arc(point.x, point.y, set.radius, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }
    });
  }

  _updateDebugText(now, hands, metrics, headOrientation) {
    if (DEBUG_MODES[this.debugModeIndex] === 'off' || now - this.lastDebugUpdateAt < 120) return;
    this.lastDebugUpdateAt = now;
    const renderDelay = metrics.lastInferenceCompletedAt ? Math.max(0, now - metrics.lastInferenceCompletedAt) : 0;
    const estimatedEndToEnd = metrics.estimatedTrackingLatencyMs + Math.min(renderDelay, 120);
    const lines = [
      `BUILD ${BUILD}`,
      `Render FPS: ${this.renderer.fps.toFixed(1)}`,
      `Tracking FPS: ${metrics.trackingFps.toFixed(1)}`,
      `Inference: ${metrics.inferenceMs.toFixed(1)} ms`,
      `Browser frame freshness: ${metrics.frameFreshnessMs.toFixed(1)} ms`,
      `Estimated tracking→render: ${estimatedEndToEnd.toFixed(1)} ms`,
      `Dropped camera frames seen: ${metrics.droppedTrackingFrames}`,
      `Model: ${metrics.model}`,
      `Camera: ${metrics.cameraResolution} · ${this.cameraInfo?.lens || 'unknown'}`,
      `Performance: ${this.renderer.performanceMode}`,
      `Head q: ${headOrientation.x.toFixed(2)}, ${headOrientation.y.toFixed(2)}, ${headOrientation.z.toFixed(2)}, ${headOrientation.w.toFixed(2)}`,
      '',
      `LEFT ${hands.left.quality} · quality ${hands.left.confidence.toFixed(2)} · handed ${hands.left.handednessConfidence.toFixed(2)}`,
      ` raw wrist: ${formatVec(hands.left.rawJointsCamera[0])}`,
      ` filt wrist: ${formatVec(hands.left.jointsInteractionCamera[0])}`,
      ` depth raw/filt: ${hands.left.rawDepthMeters.toFixed(3)} / ${hands.left.filteredDepthMeters.toFixed(3)} m`,
      ` pinch: ${hands.left.gesture.pinchStrength.toFixed(2)} ratio ${hands.left.gesture.pinchRatio.toFixed(2)} · ${hands.left.gesture.pinchPhase}`,
      ` gesture/state: ${hands.left.gesture.name} · ${hands.left.interactionState}`,
      ` target: ${hands.left.target || '-'} · reticle ${hands.left.reticleState}`,
      '',
      `RIGHT ${hands.right.quality} · quality ${hands.right.confidence.toFixed(2)} · handed ${hands.right.handednessConfidence.toFixed(2)}`,
      ` raw wrist: ${formatVec(hands.right.rawJointsCamera[0])}`,
      ` filt wrist: ${formatVec(hands.right.jointsInteractionCamera[0])}`,
      ` depth raw/filt: ${hands.right.rawDepthMeters.toFixed(3)} / ${hands.right.filteredDepthMeters.toFixed(3)} m`,
      ` pinch: ${hands.right.gesture.pinchStrength.toFixed(2)} ratio ${hands.right.gesture.pinchRatio.toFixed(2)} · ${hands.right.gesture.pinchPhase}`,
      ` gesture/state: ${hands.right.gesture.name} · ${hands.right.interactionState}`,
      ` target: ${hands.right.target || '-'} · reticle ${hands.right.reticleState}`,
      '',
      `Debug view: ${DEBUG_MODES[this.debugModeIndex]} (press Debug to cycle)`,
    ].join('\n');
    this.debugRoot.querySelectorAll('pre').forEach((pre) => { pre.textContent = lines; });
  }

  _setPermissionState(key, text) {
    const node = this.permissionList?.querySelector(`[data-state="${key}"]`);
    if (node) node.textContent = text;
  }

  _stampBuild() {
    this.buildLabel.textContent = `BUILD ${BUILD}`;
    document.documentElement.dataset.build = BUILD;
  }

  _syncViewportGeometry() {
    const viewport = window.visualViewport;
    const height = Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 1);
    const width = Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 1);
    document.documentElement.style.setProperty('--app-height', `${height}px`);
    document.documentElement.style.setProperty('--app-width', `${width}px`);
    requestAnimationFrame(() => this.renderer.resize());
  }

  _requestImmersiveMode() {
    const root = document.documentElement;
    try {
      const fullscreen = root.requestFullscreen?.({ navigationUI: 'hide' }) || root.webkitRequestFullscreen?.();
      fullscreen?.catch?.(() => {});
    } catch (_) {}
    try {
      const orientation = screen.orientation?.lock?.('landscape');
      orientation?.catch?.(() => {});
    } catch (_) {}
    this._syncViewportGeometry();
    setTimeout(this._syncViewportGeometry, 120);
    setTimeout(this._syncViewportGeometry, 500);
  }
}

new PocketVRApp();
