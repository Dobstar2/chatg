import { qRotateVec } from './core/math.js';
import { HeadTrackingManager } from './tracking/head-tracking.js';
import { CameraManager } from './tracking/camera-manager.js';
import { HandTrackingManager } from './tracking/hand-tracking.js';
import { InteractionManager } from './scene/interaction-manager.js';
import { StereoRenderer } from './scene/stereo-renderer.js';

const BUILD = 'tracking-foundation-0.1.3';

class PocketVRApp {
  constructor() {
    this.video = document.getElementById('trackingVideo');
    this.leftCanvas = document.getElementById('leftEyeCanvas');
    this.rightCanvas = document.getElementById('rightEyeCanvas');
    this.stereoRoot = document.getElementById('stereoRoot');
    this.eyes = [...document.querySelectorAll('#stereoRoot > .eye')];
    this.divider = document.querySelector('#stereoRoot > .divider');
    this.startOverlay = document.getElementById('startOverlay');
    this.enterButton = document.getElementById('enterButton');
    this.startStatus = document.getElementById('startStatus');
    this.permissionList = document.getElementById('permissionList');
    this.buildLabel = document.getElementById('buildLabel');
    this.touchRecenter = document.getElementById('touchRecenter');
    this.touchCalibrate = document.getElementById('touchCalibrate');

    this.head = new HeadTrackingManager();
    this.camera = new CameraManager(this.video);
    this.hands = new HandTrackingManager(this.video, this.camera);
    this.interaction = new InteractionManager();
    this.renderer = new StereoRenderer(this.leftCanvas, this.rightCanvas, this.interaction);

    this.running = false;
    this.cameraInfo = null;
    this.statusText = 'WAITING';
    this.lastFrameAt = 0;
    this.debugEnabled = false;
    this.lastHandCount = -1;

    this._frame = this._frame.bind(this);
    this._syncViewportGeometry = this._syncViewportGeometry.bind(this);
    this._bindEvents();
    this._stampBuild();
    this._syncViewportGeometry();
    requestAnimationFrame(this._frame);
  }

  _bindEvents() {
    this.enterButton.addEventListener('click', () => this.enter());
    this.touchRecenter.addEventListener('click', () => this.recenterHead());
    this.touchCalibrate.addEventListener('click', () => this.recalibrateHands());

    window.addEventListener('resize', this._syncViewportGeometry, { passive: true });
    window.addEventListener('orientationchange', () => {
      setTimeout(this._syncViewportGeometry, 60);
      setTimeout(this._syncViewportGeometry, 220);
      setTimeout(this._syncViewportGeometry, 600);
    }, { passive: true });
    window.visualViewport?.addEventListener('resize', this._syncViewportGeometry, { passive: true });
    window.visualViewport?.addEventListener('scroll', this._syncViewportGeometry, { passive: true });
    document.addEventListener('fullscreenchange', this._syncViewportGeometry);
    document.addEventListener('webkitfullscreenchange', this._syncViewportGeometry);

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

    this.hands.addEventListener('calibrated', () => {
      this.statusText = 'HANDS CALIBRATED';
      setTimeout(() => { this.statusText = 'READY'; }, 1400);
    });

    this.hands.addEventListener('frame', (event) => {
      const hands = event.detail;
      const count = ['left', 'right'].filter((side) => hands[side]?.tracked).length;
      if (count === this.lastHandCount) return;
      this.lastHandCount = count;
      const labels = ['Looking for hands', 'One hand detected', 'Two hands detected'];
      this._setPermissionState('hands', labels[count]);
      if (count === 0 && this.running) this.statusText = 'TRACKING LOST';
      else if (count === 1) this.statusText = 'ONE HAND';
      else if (count === 2) this.statusText = 'TWO HANDS';
    });

    this.interaction.addEventListener('action', (event) => {
      this._handleAction(event.detail.action, event.detail.side);
    });

    [this.leftCanvas, this.rightCanvas].forEach((canvas, eyeIndex) => {
      canvas.addEventListener('pointerdown', (event) => {
        if (!this.running) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const action = this.renderer.hitTestUi(eyeIndex, x, y);
        if (action) this._handleAction(action, 'touch');
      });
    });

    window.addEventListener('pagehide', () => this.stop());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.statusText = 'PAUSED';
      else if (this.running) {
        this.statusText = 'READY';
        this._syncViewportGeometry();
      }
    });
  }

  async enter() {
    if (this.running || this.enterButton.disabled) return;
    this.enterButton.disabled = true;
    this.statusText = 'STARTING';
    this.startStatus.textContent = 'Requesting motion and rear-camera permissions…';
    this._setPermissionState('motion', 'Motion permission requested');
    this._setPermissionState('camera', 'Camera permission requested');
    this._setPermissionState('hands', 'Waiting for camera');

    this._requestImmersiveMode();

    const motionPromise = this.head.requestPermission();
    const cameraPromise = this.camera.start();
    const [motionResult, cameraResult] = await Promise.allSettled([motionPromise, cameraPromise]);

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
        : 'Rear wide camera active — 0.5× requested where Safari exposes it'
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
    this.statusText = 'READY';
    this._syncViewportGeometry();
    requestAnimationFrame(this._syncViewportGeometry);
    setTimeout(this._syncViewportGeometry, 120);
    setTimeout(this._syncViewportGeometry, 450);

    setTimeout(() => this.head.recenter(), 450);
    setTimeout(() => {
      if (this.running && !this.hands.getHands().left.tracked && !this.hands.getHands().right.tracked) {
        this.statusText = 'SHOW HANDS';
      }
    }, 1800);
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
    setTimeout(() => { if (this.running) this.statusText = 'READY'; }, 1200);
  }

  recalibrateHands() {
    const calibrated = this.hands.recalibrateHands();
    this.statusText = calibrated ? 'HANDS CALIBRATED' : 'SHOW HANDS FIRST';
    setTimeout(() => { if (this.running) this.statusText = 'READY'; }, 1400);
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
        this.debugEnabled = !this.debugEnabled;
        this.renderer.setDebug(this.debugEnabled);
        this.statusText = this.debugEnabled ? 'DEBUG ON' : 'DEBUG OFF';
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
    const handStates = this.hands.getHands();
    this.hands.updateLoss(now);

    for (const side of ['left', 'right']) {
      const hand = handStates[side];
      for (let i = 0; i < hand.jointsCamera.length; i += 1) {
        hand.jointsWorld[i] = qRotateVec(headOrientation, hand.jointsCamera[i]);
      }
    }

    if (this.running) {
      this.interaction.update(handStates);
    }

    this.renderer.render({
      now,
      headOrientation,
      hands: handStates,
      cameraInfo: this.cameraInfo,
      trackingStats: {
        trackingFps: this.hands.trackingFps,
        inferenceMs: this.hands.inferenceMs,
      },
      statusText: this.statusText,
    });

    this.lastFrameAt = now;
    requestAnimationFrame(this._frame);
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
    const width = Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 1);
    const height = Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 1);
    const eyeWidth = width / 2;

    document.documentElement.style.setProperty('--app-height', `${height}px`);
    document.documentElement.style.setProperty('--app-width', `${width}px`);

    // CSS owns the actual eye boxes: exactly 50dvw by 100dvh each. We only
    // trigger backing-buffer resize here after Safari changes its viewport.
    requestAnimationFrame(() => this.renderer.resize());
  }

  _requestImmersiveMode() {
    const root = document.documentElement;
    try {
      const fullscreen = root.requestFullscreen?.({ navigationUI: 'hide' }) || root.webkitRequestFullscreen?.();
      fullscreen?.catch?.(() => {});
    } catch (_) {
      // iPhone Safari may not expose the Fullscreen API for ordinary pages.
    }
    try {
      const orientation = screen.orientation?.lock?.('landscape');
      orientation?.catch?.(() => {});
    } catch (_) {
      // iPhone Safari may ignore orientation locking outside standalone mode.
    }
    this._syncViewportGeometry();
    setTimeout(this._syncViewportGeometry, 120);
    setTimeout(this._syncViewportGeometry, 500);
  }
}

new PocketVRApp();
