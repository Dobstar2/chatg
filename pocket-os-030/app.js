import '../pocket-vr-next/tracking/worker-fastpath-v021.js?v=os030';
import '../pocket-vr-next/tracking/mediapipe-runtime-v020.js?v=os030';
import '../pocket-vr-next/tracking/safari-continuous-v022.js?v=os030';
import { HeadTrackingManager } from '../pocket-vr-next/tracking/head-tracking.js?v=os030';
import { HandTrackingManagerV2 } from '../pocket-vr-next/tracking/hand-tracking-v020.js?v=os030';

import { BUILD, BUILD_SHORT } from './core/version.js';
import { qFromYawPitch, qRotateVec, viewForward } from './core/math.js';
import { HeadAimController } from './core/head-aim.js';
import { InputManager, INPUT_ACTIONS } from './core/input-manager.js';
import { AppManager } from './core/app-manager.js';
import { PerformanceManager } from './core/performance-manager.js';
import { NotificationCenter } from './core/notification-center.js';
import { WindowManager } from './core/window-manager.js';
import { CameraCoordinator } from './core/camera-coordinator.js';
import { APP_MANIFESTS } from './apps/catalog.js';
import { SpatialRenderer } from './scene/renderer.js';
import { cycleCinemaFormat } from './core/media.js';
import { SystemAudio } from './core/system-audio.js';
import { detectCapabilities, missingCapabilities } from './core/capabilities.js';

const EMPTY_HAND = Object.freeze({
  tracked: false,
  interacting: false,
  interactionSafe: false,
  quality: 'lost',
  confidence: 0,
  handednessConfidence: 0,
  gesture: Object.freeze({ name: 'none', pinchPhase: 'open', pinchStrength: 0, pinchSerial: -1 }),
});

class PocketSpatialOS {
  constructor() {
    this.elements = {
      cameraVideo: document.getElementById('trackingVideo'),
      mediaVideo: document.getElementById('mediaVideo'),
      mediaAudio: document.getElementById('mediaAudio'),
      leftCanvas: document.getElementById('leftEyeCanvas'),
      rightCanvas: document.getElementById('rightEyeCanvas'),
      startOverlay: document.getElementById('startOverlay'),
      enterButton: document.getElementById('enterButton'),
      buildLabel: document.getElementById('buildLabel'),
      startStatus: document.getElementById('startStatus'),
      trustedBar: document.getElementById('trustedBar'),
      trustedAction: document.getElementById('trustedAction'),
      trustedCancel: document.getElementById('trustedCancel'),
      videoInput: document.getElementById('videoInput'),
      audioInput: document.getElementById('audioInput'),
      imageInput: document.getElementById('imageInput'),
      browserBar: document.getElementById('browserBar'),
      browserInput: document.getElementById('browserInput'),
      browserOpen: document.getElementById('browserOpen'),
      touchHint: document.getElementById('touchHint'),
    };

    this.head = new HeadTrackingManager();
    this.camera = new CameraCoordinator(this.elements.cameraVideo);
    this.hands = new HandTrackingManagerV2(this.elements.cameraVideo, this.camera.camera);
    this.performance = new PerformanceManager();
    this.headAim = new HeadAimController({ maxAngleDeg: 10.5, stickinessMs: 180, assistStrength: 0.85 });
    this.input = new InputManager({ holdMs: 620, dwellMs: 1100 });
    this.appManager = new AppManager(APP_MANIFESTS);
    this.windows = new WindowManager();
    this.notifications = new NotificationCenter();
    this.systemAudio = new SystemAudio();
    this.capabilities = detectCapabilities();
    this.renderer = new SpatialRenderer(this.elements.leftCanvas, this.elements.rightCanvas, this.performance);

    this.running = false;
    this.motionReady = false;
    this.handsReady = false;
    this.cameraInfo = null;
    this.lastFrameNow = performance.now();
    this.lastHandFrameAt = 0;
    this.audioContext = null;
    this.analyser = null;
    this.audioSource = null;
    this.trustedActionType = null;
    this.lastTargetId = null;
    this.lastInteractionAt = performance.now();
    this.transitionStart = 0;
    this.mediaObjectUrls = [];
    this.touchLook = { yaw: 0, pitch: 0, pointerId: null, startX: 0, startY: 0, lastX: 0, lastY: 0, moved: false };

    this.settings = {
      selectionMethod: 'pinch',
      dwell: false,
      assist: 0.85,
      stickinessMs: 180,
      experimentalHands: false,
      uiSound: true,
      environment: 'glass',
    };

    this.apps = {
      library: { filter: 'Featured' },
      cinema: { format: '2d', size: 1, distance: 2.15, curved: false, controlsVisible: true },
      planetarium: { simTime: 0, timeScale: 1, paused: false, focus: null, focusEnteredAt: 0 },
      portal: { selected: null, enteredAt: 0 },
      hologram: { rotation: 0.35, zoom: 1, auto: true, wireframe: false, model: 'Cube' },
      arcade: { score: 0, serial: 0, orbs: [] },
      music: { mode: 'Rings' },
      miniWorlds: { expanded: null },
      passthrough: { active: false, quickPeek: false, brightness: 1, effect: 'None' },
    };

    this.media = {
      video: this.elements.mediaVideo,
      videoReady: false,
      videoPlaying: false,
      audio: this.elements.mediaAudio,
      audioReady: false,
      audioPlaying: false,
      spectrum: new Uint8Array(64),
      images: [],
    };

    this.trackingMetrics = {};
    this.latestHands = { left: EMPTY_HAND, right: EMPTY_HAND };
    this._frame = this._frame.bind(this);

    this._stampBuild();
    this._bindEvents();
    this._seedArcade();
    requestAnimationFrame(this._frame);
  }

  _stampBuild() {
    document.documentElement.dataset.pocketBuild = BUILD;
    this.elements.buildLabel.textContent = BUILD_SHORT;
    document.title = `Pocket VR - ${BUILD_SHORT}`;
  }

  _bindEvents() {
    this.elements.enterButton.addEventListener('click', () => this.enter());

    for (const canvas of [this.elements.leftCanvas, this.elements.rightCanvas]) {
      canvas.addEventListener('pointerdown', (event) => this._pointerDown(event), { passive: false });
      canvas.addEventListener('pointermove', (event) => this._pointerMove(event), { passive: false });
      canvas.addEventListener('pointerup', (event) => this._pointerUp(event), { passive: false });
      canvas.addEventListener('pointercancel', (event) => this._pointerUp(event), { passive: false });
    }

    this.input.addEventListener(INPUT_ACTIONS.SELECT, (event) => this._handleSelect(event.detail));
    this.input.addEventListener(INPUT_ACTIONS.HOLD, (event) => this._handleHold(event.detail));
    this.input.addEventListener(INPUT_ACTIONS.RELEASE, () => this.windows.endManipulation());
    this.input.addEventListener(INPUT_ACTIONS.BACK, () => this._goBack());
    this.input.addEventListener(INPUT_ACTIONS.MENU, () => this.appManager.launch('library'));

    window.addEventListener('keydown', (event) => this.input.keyboardDown(event.code));
    window.addEventListener('keyup', (event) => this.input.keyboardUp(event.code));
    window.addEventListener('resize', () => this.renderer.resize(), { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(() => this.renderer.resize(), 120), { passive: true });
    window.visualViewport?.addEventListener('resize', () => this.renderer.resize(), { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.handsReady) this.hands.pause();
      } else if (this.running && this.handsReady) {
        this.hands.resume();
        this.notifications.push('Tracking resumed');
      }
    });

    this.hands.addEventListener('status', (event) => {
      if (String(event.detail).startsWith('ready')) this.handsReady = true;
    });
    this.hands.addEventListener('frame', () => { this.lastHandFrameAt = performance.now(); });
    this.hands.addEventListener('error', () => {
      this.notifications.push('Pinch tracking retrying', { kind: 'warning', duration: 2200 });
    });

    this.appManager.addEventListener('launch', (event) => this._onAppLaunch(event.detail.id));
    this.appManager.addEventListener('focus', () => this._updateTrustedUi());

    this.performance.addEventListener('change', (event) => {
      this.renderer.resize();
      this.notifications.push(`Performance: ${event.detail.mode}`);
    });

    this.elements.trustedAction.addEventListener('click', () => this._performTrustedAction());
    this.elements.trustedCancel.addEventListener('click', () => this._hideTrustedAction());
    this.elements.videoInput.addEventListener('change', (event) => this._loadVideo(event.target.files?.[0]));
    this.elements.audioInput.addEventListener('change', (event) => this._loadAudio(event.target.files?.[0]));
    this.elements.imageInput.addEventListener('change', (event) => this._loadImages([...event.target.files || []]));
    this.elements.browserOpen.addEventListener('click', () => this._openBrowserUrl());
  }

  async enter() {
    if (this.running || this.elements.enterButton.disabled) return;
    this.elements.enterButton.disabled = true;
    this.elements.startStatus.textContent = 'Starting head aim, camera and pinch tracking...';
    this.systemAudio.unlock().catch(() => false);
    this._requestImmersiveMode();

    const [motion, camera] = await Promise.allSettled([
      this.head.requestPermission(),
      this.camera.startTracking(),
    ]);

    if (motion.status === 'fulfilled') {
      this.head.start();
      this.motionReady = true;
    } else {
      this.motionReady = false;
      this.notifications.push('Motion unavailable - drag to look, tap to select', { kind: 'warning', duration: 2600 });
    }

    if (camera.status === 'fulfilled') {
      this.cameraInfo = camera.value;
      try {
        await this.hands.initialize();
        this.hands.start();
        this.handsReady = true;
      } catch (error) {
        console.warn('Pinch tracker unavailable', error);
        this.handsReady = false;
        this.settings.selectionMethod = 'touch';
        this.input.setSelectionMethod('touch');
        this.notifications.push('Pinch unavailable - tap to select', { kind: 'warning', duration: 3200 });
      }
    } else {
      console.warn('Camera unavailable', camera.reason);
      this.settings.selectionMethod = 'touch';
      this.input.setSelectionMethod('touch');
      this.notifications.push('Camera unavailable - head aim + touch active', { kind: 'warning', duration: 3200 });
    }

    this.running = true;
    this.elements.startOverlay.classList.add('hidden');
    document.body.classList.add('running');
    this.elements.enterButton.disabled = false;
    setTimeout(() => this.recenter(), 350);
    this.notifications.push('Look at a target, then pinch or tap');
  }

  stop() {
    this.running = false;
    try { this.hands.stop(); } catch (_) {}
    try { this.head.stop(); } catch (_) {}
    try { this.camera.stop(); } catch (_) {}
    this.elements.startOverlay.classList.remove('hidden');
    document.body.classList.remove('running');
    this.elements.enterButton.textContent = 'Re-enter Pocket VR';
  }

  recenter() {
    try { this.head.recenter(); } catch (_) {}
    this.notifications.push('View recentered');
  }

  _handleSelect({ target, targetId, source }) {
    this.lastInteractionAt = performance.now();
    if (!this.running || !targetId || !target) return;
    const action = target.action || targetId;
    this._pulseSelection();
    this.systemAudio.select();

    if (action.startsWith('app:')) {
      const id = action.slice(4);
      const manifest = this.appManager.getManifest(id);
      const missing = missingCapabilities(manifest, this.capabilities);
      if (missing.length) {
        this.notifications.push(`${manifest?.name || id} unavailable: ${missing.join(', ')}`, { kind: 'warning', duration: 2600 });
        return;
      }
      this.appManager.launch(id);
      return;
    }
    if (action === 'system:home') { this._returnVirtualHome(); return; }
    if (action.startsWith('quick:')) { this._quickAction(action); return; }
    if (action === 'system:switcher') { this.appManager.launch('switcher'); return; }
    if (action === 'system:back') { this._goBack(); return; }
    if (action === 'system:recenter') { this.recenter(); return; }

    if (action.startsWith('window:')) { this._windowAction(action); return; }
    if (action.startsWith('switcher:')) { this._switcherAction(action); return; }
    if (action.startsWith('library:filter:')) { this.apps.library.filter = action.slice('library:filter:'.length); return; }
    if (action.startsWith('cinema:')) { this._cinemaAction(action); return; }
    if (action.startsWith('planet:')) {
      this.apps.planetarium.focus = action.slice(7);
      this.apps.planetarium.focusEnteredAt = performance.now();
      this.notifications.push(`Focused ${this.apps.planetarium.focus}`);
      return;
    }
    if (action.startsWith('planetarium:')) { this._planetariumAction(action); return; }
    if (action.startsWith('portal:')) {
      const portalAction = action.slice(7);
      if (portalAction === 'return') {
        this.apps.portal.selected = null;
        this.notifications.push('Returned to portal gallery');
      } else if (portalAction === 'discover') {
        this.notifications.push(`Discovery found in ${this.apps.portal.selected || 'portal world'}`);
      } else {
        this.apps.portal.selected = portalAction;
        this.apps.portal.enteredAt = performance.now();
        this.notifications.push(`Entering ${this.apps.portal.selected}`);
      }
      return;
    }
    if (action.startsWith('holo:')) { this._hologramAction(action); return; }
    if (action.startsWith('arcade:')) { this._arcadeAction(action); return; }
    if (action.startsWith('music:')) { this._musicAction(action); return; }
    if (action.startsWith('world:')) {
      const worldAction = action.slice(6);
      if (worldAction === 'collapse') {
        this.apps.miniWorlds.expanded = null;
        this.notifications.push('Mini Worlds');
      } else {
        this.apps.miniWorlds.expanded = worldAction;
        this.notifications.push(`Expanded ${this.apps.miniWorlds.expanded}`);
      }
      return;
    }
    if (action.startsWith('passthrough:')) { this._passthroughAction(action); return; }
    if (action.startsWith('settings:')) { this._settingsAction(action); return; }
    if (action.startsWith('tracking:')) { this._trackingAction(action); return; }
    if (action === 'gallery:open') { this._showTrustedAction('images'); return; }

    this.notifications.push(`${target.label || action} selected by ${source}`);
  }

  _handleHold({ target }) {
    this.lastInteractionAt = performance.now();
    if (!target) {
      this.appManager.launch('quick-settings');
      this.notifications.push('Quick Settings');
      return;
    }
    if (target.id?.startsWith('window:move:')) {
      this.windows.beginMove(target.id.slice('window:move:'.length));
      this.notifications.push('Move mode - release pinch to place');
    }
  }

  _goBack() {
    this.systemAudio.back();
    if (this.appManager.activeAppId === 'passthrough') {
      this._returnVirtualHome();
      return;
    }
    this.appManager.back();
  }

  _onAppLaunch(id) {
    const manifest = this.appManager.getManifest(id);
    this.systemAudio.open();
    this.transitionStart = performance.now();
    this.lastInteractionAt = performance.now();
    this.notifications.push(`${manifest?.name || id} opened`, { duration: 1200 });
    if (manifest?.windowType === 'window') {
      const positions = {
        clock: { x: 0.62, y: 0.2, z: -1.55 },
        'tracking-lab': { x: -0.62, y: 0.05, z: -1.65 },
        settings: { x: 0.52, y: 0.02, z: -1.6 },
        gallery: { x: -0.52, y: 0.02, z: -1.6 },
        browser: { x: 0.48, y: 0.06, z: -1.62 },
        labs: { x: -0.48, y: 0.06, z: -1.62 },
        library: { x: 0, y: 0.02, z: -1.55 },
      };
      this.windows.open(id, { title: manifest.name, position: positions[id] });
    }
    if (id === 'passthrough') this._enterPassthrough();
    else if (this.apps.passthrough.active) this.camera.exitPassthrough();
    this.apps.passthrough.active = id === 'passthrough';
    if (id === 'cinema') this.apps.cinema.controlsVisible = true;
    this._updateTrustedUi();
  }

  _returnVirtualHome() {
    if (this.apps.passthrough.active) this.camera.exitPassthrough();
    this.apps.passthrough.active = false;
    this.apps.passthrough.quickPeek = false;
    this.appManager.home();
  }

  async _enterPassthrough() {
    try {
      await this.camera.enterPassthrough();
      this.apps.passthrough.active = true;
      this.notifications.push('Passthrough active - camera view is not safety certified', { duration: 2800 });
    } catch (error) {
      console.warn('Passthrough unavailable', error);
      this.notifications.push('Passthrough unavailable', { kind: 'warning', duration: 2600 });
      this.appManager.home();
    }
  }

  _quickAction(action) {
    if (action === 'quick:recenter') this.recenter();
    else if (action === 'quick:passthrough') this.appManager.launch('passthrough');
    else if (action === 'quick:peek') {
      this.apps.passthrough.quickPeek = true;
      this.appManager.launch('passthrough');
    } else if (action === 'quick:performance') this.performance.cycleMode();
    else if (action === 'quick:selection') this._settingsAction('settings:selection');
    else if (action === 'quick:hands') this._settingsAction('settings:hands');
    else if (action === 'quick:sound') this._settingsAction('settings:sound');
    else if (action === 'quick:environment') {
      const envs = ['glass', 'space', 'ocean', 'void'];
      this.settings.environment = envs[(envs.indexOf(this.settings.environment) + 1) % envs.length];
      this.notifications.push(`Environment: ${this.settings.environment}`);
    }
  }

  _switcherAction(action) {
    const [, mode, id] = action.split(':');
    if (!id) return;
    if (mode === 'focus') this.appManager.focus(id);
    if (mode === 'close') {
      this.appManager.close(id);
      this.windows.close(id);
      this.notifications.push(`${id} closed`);
    }
  }

  _windowAction(action) {
    const [, mode, id] = action.split(':');
    if (!id) return;
    if (mode === 'focus') this.appManager.focus(id);
    else if (mode === 'close') { this.windows.close(id); this.appManager.close(id); }
    else if (mode === 'larger') {
      const window = this.windows.windows.get(id);
      if (window) window.scale = window.scale >= 1.5 ? 0.72 : Math.min(1.6, window.scale + 0.18);
    } else if (mode === 'move') {
      this.notifications.push('Pinch and hold Move to reposition');
    }
  }

  _cinemaAction(action) {
    const c = this.apps.cinema;
    const video = this.media.video;
    if (action === 'cinema:open') this._showTrustedAction('video');
    else if (action === 'cinema:play') {
      if (!this.media.videoReady) { this._showTrustedAction('video'); return; }
      if (video.paused) {
        video.play().then(() => { this.media.videoPlaying = true; }).catch(() => this._showTrustedAction('play-video'));
      } else {
        video.pause(); this.media.videoPlaying = false;
      }
    } else if (action === 'cinema:format') {
      c.format = cycleCinemaFormat(c.format);
      this.notifications.push(`Cinema format: ${c.format.toUpperCase()}`);
    } else if (action === 'cinema:size') {
      c.size = c.size >= 1.25 ? 0.82 : Math.round((c.size + 0.18) * 100) / 100;
    } else if (action === 'cinema:curve') {
      c.curved = !c.curved;
    } else if (action === 'cinema:controls') {
      c.controlsVisible = !c.controlsVisible;
    } else if (action === 'cinema:seek-back') {
      video.currentTime = Math.max(0, video.currentTime - 10);
    } else if (action === 'cinema:seek-forward') {
      video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
    } else if (action === 'cinema:volume') {
      video.volume = video.volume > 0.6 ? 0.35 : video.volume > 0.2 ? 0 : 1;
    } else if (action === 'cinema:distance') {
      c.distance = c.distance > 2.6 ? 1.75 : c.distance + 0.3;
    }
  }

  _planetariumAction(action) {
    const p = this.apps.planetarium;
    if (action === 'planetarium:focus-back') { p.focus = null; return; }
    if (action === 'planetarium:pause') p.paused = !p.paused;
    if (action === 'planetarium:speed') p.timeScale = p.timeScale >= 8 ? 0.5 : p.timeScale * 2;
    if (action === 'planetarium:reset') { p.simTime = 0; p.focus = null; p.timeScale = 1; p.paused = false; }
  }

  _hologramAction(action) {
    const h = this.apps.hologram;
    if (action === 'holo:left') h.rotation -= 0.35;
    if (action === 'holo:right') h.rotation += 0.35;
    if (action === 'holo:model') { const models = ['Cube','Ship','Orb']; h.model = models[(models.indexOf(h.model) + 1) % models.length]; }
    if (action === 'holo:zoom') h.zoom = h.zoom > 1.3 ? 0.8 : h.zoom + 0.2;
    if (action === 'holo:auto') h.auto = !h.auto;
    if (action === 'holo:wire') h.wireframe = !h.wireframe;
  }

  _arcadeAction(action) {
    if (action === 'arcade:restart') { this.apps.arcade.score = 0; this._seedArcade(); return; }
    const id = action.slice(7);
    const orb = this.apps.arcade.orbs.find((item) => item.id === id);
    if (!orb || !orb.active) return;
    orb.active = false;
    this.apps.arcade.score += 1;
    this.notifications.push(`Hit ${this.apps.arcade.score}`, { duration: 600 });
    setTimeout(() => this._spawnArcadeOrb(orb), 280);
  }

  _seedArcade() {
    this.apps.arcade.orbs = Array.from({ length: 5 }, (_, index) => {
      const orb = { id: `orb-${index}`, active: true, radius: 0.055, x: 0, y: 0, z: -1.8 };
      this._spawnArcadeOrb(orb);
      return orb;
    });
  }

  _spawnArcadeOrb(orb) {
    orb.x = (Math.random() - 0.5) * 1.25;
    orb.y = (Math.random() - 0.45) * 0.75;
    orb.z = -1.35 - Math.random() * 1.35;
    orb.radius = 0.045 + Math.random() * 0.03;
    orb.active = true;
  }

  _musicAction(action) {
    if (action === 'music:open') this._showTrustedAction('audio');
    if (action === 'music:play') {
      if (!this.media.audioReady) { this._showTrustedAction('audio'); return; }
      if (this.media.audio.paused) {
        this.media.audio.play().then(() => { this.media.audioPlaying = true; }).catch(() => this._showTrustedAction('play-audio'));
      } else { this.media.audio.pause(); this.media.audioPlaying = false; }
    }
    if (action === 'music:mode') {
      const modes = ['Rings', 'Tunnel', 'Calm'];
      this.apps.music.mode = modes[(modes.indexOf(this.apps.music.mode) + 1) % modes.length];
    }
  }

  _passthroughAction(action) {
    if (action === 'passthrough:quick') this.apps.passthrough.quickPeek = !this.apps.passthrough.quickPeek;
    if (action === 'passthrough:brightness') {
      const b = this.apps.passthrough.brightness;
      this.apps.passthrough.brightness = b > 1.15 ? 0.7 : b + 0.2;
    }
    if (action === 'passthrough:effect') {
      const effects = ['None','Stars','Portal'];
      this.apps.passthrough.effect = effects[(effects.indexOf(this.apps.passthrough.effect) + 1) % effects.length];
    }
  }

  _settingsAction(action) {
    if (action === 'settings:selection') {
      const methods = ['pinch', 'touch', 'dwell'];
      const next = methods[(methods.indexOf(this.settings.selectionMethod) + 1) % methods.length];
      this.settings.selectionMethod = next;
      this.settings.dwell = next === 'dwell';
      this.input.setSelectionMethod(next);
      this.notifications.push(`Selection: ${next}`);
    } else if (action === 'settings:dwell') {
      this.settings.dwell = !this.settings.dwell;
      this.settings.selectionMethod = this.settings.dwell ? 'dwell' : 'pinch';
      this.input.setSelectionMethod(this.settings.selectionMethod);
    } else if (action === 'settings:assist') {
      this.settings.assist = this.settings.assist > 1 ? 0.45 : this.settings.assist + 0.2;
      this.headAim.setOptions({ assistStrength: this.settings.assist });
    } else if (action === 'settings:stickiness') {
      this.settings.stickinessMs = this.settings.stickinessMs >= 320 ? 100 : this.settings.stickinessMs + 60;
      this.headAim.setOptions({ stickinessMs: this.settings.stickinessMs });
    } else if (action === 'settings:performance') {
      this.performance.cycleMode();
    } else if (action === 'settings:sound') {
      this.settings.uiSound = !this.settings.uiSound;
      this.systemAudio.setEnabled(this.settings.uiSound);
      this.notifications.push(`UI sound ${this.settings.uiSound ? 'on' : 'off'}`);
    } else if (action === 'settings:hands') {
      this.settings.experimentalHands = !this.settings.experimentalHands;
      this.notifications.push(this.settings.experimentalHands ? 'Experimental Spatial Hands enabled' : 'Primary aim remains Head Aim');
    }
  }

  _trackingAction(action) {
    if (action === 'tracking:restart') {
      try { this.hands.stop(); this.hands.start(); this.notifications.push('Hand tracker restarted'); } catch (_) { this.notifications.push('Tracker restart unavailable'); }
    }
    if (action === 'tracking:test') this.notifications.push('Select input received');
  }

  _showTrustedAction(type) {
    this.trustedActionType = type;
    const labels = {
      video: 'Tap to choose video', audio: 'Tap to choose audio', images: 'Tap to choose photos',
      'play-video': 'Tap to play video', 'play-audio': 'Tap to play audio', browser: 'Tap to open in Safari',
    };
    this.elements.trustedAction.textContent = labels[type] || 'Continue';
    this.elements.trustedBar.classList.add('visible');
  }

  _hideTrustedAction() {
    this.trustedActionType = null;
    this.elements.trustedBar.classList.remove('visible');
  }

  _performTrustedAction() {
    const type = this.trustedActionType;
    if (type === 'video') this.elements.videoInput.click();
    else if (type === 'audio') this.elements.audioInput.click();
    else if (type === 'images') this.elements.imageInput.click();
    else if (type === 'play-video') this.media.video.play().then(() => { this.media.videoPlaying = true; });
    else if (type === 'play-audio') this.media.audio.play().then(() => { this.media.audioPlaying = true; });
    this._hideTrustedAction();
  }

  _loadVideo(file) {
    if (!file) return;
    const url = URL.createObjectURL(file); this.mediaObjectUrls.push(url);
    this.media.video.src = url;
    this.media.video.load();
    this.media.videoReady = true;
    this.apps.cinema.controlsVisible = true;
    this.media.video.play().then(() => { this.media.videoPlaying = true; }).catch(() => this._showTrustedAction('play-video'));
    this.notifications.push(`Loaded ${file.name}`);
  }

  async _loadAudio(file) {
    if (!file) return;
    const url = URL.createObjectURL(file); this.mediaObjectUrls.push(url);
    this.media.audio.src = url;
    this.media.audio.load();
    this.media.audioReady = true;
    await this._ensureAnalyser();
    this.media.audio.play().then(() => { this.media.audioPlaying = true; }).catch(() => this._showTrustedAction('play-audio'));
    this.notifications.push(`Loaded ${file.name}`);
  }

  _loadImages(files) {
    for (const file of files.slice(0, 12)) {
      const url = URL.createObjectURL(file); this.mediaObjectUrls.push(url);
      const image = new Image(); image.src = url;
      this.media.images.push({ name: file.name, url, element: image });
    }
    if (files.length) this.notifications.push(`${Math.min(files.length, 12)} image(s) added`);
  }

  async _ensureAnalyser() {
    if (this.analyser) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    this.audioContext = new AudioContextClass();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 128;
    this.audioSource = this.audioContext.createMediaElementSource(this.media.audio);
    this.audioSource.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
    await this.audioContext.resume().catch(() => {});
  }

  _updateTrustedUi() {
    const app = this.appManager.activeAppId;
    this.elements.browserBar.classList.toggle('visible', app === 'browser');
    if (!['cinema', 'music', 'gallery'].includes(app)) this._hideTrustedAction();
  }

  _openBrowserUrl() {
    const raw = this.elements.browserInput.value.trim();
    if (!raw) return;
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (_) {}
  }

  _pointerDown(event) {
    if (!this.running) return;
    event.preventDefault();
    const t = this.touchLook;
    t.pointerId = event.pointerId;
    t.startX = t.lastX = event.clientX;
    t.startY = t.lastY = event.clientY;
    t.moved = false;
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch (_) {}
  }

  _pointerMove(event) {
    const t = this.touchLook;
    if (!this.running || t.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - t.lastX;
    const dy = event.clientY - t.lastY;
    if (Math.hypot(event.clientX - t.startX, event.clientY - t.startY) > 7) t.moved = true;
    if (!this.motionReady && t.moved) {
      t.yaw -= dx * 0.0045;
      t.pitch = Math.max(-1.05, Math.min(1.05, t.pitch - dy * 0.0045));
    }
    t.lastX = event.clientX;
    t.lastY = event.clientY;
  }

  _pointerUp(event) {
    const t = this.touchLook;
    if (!this.running || t.pointerId !== event.pointerId) return;
    event.preventDefault();
    const wasTap = !t.moved;
    t.pointerId = null;
    if (wasTap) this.input.touchSelect();
  }

  _requestImmersiveMode() {
    try { document.documentElement.requestFullscreen?.().catch?.(() => {}); } catch (_) {}
    try { screen.orientation?.lock?.('landscape').catch?.(() => {}); } catch (_) {}
  }

  _pulseSelection() {
    document.body.classList.remove('select-pulse');
    void document.body.offsetWidth;
    document.body.classList.add('select-pulse');
    setTimeout(() => document.body.classList.remove('select-pulse'), 130);
  }

  _frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrameNow) / 1000));
    this.lastFrameNow = now;
    const headOrientation = this.motionReady ? this.head.getOrientation() : qFromYawPitch(this.touchLook.yaw, this.touchLook.pitch);

    if (this.running) {
      let hands = this.latestHands;
      try {
        if (this.handsReady) hands = this.hands.sampleForRender(now);
      } catch (_) {}
      this.latestHands = hands || this.latestHands;
      for (const side of ['left', 'right']) {
        const hand = this.latestHands?.[side];
        if (!hand?.jointsCamera?.length) continue;
        hand.jointsWorld = hand.jointsCamera.map((joint) => qRotateVec(headOrientation, joint));
      }
      this.input.updateHands(this.latestHands, now);

      const activeApp = this.appManager.activeAppId;
      if (activeApp === 'planetarium' && !this.apps.planetarium.paused) this.apps.planetarium.simTime += dt * 1000 * this.apps.planetarium.timeScale;
      if (activeApp === 'hologram' && this.apps.hologram.auto) this.apps.hologram.rotation += dt * 0.48;
      if (activeApp === 'music' && this.analyser && this.media.audioPlaying) this.analyser.getByteFrequencyData(this.media.spectrum);

      try { this.trackingMetrics = this.handsReady ? this.hands.getMetrics() : {}; } catch (_) { this.trackingMetrics = {}; }
    }

    const state = this._buildRenderState(now, headOrientation);
    const targets = this.running ? this.renderer.getTargets(state) : [];
    const aim = this.headAim.update(headOrientation, targets, now);
    state.aim = aim;
    this.input.setAim(aim, now);
    this.input.update(now);

    if (aim.targetId !== this.lastTargetId) {
      this.lastTargetId = aim.targetId;
      if (aim.targetId) { document.body.classList.add('has-target'); this.systemAudio.target(now); this.lastInteractionAt = now; } else document.body.classList.remove('has-target');
    }

    if (this.windows.manipulation?.type === 'move') {
      this.windows.updateManipulation({ aimDirection: viewForward(headOrientation) });
    }

    this.performance.frame(now);
    state.performance = this.performance;
    state.notification = this.notifications.active(now);
    state.aim = aim;
    this.renderer.render(state);
    requestAnimationFrame(this._frame);
  }

  _buildRenderState(now, headOrientation) {
    const hands = this.latestHands || { left: EMPTY_HAND, right: EMPTY_HAND };
    const left = hands.left || EMPTY_HAND, right = hands.right || EMPTY_HAND;
    const pinchActive = ['start', 'held'].includes(left.gesture?.pinchPhase) || ['start', 'held'].includes(right.gesture?.pinchPhase);
    const hasUsablePinch = this.handsReady && (left.tracked || right.tracked);
    const select = this.settings.selectionMethod === 'pinch' && !hasUsablePinch ? 'Touch' : this.settings.selectionMethod;
    return {
      now,
      headOrientation,
      cameraVideo: this.elements.cameraVideo,
      cameraInfo: this.cameraInfo,
      capabilities: this.capabilities,
      appManager: this.appManager,
      windows: this.windows,
      performance: this.performance,
      apps: this.apps,
      settings: this.settings,
      media: this.media,
      trackingMetrics: this.trackingMetrics,
      hands: this.latestHands,
      handSummary: {
        left: left.tracked ? (left.quality || 'tracked') : 'lost',
        right: right.tracked ? (right.quality || 'tracked') : 'lost',
      },
      pinchActive,
      inputStatus: `${this.motionReady ? 'Aim Head' : 'Aim Drag'} | Select ${String(select).replace('-', ' ')}`,
      aim: null,
      notification: null,
      idle: now - this.lastInteractionAt > 7000,
      transitionProgress: this.transitionStart ? Math.max(0, 1 - (now - this.transitionStart) / 360) : 0,
    };
  }
}

new PocketSpatialOS();
