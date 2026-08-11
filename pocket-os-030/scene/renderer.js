import {
  clamp,
  projectWorld,
  seededRandom,
  v3,
} from '../core/math.js';
import { DOCK_APPS, FEATURED_APPS } from '../apps/catalog.js';
import { displayAspect, sourceRectForEye } from '../core/media.js';

const EYE_IPD = 0.064;
const FOV_Y = 86;
const rand = seededRandom(93107);
const HAND_CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

const STARS = Array.from({ length: 110 }, () => ({
  x: (rand() - 0.5) * 8,
  y: (rand() - 0.35) * 4.5,
  z: -1.4 - rand() * 6.5,
  r: 0.35 + rand() * 1.2,
}));

const PLANETS = [
  { id: 'mercury', name: 'Mercury', radius: 0.035, orbit: 0.34, speed: 4.15, phase: 0.2 },
  { id: 'venus', name: 'Venus', radius: 0.055, orbit: 0.48, speed: 1.62, phase: 1.1 },
  { id: 'earth', name: 'Earth', radius: 0.06, orbit: 0.64, speed: 1.0, phase: 2.2 },
  { id: 'mars', name: 'Mars', radius: 0.05, orbit: 0.82, speed: 0.53, phase: 4.0 },
  { id: 'jupiter', name: 'Jupiter', radius: 0.13, orbit: 1.05, speed: 0.084, phase: 1.7 },
  { id: 'saturn', name: 'Saturn', radius: 0.11, orbit: 1.30, speed: 0.034, phase: 3.4 },
];

const PORTALS = [
  { id: 'space', name: 'Deep Space', x: -0.55, y: 0.04, z: -1.8 },
  { id: 'ocean', name: 'Ocean', x: 0, y: 0.04, z: -1.9 },
  { id: 'dream', name: 'Dreamscape', x: 0.55, y: 0.04, z: -1.8 },
];

const MINI_WORLDS = [
  { id: 'city', name: 'Tiny City', x: -0.5, y: 0.13, z: -1.55 },
  { id: 'island', name: 'Island', x: 0, y: 0.13, z: -1.55 },
  { id: 'moon', name: 'Moon Base', x: 0.5, y: 0.13, z: -1.55 },
  { id: 'forest', name: 'Forest', x: -0.25, y: -0.26, z: -1.52 },
  { id: 'station', name: 'Station', x: 0.25, y: -0.26, z: -1.52 },
];

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawGlass(ctx, x, y, w, h, { active = false, strong = false } = {}) {
  roundRect(ctx, x, y, w, h, Math.min(18, h * 0.24));
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  if (active) {
    g.addColorStop(0, 'rgba(188,224,255,.34)');
    g.addColorStop(1, 'rgba(80,114,174,.25)');
  } else if (strong) {
    g.addColorStop(0, 'rgba(40,52,76,.88)');
    g.addColorStop(1, 'rgba(16,22,34,.92)');
  } else {
    g.addColorStop(0, 'rgba(255,255,255,.12)');
    g.addColorStop(1, 'rgba(255,255,255,.045)');
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = active ? 'rgba(196,230,255,.72)' : 'rgba(255,255,255,.16)';
  ctx.lineWidth = active ? 1.6 : 1;
  ctx.stroke();
}

export class SpatialRenderer {
  constructor(leftCanvas, rightCanvas, performanceManager) {
    this.canvases = [leftCanvas, rightCanvas];
    this.contexts = this.canvases.map((canvas) => canvas.getContext('2d', { alpha: false }));
    this.performance = performanceManager;
    this.widths = [1, 1];
    this.heights = [1, 1];
    this.dpr = 1;
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    for (const canvas of this.canvases) this.resizeObserver.observe(canvas);
  }

  resize() {
    this.dpr = this.performance.dpr(window.devicePixelRatio || 1);
    this.canvases.forEach((canvas, index) => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      this.widths[index] = width;
      this.heights[index] = height;
      const pxW = Math.round(width * this.dpr);
      const pxH = Math.round(height * this.dpr);
      if (canvas.width !== pxW) canvas.width = pxW;
      if (canvas.height !== pxH) canvas.height = pxH;
    });
  }

  getTargets(state) {
    const app = state.appManager.activeAppId;
    const targets = [];
    const add = (id, label, x, y, z, options = {}) => targets.push({
      id, label, position: v3(x, y, z), angularRadius: options.angularRadius || 0.055,
      priority: options.priority || 0, disabled: Boolean(options.disabled), action: options.action || id,
      meta: options.meta || null,
    });

    if (app === 'home') {
      const featured = [...state.appManager.recents, ...state.appManager.favourites, ...FEATURED_APPS]
        .filter((id, index, all) => all.indexOf(id) === index)
        .slice(0, 8);
      featured.forEach((id, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        add(`app:${id}`, id, -0.57 + col * 0.38, 0.23 - row * 0.34, -1.58, { angularRadius: 0.07, priority: 1 });
      });
      this._dockTargets(add);
    } else if (app === 'quick-settings') {
      const rows = [
        ['quick:recenter', 'Recenter', -0.4, 0.24],
        ['quick:passthrough', 'Passthrough', 0, 0.24],
        ['quick:peek', 'Quick Peek', 0.4, 0.24],
        ['quick:performance', `Perf ${state.performance.mode}`, -0.4, -0.04],
        ['quick:selection', `Select ${state.settings.selectionMethod}`, 0, -0.04],
        ['quick:hands', `Hands ${state.settings.experimentalHands ? 'Labs' : 'Pinch'}`, 0.4, -0.04],
        ['quick:environment', `World ${state.settings.environment}`, -0.4, -0.32],
        ['quick:sound', `Sound ${state.settings.uiSound ? 'On' : 'Off'}`, 0, -0.32],
        ['system:home', 'Home', 0.4, -0.32],
      ];
      rows.forEach(([id, label, x, y]) => add(id, label, x, y, -1.43, { angularRadius: 0.07, priority: id === 'system:home' ? 2 : 0 }));
    } else if (app === 'switcher') {
      const running = state.appManager.running.filter((id) => id !== 'switcher');
      running.slice(0, 3).forEach((id, i) => {
        add(`switcher:focus:${id}`, id, -0.42 + i * 0.42, 0.05, -1.5, { angularRadius: 0.095, priority: 1.5 });
        if (id !== 'home') add(`switcher:close:${id}`, `Close ${id}`, -0.42 + i * 0.42, -0.22, -1.43, { angularRadius: 0.05 });
      });
      this._systemBackTargets(add);
    } else if (app === 'library') {
      const filter = state.apps.library.filter;
      const filters = ['Featured', 'Media', 'Utility', 'Labs'];
      filters.forEach((name, i) => add(`library:filter:${name}`, name, -0.45 + i * 0.3, 0.43, -1.47, { angularRadius: 0.05, priority: filter === name ? 1 : 0 }));
      let apps = state.appManager.all().filter((item) => !['home', 'library', 'switcher', 'quick-settings'].includes(item.id));
      if (filter === 'Featured') apps = apps.filter((item) => FEATURED_APPS.includes(item.id));
      else apps = apps.filter((item) => item.category === filter || (filter === 'Media' && ['Media'].includes(item.category)));
      apps.slice(0, 12).forEach((item, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        add(`app:${item.id}`, item.name, -0.57 + col * 0.38, 0.23 - row * 0.27, -1.55, { angularRadius: 0.065 });
      });
      this._systemBackTargets(add);
    } else if (app === 'cinema') {
      if (state.apps.cinema.controlsVisible || !state.media.videoReady) {
        const buttons = [
          ['cinema:open', 'Open Video', -0.52, -0.45],
          ['cinema:play', state.media.videoPlaying ? 'Pause' : 'Play', -0.26, -0.45],
          ['cinema:format', state.apps.cinema.format.toUpperCase(), 0, -0.45],
          ['cinema:size', 'Size', 0.26, -0.45],
          ['cinema:curve', state.apps.cinema.curved ? 'Curved' : 'Flat', 0.52, -0.45],
          ['cinema:seek-back', '-10s', -0.39, -0.57],
          ['cinema:seek-forward', '+10s', -0.13, -0.57],
          ['cinema:volume', 'Volume', 0.13, -0.57],
          ['cinema:distance', 'Distance', 0.39, -0.57],
        ];
        buttons.forEach(([id, label, x, y]) => add(id, label, x, y, -1.35, { angularRadius: 0.05 }));
      }
      add('system:home', 'Home', -0.18, -0.66, -1.28, { angularRadius: 0.05, priority: 2 });
      add('cinema:controls', 'Controls', 0.18, -0.66, -1.28, { angularRadius: 0.05, priority: 2 });
    } else if (app === 'planetarium') {
      if (state.apps.planetarium.focus) {
        add('planetarium:focus-back', 'Solar System', 0, -0.5, -1.32, { angularRadius: 0.06, priority: 2 });
      } else {
        for (const planet of this._planetPositions(state.apps.planetarium.simTime)) {
          add(`planet:${planet.id}`, planet.name, planet.position.x, planet.position.y, planet.position.z, { angularRadius: Math.max(0.035, planet.radius * 0.8), priority: 1 });
        }
        add('planetarium:pause', state.apps.planetarium.paused ? 'Resume' : 'Pause', -0.32, -0.5, -1.36);
        add('planetarium:speed', 'Time x', 0, -0.5, -1.36);
        add('planetarium:reset', 'Reset', 0.32, -0.5, -1.36);
      }
      this._systemBackTargets(add);
    } else if (app === 'portal') {
      if (state.apps.portal.selected) {
        add('portal:discover', 'Discover', 0, 0.05, -1.55, { angularRadius: 0.11, priority: 1 });
        add('portal:return', 'Back to Portals', 0, -0.54, -1.28, { angularRadius: 0.06, priority: 3 });
      } else {
        PORTALS.forEach((portal) => add(`portal:${portal.id}`, portal.name, portal.x, portal.y, portal.z, { angularRadius: 0.12, priority: 1.3 }));
        this._systemBackTargets(add);
      }
    } else if (app === 'hologram') {
      [['holo:left', 'Rotate -', -0.54], ['holo:right', 'Rotate +', -0.32], ['holo:model', state.apps.hologram.model, -0.1], ['holo:zoom', 'Zoom', 0.12], ['holo:auto', 'Auto', 0.34], ['holo:wire', 'Wire', 0.56]].forEach(([id, label, x]) => add(id, label, x, -0.48, -1.35));
      this._systemBackTargets(add);
    } else if (app === 'arcade') {
      for (const orb of state.apps.arcade.orbs) {
        if (!orb.active) continue;
        add(`arcade:${orb.id}`, 'Target', orb.x, orb.y, orb.z, { angularRadius: orb.radius * 0.9, priority: 2 });
      }
      add('arcade:restart', 'Restart', 0.25, -0.55, -1.35);
      this._systemBackTargets(add);
    } else if (app === 'music') {
      add('music:open', 'Open Audio', -0.35, -0.48, -1.35);
      add('music:play', state.media.audioPlaying ? 'Pause' : 'Play', 0, -0.48, -1.35);
      add('music:mode', state.apps.music.mode, 0.35, -0.48, -1.35);
      this._systemBackTargets(add);
    } else if (app === 'mini-worlds') {
      if (state.apps.miniWorlds.expanded) {
        add('world:collapse', 'Back to Mini Worlds', 0, -0.58, -1.28, { angularRadius: 0.06, priority: 3 });
      } else {
        MINI_WORLDS.forEach((world) => add(`world:${world.id}`, world.name, world.x, world.y, world.z, { angularRadius: 0.105, priority: 1 }));
        this._systemBackTargets(add);
      }
    } else if (app === 'passthrough') {
      if (state.apps.passthrough.quickPeek) {
        add('system:home', 'Return to VR', 0, -0.52, -1.2, { angularRadius: 0.065, priority: 3 });
      } else {
        add('passthrough:quick', 'Quick Peek', -0.38, -0.5, -1.25);
        add('passthrough:brightness', 'Brightness', -0.13, -0.5, -1.25);
        add('passthrough:effect', state.apps.passthrough.effect, 0.13, -0.5, -1.25);
        add('system:home', 'Return VR', 0.4, -0.5, -1.25, { priority: 2 });
      }
    } else if (app === 'settings') {
      const rows = [
        ['settings:selection', `Select ${state.settings.selectionMethod}`, -0.38, 0.24],
        ['settings:dwell', `Dwell ${state.settings.dwell ? 'On' : 'Off'}`, 0, 0.24],
        ['settings:assist', `Assist ${Math.round(state.settings.assist * 100)}%`, 0.38, 0.24],
        ['settings:stickiness', `Sticky ${state.settings.stickinessMs}ms`, -0.38, -0.06],
        ['settings:performance', `Perf ${state.performance.mode}`, 0, -0.06],
        ['settings:hands', `Hands ${state.settings.experimentalHands ? 'Labs' : 'Pinch'}`, 0.38, -0.06],
        ['settings:sound', `Sound ${state.settings.uiSound ? 'On' : 'Off'}`, -0.38, -0.32],
        ['system:recenter', 'Recenter', 0, -0.32],
        ['app:tracking-lab', 'Tracking Lab', 0.38, -0.32],
      ];
      rows.forEach(([id, label, x, y]) => add(id, label, x, y, -1.45, { angularRadius: 0.07 }));
      this._systemBackTargets(add);
    } else if (app === 'tracking-lab') {
      add('tracking:restart', 'Restart Hands', -0.28, -0.44, -1.35);
      add('system:recenter', 'Recenter', 0, -0.44, -1.35);
      add('tracking:test', 'Test Select', 0.28, -0.44, -1.35);
      this._systemBackTargets(add);
    } else if (app === 'gallery') {
      add('gallery:open', 'Choose Photos', 0, -0.48, -1.35);
      this._systemBackTargets(add);
    } else if (app === 'clock' || app === 'browser' || app === 'labs' || app === 'system-info') {
      this._systemBackTargets(add);
    }
    if (this.performance.quality.secondaryWindows) {
      for (const window of state.windows.windows.values()) {
        if (!window.visible || window.id === app) continue;
        const p = window.position;
        add(`window:focus:${window.id}`, window.title, p.x, p.y, p.z, { angularRadius: 0.085, priority: 0.65 });
        add(`window:move:${window.id}`, 'Move', p.x - 0.18, p.y - 0.23, p.z + 0.02, { angularRadius: 0.04 });
        add(`window:larger:${window.id}`, '+', p.x, p.y - 0.23, p.z + 0.02, { angularRadius: 0.04 });
        add(`window:close:${window.id}`, 'Close', p.x + 0.18, p.y - 0.23, p.z + 0.02, { angularRadius: 0.04 });
      }
    }
    return targets;
  }

  _dockTargets(add) {
    DOCK_APPS.forEach((id, i) => add(`app:${id}`, id, -0.52 + i * 0.208, -0.5, -1.32, { angularRadius: 0.052, priority: 2 }));
  }

  _systemBackTargets(add) {
    add('system:home', 'Home', -0.22, -0.62, -1.28, { angularRadius: 0.05, priority: 3 });
    add('system:switcher', 'Switcher', 0, -0.62, -1.28, { angularRadius: 0.05, priority: 3 });
    add('system:back', 'Back', 0.22, -0.62, -1.28, { angularRadius: 0.05, priority: 3 });
  }

  _planetPositions(time) {
    return PLANETS.map((planet) => {
      const angle = planet.phase + time * planet.speed * 0.00012;
      return {
        ...planet,
        position: v3(Math.cos(angle) * planet.orbit, Math.sin(angle * 0.33) * 0.05, -2.05 + Math.sin(angle) * planet.orbit * 0.3),
      };
    });
  }

  render(state) {
    this.resize();
    for (let eye = 0; eye < 2; eye += 1) this._renderEye(eye, state);
  }

  _renderEye(eye, state) {
    const ctx = this.contexts[eye];
    const width = this.widths[eye];
    const height = this.heights[eye];
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (state.appManager.activeAppId === 'passthrough') this._drawPassthrough(ctx, width, height, state);
    else this._drawEnvironment(ctx, width, height, eye, state);

    const app = state.appManager.activeAppId;
    if (app === 'home') this._drawHome(ctx, eye, state);
    else if (app === 'quick-settings') this._drawQuickSettings(ctx, eye, state);
    else if (app === 'switcher') this._drawSwitcher(ctx, eye, state);
    else if (app === 'library') this._drawLibrary(ctx, eye, state);
    else if (app === 'cinema') this._drawCinema(ctx, eye, state);
    else if (app === 'planetarium') this._drawPlanetarium(ctx, eye, state);
    else if (app === 'portal') this._drawPortal(ctx, eye, state);
    else if (app === 'hologram') this._drawHologram(ctx, eye, state);
    else if (app === 'arcade') this._drawArcade(ctx, eye, state);
    else if (app === 'music') this._drawMusic(ctx, eye, state);
    else if (app === 'mini-worlds') this._drawMiniWorlds(ctx, eye, state);
    else if (app === 'passthrough') this._drawPassthroughUi(ctx, eye, state);
    else if (app === 'settings') this._drawSettings(ctx, eye, state);
    else if (app === 'tracking-lab') this._drawTrackingLab(ctx, eye, state);
    else if (app === 'gallery') this._drawGallery(ctx, eye, state);
    else if (app === 'clock') this._drawClock(ctx, eye, state);
    else if (app === 'system-info') this._drawSystemInfo(ctx, eye, state);
    else if (app === 'browser') this._drawBrowser(ctx, eye, state);
    else if (app === 'labs') this._drawLabs(ctx, eye, state);

    this._drawHandPresence(ctx, eye, state);
    this._drawTransition(ctx, width, height, state);
    if (this.performance.quality.secondaryWindows) this._drawSecondaryWindows(ctx, eye, state);
    this._drawReticle(ctx, width, height, state);
    this._drawStatus(ctx, width, height, state);
    this._drawNotification(ctx, width, height, state);
  }

  _project(point, eye, state) {
    return projectWorld(point, state.headOrientation, this.widths[eye], this.heights[eye], eye === 0 ? -EYE_IPD / 2 : EYE_IPD / 2, FOV_Y);
  }

  _drawEnvironment(ctx, width, height, eye, state) {
    const app = state.appManager.activeAppId;
    const env = state.settings.environment || 'glass';
    const envColors = {
      glass: ['#07101f', '#02040a'],
      space: ['#020713', '#000106'],
      ocean: ['#06202c', '#02080e'],
      void: ['#030307', '#000000'],
    };
    const chosen = envColors[env] || envColors.glass;
    const top = app === 'cinema' ? '#020205' : app === 'music' ? '#07051a' : chosen[0];
    const bottom = app === 'cinema' ? '#000000' : chosen[1];
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    if (app !== 'cinema' && this.performance.quality.particles > 0.5) {
      ctx.save();
      for (const star of STARS) {
        const p = this._project(star, eye, state);
        if (!p) continue;
        const a = clamp(0.8 / p.depth, 0.08, 0.7);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#dce9ff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (!['planetarium', 'portal', 'music'].includes(app)) {
      ctx.strokeStyle = 'rgba(122,168,230,.075)';
      ctx.lineWidth = 1;
      for (let z = -0.8; z >= -4.5; z -= 0.55) {
        const a = this._project(v3(-2.4, -0.62, z), eye, state);
        const b = this._project(v3(2.4, -0.62, z), eye, state);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  _drawPanel(ctx, eye, state, center, widthM, heightM, title, subtitle = '') {
    const p = this._project(center, eye, state);
    if (!p) return null;
    const w = widthM * p.scale;
    const h = heightM * p.scale;
    const x = p.x - w / 2;
    const y = p.y - h / 2;
    drawGlass(ctx, x, y, w, h, { strong: true });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f7fbff';
    ctx.font = `700 ${clamp(22 / p.depth, 14, 24)}px -apple-system, system-ui`;
    ctx.fillText(title, x + 18, y + 15);
    if (subtitle) {
      ctx.fillStyle = 'rgba(224,236,255,.62)';
      ctx.font = `600 ${clamp(10 / p.depth, 8, 12)}px -apple-system, system-ui`;
      ctx.fillText(subtitle, x + 18, y + 43);
    }
    return { x, y, w, h, p };
  }

  _drawTargetCard(ctx, eye, state, target, { label, sublabel = '', size = 0.19, icon = '' } = {}) {
    const p = this._project(target.position, eye, state);
    if (!p) return;
    const s = size * p.scale;
    const active = state.aim?.targetId === target.id;
    drawGlass(ctx, p.x - s / 2, p.y - s / 2, s, s, { active });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = active ? '#ffffff' : '#eaf2ff';
    ctx.font = `800 ${clamp(22 / p.depth, 14, 24)}px -apple-system, system-ui`;
    ctx.fillText(icon || label?.slice(0, 2).toUpperCase() || '', p.x, p.y - 8);
    ctx.font = `700 ${clamp(9 / p.depth, 7, 11)}px -apple-system, system-ui`;
    ctx.fillText(label || target.label || '', p.x, p.y + s * 0.27);
    if (sublabel && active) {
      ctx.fillStyle = 'rgba(210,231,255,.72)';
      ctx.font = `600 ${clamp(7 / p.depth, 6, 9)}px -apple-system, system-ui`;
      ctx.fillText(sublabel, p.x, p.y + s * 0.38);
    }
  }

  _drawHome(ctx, eye, state) {
    this._drawPanel(ctx, eye, state, v3(0, 0.03, -1.67), 1.65, 0.95, 'Pocket VR', state.idle ? 'Ambient mode - move your head or pinch to restore controls' : 'LOOK + PINCH. Head aim is primary. Hands confirm.');
    if (state.idle) {
      const p = this._project(v3(0, 0.04, -1.48), eye, state);
      if (p) {
        const now = new Date();
        ctx.fillStyle = '#fff'; ctx.font = `800 ${clamp(42 / p.depth, 26, 48)}px -apple-system, system-ui`; ctx.textAlign = 'center';
        ctx.fillText(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), p.x, p.y);
        ctx.fillStyle = 'rgba(225,238,255,.58)'; ctx.font = '600 10px -apple-system, system-ui';
        ctx.fillText(now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }), p.x, p.y + 30);
      }
      return;
    }
    const targets = this.getTargets(state);
    for (const target of targets.filter((t) => t.id.startsWith('app:') && !DOCK_APPS.some((id) => t.id === `app:${id}`))) {
      const id = target.id.slice(4);
      const app = state.appManager.getManifest(id);
      this._drawTargetCard(ctx, eye, state, target, { label: app?.name || id, sublabel: 'Pinch to open', icon: app?.icon || '' });
    }
    for (const target of targets.filter((t) => t.id.startsWith('app:') && DOCK_APPS.some((id) => t.id === `app:${id}`))) {
      const id = target.id.slice(4);
      const app = state.appManager.getManifest(id);
      this._drawTargetCard(ctx, eye, state, target, { label: app?.name || id, size: 0.12, icon: app?.icon || '' });
    }
  }

  _drawQuickSettings(ctx, eye, state) {
    this._drawPanel(ctx, eye, state, v3(0, 0.02, -1.52), 1.5, 0.9, 'Quick Settings', 'Large controls for the things you need in-headset');
    for (const target of this.getTargets(state)) {
      if (target.id.startsWith('quick:') || target.id === 'system:home') this._drawButtonTarget(ctx, eye, state, target, 0.24, 0.12);
    }
  }

  _drawSwitcher(ctx, eye, state) {
    this._drawPanel(ctx, eye, state, v3(0, 0.02, -1.58), 1.4, 0.8, 'App Switcher', 'Running apps stay intentionally limited for iPhone performance');
    const targets = this.getTargets(state);
    for (const target of targets.filter((t) => t.id.startsWith('switcher:focus:'))) {
      const id = target.id.split(':')[2];
      const app = state.appManager.getManifest(id);
      this._drawTargetCard(ctx, eye, state, target, { label: app?.name || id, sublabel: 'Pinch to focus', size: 0.22, icon: app?.icon || '' });
    }
    for (const target of targets.filter((t) => t.id.startsWith('switcher:close:'))) this._drawButtonTarget(ctx, eye, state, target, 0.19, 0.08);
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawLibrary(ctx, eye, state) {
    this._drawPanel(ctx, eye, state, v3(0, 0.04, -1.62), 1.65, 1.08, 'App Library', `${state.apps.library.filter} apps - recent items remain available from Home`);
    for (const target of this.getTargets(state).filter((t) => t.id.startsWith('library:filter:'))) this._drawButtonTarget(ctx, eye, state, target, 0.2, 0.075);
    for (const target of this.getTargets(state).filter((t) => t.id.startsWith('app:'))) {
      const id = target.id.slice(4);
      const app = state.appManager.getManifest(id);
      this._drawTargetCard(ctx, eye, state, target, { label: app?.name || id, size: 0.15, icon: app?.icon || '' });
    }
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawCinema(ctx, eye, state) {
    const c = state.apps.cinema;
    const screenCenter = v3(0, 0.08, -c.distance);
    const p = this._project(screenCenter, eye, state);
    if (p) {
      const aspect = state.media.videoReady && state.media.video.videoHeight
        ? displayAspect(state.media.video.videoWidth, state.media.video.videoHeight, c.format)
        : 16 / 9;
      const widthM = 1.6 * c.size;
      const heightM = widthM / aspect;
      const w = widthM * p.scale;
      const h = heightM * p.scale;
      const x = p.x - w / 2;
      const y = p.y - h / 2;
      ctx.fillStyle = '#000';
      roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 8);
      ctx.fill();
      if (state.media.videoReady && state.media.video.readyState >= 2) {
        const video = state.media.video;
        try {
          const source = sourceRectForEye(video.videoWidth, video.videoHeight, c.format, eye);
          if (!c.curved) {
            ctx.drawImage(video, source.sx, source.sy, source.sw, source.sh, x, y, w, h);
          } else {
            const strips = this.performance.mode === 'performance' ? 8 : 14;
            for (let i = 0; i < strips; i += 1) {
              const t0 = i / strips;
              const t1 = (i + 1) / strips;
              const mid = (t0 + t1) / 2 - .5;
              const curve = 1 - Math.abs(mid) * .12;
              const sourceX = source.sx + source.sw * t0;
              const sourceW = source.sw / strips + 1;
              const destX = x + w * t0;
              const destW = w / strips + 1;
              const inset = (1 - curve) * h * .35;
              ctx.drawImage(video, sourceX, source.sy, sourceW, source.sh, destX, y + inset, destW, h - inset * 2);
            }
          }
        } catch (_) {
          ctx.fillStyle = '#111';
          ctx.fillRect(x, y, w, h);
        }
      } else {
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, '#111827');
        g.addColorStop(1, '#030408');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,.72)';
        ctx.font = '700 13px -apple-system, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Open a 2D or SBS video', p.x, p.y);
      }
    }
    if (c.controlsVisible || !state.media.videoReady) {
      for (const target of this.getTargets(state).filter((t) => t.id.startsWith('cinema:'))) this._drawButtonTarget(ctx, eye, state, target);
    }
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawPlanetarium(ctx, eye, state) {
    const focusId = state.apps.planetarium.focus;
    if (focusId) {
      const planet = PLANETS.find((item) => item.id === focusId) || PLANETS[2];
      const p = this._project(v3(0, 0.04, -1.38), eye, state);
      if (p) {
        const elapsed = Math.min(1, (state.now - state.apps.planetarium.focusEnteredAt) / 500);
        const radius = (0.12 + elapsed * 0.12) * p.scale;
        const color = planet.id === 'earth' ? '#5aa7ff' : planet.id === 'mars' ? '#dd795c' : planet.id === 'jupiter' ? '#d6b38e' : '#c8c6b8';
        const g = ctx.createRadialGradient(p.x - radius*.25, p.y - radius*.25, radius*.1, p.x, p.y, radius);
        g.addColorStop(0, '#ffffff'); g.addColorStop(.18, color); g.addColorStop(1, '#101622');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y,radius,0,Math.PI*2); ctx.fill();
        if (planet.id === 'saturn') { ctx.strokeStyle='rgba(225,205,170,.7)'; ctx.lineWidth=5; ctx.beginPath(); ctx.ellipse(p.x,p.y,radius*1.5,radius*.42,-.2,0,Math.PI*2); ctx.stroke(); }
        ctx.fillStyle='#fff';ctx.font='800 18px -apple-system, system-ui';ctx.textAlign='center';ctx.fillText(planet.name,p.x,p.y-radius-24);
        ctx.fillStyle='rgba(225,238,255,.62)';ctx.font='600 10px -apple-system, system-ui';ctx.fillText(`Orbit scale ${planet.orbit.toFixed(2)} | Relative rate ${planet.speed.toFixed(2)}`,p.x,p.y+radius+24);
      }
      this._drawBottomButtons(ctx, eye, state, ['planetarium:focus-back']);
      this._drawSystemButtons(ctx, eye, state);
      return;
    }
    const sun = this._project(v3(0, 0, -2.05), eye, state);
    if (sun) {
      const r = 0.16 * sun.scale;
      const glow = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, r * 2.5);
      glow.addColorStop(0, '#fff3ad');
      glow.addColorStop(.35, '#f7b74e');
      glow.addColorStop(1, 'rgba(247,183,78,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(sun.x, sun.y, r * 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd574';
      ctx.beginPath(); ctx.arc(sun.x, sun.y, r, 0, Math.PI * 2); ctx.fill();
    }
    const targetMap = new Map(this.getTargets(state).map((t) => [t.id, t]));
    for (const planet of this._planetPositions(state.apps.planetarium.simTime)) {
      const p = this._project(planet.position, eye, state);
      if (!p) continue;
      const active = state.aim?.targetId === `planet:${planet.id}` || state.apps.planetarium.focus === planet.id;
      ctx.strokeStyle = active ? 'rgba(168,220,255,.8)' : 'rgba(255,255,255,.11)';
      ctx.lineWidth = active ? 2 : 1;
      if (active) {
        ctx.beginPath(); ctx.arc(p.x, p.y, planet.radius * p.scale * 1.65, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = planet.id === 'earth' ? '#5aa7ff' : planet.id === 'mars' ? '#dd795c' : planet.id === 'jupiter' ? '#d6b38e' : '#c8c6b8';
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2.5, planet.radius * p.scale), 0, Math.PI * 2); ctx.fill();
      if (active) {
        ctx.fillStyle = '#fff'; ctx.font = '700 10px -apple-system, system-ui'; ctx.textAlign = 'center'; ctx.fillText(planet.name, p.x, p.y - 18);
      }
      void targetMap;
    }
    this._drawBottomButtons(ctx, eye, state, ['planetarium:pause', 'planetarium:speed', 'planetarium:reset']);
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawPortal(ctx, eye, state) {
    if (state.apps.portal.selected) {
      this._drawPortalWorld(ctx, eye, state, state.apps.portal.selected);
      this._drawBottomButtons(ctx, eye, state, ['portal:discover', 'portal:return']);
      return;
    }
    for (const portal of PORTALS) {
      const p = this._project(v3(portal.x, portal.y, portal.z), eye, state);
      if (!p) continue;
      const active = state.aim?.targetId === `portal:${portal.id}`;
      const radius = 0.23 * p.scale;
      const g = ctx.createRadialGradient(p.x, p.y, radius * .15, p.x, p.y, radius);
      const color = portal.id === 'ocean' ? '60,203,255' : portal.id === 'dream' ? '210,112,255' : '126,148,255';
      g.addColorStop(0, `rgba(${color},.06)`);
      g.addColorStop(.68, `rgba(${color},.45)`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = active ? '#fff' : `rgba(${color},.9)`;
      ctx.lineWidth = active ? 5 : 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, radius * .75, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '700 10px -apple-system, system-ui'; ctx.textAlign = 'center'; ctx.fillText(portal.name, p.x, p.y + radius + 15);
    }
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawHologram(ctx, eye, state) {
    const h = state.apps.hologram;
    const center = v3(0, 0.05, -1.65);
    const p = this._project(center, eye, state);
    if (p) {
      const s = 0.24 * h.zoom;
      const modelScaleY = h.model === 'Ship' ? 0.55 : h.model === 'Orb' ? 1.15 : 1;
      const verts = [
        [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
      ].map(([x,y,z]) => {
        const c = Math.cos(h.rotation), sn = Math.sin(h.rotation);
        const rx = (x * c - z * sn) * s;
        const rz = (x * sn + z * c) * s;
        return this._project(v3(center.x + rx, center.y + y * s * modelScaleY, center.z + rz), eye, state);
      });
      const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
      ctx.strokeStyle = '#72e7ff'; ctx.lineWidth = h.wireframe ? 1 : 2.5; ctx.shadowColor = '#54cfff'; ctx.shadowBlur = 12;
      for (const [a,b] of edges) if (verts[a] && verts[b]) { ctx.beginPath(); ctx.moveTo(verts[a].x, verts[a].y); ctx.lineTo(verts[b].x, verts[b].y); ctx.stroke(); }
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(170,237,255,.78)'; ctx.font = '700 11px -apple-system, system-ui'; ctx.textAlign = 'center'; ctx.fillText(`${h.model} Hologram`, p.x, p.y - 0.36 * p.scale);
    }
    this._drawBottomButtons(ctx, eye, state, ['holo:left','holo:right','holo:model','holo:zoom','holo:auto','holo:wire']);
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawArcade(ctx, eye, state) {
    for (const orb of state.apps.arcade.orbs) {
      if (!orb.active) continue;
      const p = this._project(v3(orb.x, orb.y, orb.z), eye, state);
      if (!p) continue;
      const r = orb.radius * p.scale;
      const active = state.aim?.targetId === `arcade:${orb.id}`;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.4);
      g.addColorStop(0, active ? '#ffffff' : '#7ff5ff');
      g.addColorStop(.35, '#4c8cff');
      g.addColorStop(1, 'rgba(76,140,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = active ? '#fff' : '#7ff5ff'; ctx.lineWidth = active ? 3 : 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.font = '800 16px -apple-system, system-ui'; ctx.textAlign = 'center'; ctx.fillText(`TARGET RUSH  ${state.apps.arcade.score}`, this.widths[eye] / 2, 58);
    this._drawBottomButtons(ctx, eye, state, ['arcade:restart']);
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawMusic(ctx, eye, state) {
    const width = this.widths[eye], height = this.heights[eye];
    const spectrum = state.media.spectrum || [];
    const count = Math.min(44, spectrum.length || 44);
    const cx = width / 2, cy = height / 2;
    const mode = state.apps.music.mode;
    for (let i = 0; i < count; i += 1) {
      const value = spectrum.length ? spectrum[i] / 255 : (0.12 + Math.sin(state.now * .002 + i) * .04);
      const angle = i / count * Math.PI * 2;
      if (mode === 'Tunnel') {
        const depth = (i / count) * 5 + (state.now * 0.00035 % 1);
        const radius = 24 + depth * 20 + value * 38;
        ctx.strokeStyle = `rgba(125,170,255,${0.18 + value * .65})`;
        ctx.lineWidth = 1 + value * 4;
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
      } else if (mode === 'Calm') {
        const radius = 46 + i * 1.7 + value * 28;
        ctx.fillStyle = `rgba(150,205,255,${0.06 + value * .28})`;
        ctx.beginPath(); ctx.arc(cx + Math.cos(angle + state.now * .00008) * radius, cy + Math.sin(angle + state.now * .00008) * radius * .55, 1.4 + value * 3, 0, Math.PI * 2); ctx.fill();
      } else {
        const radius = 54 + value * 96;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        ctx.strokeStyle = `rgba(${120 + Math.round(value * 120)},${120 + Math.round(value * 90)},255,.75)`;
        ctx.lineWidth = 2 + value * 6;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * 42, cy + Math.sin(angle) * 42); ctx.lineTo(x, y); ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '800 14px -apple-system, system-ui'; ctx.textAlign = 'center'; ctx.fillText('MUSIC ROOM', cx, cy + 5);
    this._drawBottomButtons(ctx, eye, state, ['music:open','music:play','music:mode']);
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawMiniWorlds(ctx, eye, state) {
    if (state.apps.miniWorlds.expanded) {
      this._drawExpandedMiniWorld(ctx, eye, state, state.apps.miniWorlds.expanded);
      this._drawBottomButtons(ctx, eye, state, ['world:collapse']);
      return;
    }
    for (const world of MINI_WORLDS) {
      const p = this._project(v3(world.x, world.y, world.z), eye, state);
      if (!p) continue;
      const active = state.aim?.targetId === `world:${world.id}`;
      const r = 0.16 * p.scale;
      ctx.fillStyle = active ? 'rgba(160,224,255,.28)' : 'rgba(82,113,156,.18)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + r * .38, r, r * .28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = active ? '#d7f4ff' : 'rgba(116,199,255,.75)'; ctx.lineWidth = active ? 3 : 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * .72, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 6; i += 1) {
        const a = i / 6 * Math.PI * 2 + state.now * 0.00025;
        ctx.fillStyle = i % 2 ? '#7de2ff' : '#b6a1ff';
        ctx.fillRect(p.x + Math.cos(a) * r * .45 - 2, p.y + Math.sin(a) * r * .18 - 2, 4, 4);
      }
      ctx.fillStyle = '#fff'; ctx.font = '700 9px -apple-system, system-ui'; ctx.textAlign = 'center'; ctx.fillText(world.name, p.x, p.y + r + 13);
    }
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawPortalWorld(ctx, eye, state, theme) {
    const width = this.widths[eye], height = this.heights[eye];
    if (theme === 'ocean') {
      const g = ctx.createLinearGradient(0, 0, 0, height);
      g.addColorStop(0, 'rgba(10,85,120,.72)'); g.addColorStop(1, 'rgba(0,18,34,.9)');
      ctx.fillStyle = g; ctx.fillRect(0,0,width,height);
      for (let i = 0; i < 34; i += 1) {
        const x = ((i * 91 + state.now * .025) % (width + 60)) - 30;
        const y = height - ((i * 47 + state.now * .018) % (height + 40));
        ctx.strokeStyle = 'rgba(180,240,255,.24)'; ctx.beginPath(); ctx.arc(x,y,2 + i%4,0,Math.PI*2); ctx.stroke();
      }
    } else if (theme === 'dream') {
      const g = ctx.createRadialGradient(width/2,height/2,0,width/2,height/2,width*.72);
      g.addColorStop(0,'rgba(170,95,255,.45)'); g.addColorStop(.45,'rgba(35,24,80,.72)'); g.addColorStop(1,'#02030a');
      ctx.fillStyle=g; ctx.fillRect(0,0,width,height);
      for (let i=0;i<22;i+=1){ const x=(i*73+state.now*.01)%width; const y=height*.25+Math.sin(i+state.now*.0007)*height*.28; ctx.fillStyle='rgba(210,190,255,.25)'; ctx.beginPath(); ctx.arc(x,y,3+(i%5),0,Math.PI*2); ctx.fill(); }
    } else {
      ctx.fillStyle='#01030a'; ctx.fillRect(0,0,width,height);
      for (let i=0;i<60;i+=1){ const x=(i*137.3)%width; const y=(i*71.7)%height; const pulse=.45+.35*Math.sin(state.now*.001+i); ctx.fillStyle=`rgba(220,235,255,${pulse})`; ctx.fillRect(x,y,1.2,1.2); }
    }
    ctx.fillStyle='rgba(255,255,255,.92)'; ctx.font='800 18px -apple-system, system-ui'; ctx.textAlign='center'; ctx.fillText(theme.toUpperCase(), width/2, 68);
    ctx.fillStyle='rgba(220,235,255,.58)'; ctx.font='600 10px -apple-system, system-ui'; ctx.fillText('A lightweight procedural portal world', width/2, 88);
  }

  _drawExpandedMiniWorld(ctx, eye, state, world) {
    const width=this.widths[eye], height=this.heights[eye];
    const themes={city:['#071326','#02040a'],island:['#0a3140','#042019'],moon:['#0b0d18','#020205'],forest:['#071a11','#020704'],station:['#0d1020','#020207']};
    const colors=themes[world]||themes.city;
    const g=ctx.createLinearGradient(0,0,0,height); g.addColorStop(0,colors[0]); g.addColorStop(1,colors[1]); ctx.fillStyle=g; ctx.fillRect(0,0,width,height);
    if(world==='city'){
      for(let i=0;i<18;i+=1){const w=14+(i%4)*7;const h=25+(i*19)%90;const x=(i*53)%width;ctx.fillStyle=`rgba(85,155,255,${.18+(i%3)*.12})`;ctx.fillRect(x,height*.72-h,w,h);}
    }else if(world==='island'){
      ctx.fillStyle='rgba(65,175,210,.28)';ctx.fillRect(0,height*.62,width,height*.38);ctx.fillStyle='#6d8d55';ctx.beginPath();ctx.ellipse(width/2,height*.66,width*.2,height*.08,0,0,Math.PI*2);ctx.fill();
    }else if(world==='moon'){
      ctx.fillStyle='#8b8e99';ctx.beginPath();ctx.arc(width*.5,height*.66,width*.22,Math.PI,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(170,220,255,.6)';ctx.strokeRect(width*.45,height*.5,width*.1,height*.1);
    }else if(world==='forest'){
      for(let i=0;i<24;i+=1){const x=(i*47)%width;const h=35+(i*13)%60;ctx.fillStyle='rgba(49,125,70,.55)';ctx.beginPath();ctx.moveTo(x,height*.73);ctx.lineTo(x+12,height*.73-h);ctx.lineTo(x+24,height*.73);ctx.fill();}
    }else{
      ctx.strokeStyle='rgba(125,210,255,.5)';ctx.lineWidth=2;for(let i=0;i<12;i+=1){ctx.strokeRect(width*.18+i*18,height*.48+(i%3)*12,80,28);}
    }
    ctx.fillStyle='#fff';ctx.font='800 18px -apple-system, system-ui';ctx.textAlign='center';ctx.fillText(world.replace('-', ' ').toUpperCase(),width/2,70);
  }

  _drawPassthroughEffect(ctx, eye, state) {
    const effect=state.apps.passthrough.effect;
    const width=this.widths[eye],height=this.heights[eye];
    if(effect==='Stars'){
      for(let i=0;i<28;i+=1){const x=(i*91+state.now*.012)%width;const y=(i*53)%height;ctx.fillStyle='rgba(205,235,255,.58)';ctx.fillRect(x,y,1.5,1.5);}
    } else if(effect==='Portal'){
      const r=Math.min(width,height)*.2;ctx.strokeStyle='rgba(130,190,255,.7)';ctx.lineWidth=4;ctx.beginPath();ctx.arc(width/2,height/2,r,0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(60,80,170,.14)';ctx.beginPath();ctx.arc(width/2,height/2,r*.9,0,Math.PI*2);ctx.fill();
    }
  }

  _drawPassthrough(ctx, width, height, state) {
    const video = state.cameraVideo;
    if (video?.readyState >= 2 && video.videoWidth > 0) {
      const sourceAspect = video.videoWidth / video.videoHeight;
      const targetAspect = width / height;
      let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
      if (sourceAspect > targetAspect) {
        sw = video.videoHeight * targetAspect;
        sx = (video.videoWidth - sw) / 2;
      } else {
        sh = video.videoWidth / targetAspect;
        sy = (video.videoHeight - sh) / 2;
      }
      try { ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height); } catch (_) { ctx.fillStyle = '#111'; ctx.fillRect(0,0,width,height); }
    } else {
      ctx.fillStyle = '#151515'; ctx.fillRect(0, 0, width, height);
    }
    const b = clamp(state.apps.passthrough.brightness, 0.2, 1.4);
    if (b < 1) {
      ctx.fillStyle = `rgba(0,0,0,${1 - b})`; ctx.fillRect(0,0,width,height);
    }
  }

  _drawPassthroughUi(ctx, eye, state) {
    const width = this.widths[eye];
    ctx.fillStyle = 'rgba(5,8,12,.48)';
    roundRect(ctx, width / 2 - 105, 18, 210, 30, 15); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 9px -apple-system, system-ui'; ctx.textAlign = 'center'; ctx.fillText(state.apps.passthrough.quickPeek ? 'QUICK PEEK - LOOK + CONFIRM' : 'PASSTHROUGH - CAMERA ACTIVE', width / 2, 37);
    this._drawPassthroughEffect(ctx, eye, state);
    this._drawBottomButtons(ctx, eye, state, state.apps.passthrough.quickPeek
      ? ['system:home']
      : ['passthrough:quick','passthrough:brightness','passthrough:effect','system:home']);
  }

  _drawSettings(ctx, eye, state) {
    this._drawPanel(ctx, eye, state, v3(0, 0.02, -1.55), 1.45, 0.9, 'Settings', 'Controls, accessibility and performance');
    for (const target of this.getTargets(state).filter((t) => t.id.startsWith('settings:') || t.id === 'system:recenter' || t.id === 'app:tracking-lab')) this._drawButtonTarget(ctx, eye, state, target, 0.23, 0.11);
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawTrackingLab(ctx, eye, state) {
    const panel = this._drawPanel(ctx, eye, state, v3(0, 0.02, -1.55), 1.35, 0.82, 'Tracking Lab', 'Diagnostics stay out of normal Pocket VR');
    if (panel) {
      const metrics = state.trackingMetrics || {};
      const lines = [
        `Aim: HEAD    Select: ${state.settings.selectionMethod.toUpperCase()}`,
        `Target: ${state.aim?.targetId || '-'}`,
        `Hands: L ${state.handSummary.left}   R ${state.handSummary.right}`,
        `Tracking: ${(metrics.trackingFps || 0).toFixed(0)} fps   Inference: ${(metrics.inferenceMs || 0).toFixed(1)} ms`,
        `Scheduler: ${metrics.scheduler || 'default'}   Watchdog: ${metrics.watchdogRestarts || 0}`,
        `Render: ${state.performance.fps.toFixed(0)} fps   Mode: ${state.performance.mode}`,
        `Camera: ${state.cameraInfo?.lens || 'not ready'}`,
      ];
      ctx.fillStyle = 'rgba(226,239,255,.8)'; ctx.font = '700 9px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left';
      lines.forEach((line, i) => ctx.fillText(line, panel.x + 18, panel.y + 78 + i * 16));
    }
    this._drawBottomButtons(ctx, eye, state, ['tracking:restart','system:recenter','tracking:test']);
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawGallery(ctx, eye, state) {
    this._drawPanel(ctx, eye, state, v3(0, 0.02, -1.55), 1.45, 0.9, 'Spatial Gallery', state.media.images.length ? `${state.media.images.length} local image(s)` : 'Choose images with the iPhone picker');
    const images = state.media.images.slice(0, 5);
    images.forEach((image, i) => {
      const point = this._project(v3(-0.52 + i * 0.26, 0.03, -1.45), eye, state);
      if (!point) return;
      const w = 0.22 * point.scale, h = 0.16 * point.scale;
      try { ctx.drawImage(image.element, point.x - w / 2, point.y - h / 2, w, h); } catch (_) {}
      ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.strokeRect(point.x - w / 2, point.y - h / 2, w, h);
    });
    this._drawBottomButtons(ctx, eye, state, ['gallery:open']);
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawClock(ctx, eye, state) {
    const p = this._drawPanel(ctx, eye, state, v3(0, 0.02, -1.5), 1.0, 0.55, 'Clock', 'Local browser time');
    if (p) {
      const date = new Date();
      const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const day = date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
      ctx.fillStyle = '#fff'; ctx.font = '800 38px -apple-system, system-ui'; ctx.textAlign = 'center'; ctx.fillText(time, p.x + p.w/2, p.y + p.h/2 + 5);
      ctx.fillStyle = 'rgba(226,238,255,.65)'; ctx.font = '600 11px -apple-system, system-ui'; ctx.fillText(day, p.x + p.w/2, p.y + p.h/2 + 31);
    }
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawSystemInfo(ctx, eye, state) {
    const p = this._drawPanel(ctx, eye, state, v3(0, 0.02, -1.5), 1.24, 0.72, 'System Info', 'Only capabilities actually exposed to the web app');
    if (p) {
      const caps = state.capabilities || {};
      const lines = [
        ['Build', '0.3.0 candidate.1'],
        ['Mode', state.appManager.activeAppId],
        ['Renderer', 'Canvas2D stereo spatial renderer'],
        ['WebGL2 available', caps.webgl2 ? 'Yes' : 'No'],
        ['Camera API', caps.camera ? 'Yes' : 'No'],
        ['Motion API', caps.motion ? 'Yes' : 'No'],
        ['Gamepad API', caps.gamepad ? 'Yes' : 'No'],
        ['Fullscreen API', caps.fullscreen ? 'Yes' : 'No'],
        ['Display', `${Math.round(this.widths[eye])} x ${Math.round(this.heights[eye])} per eye CSS px`],
      ];
      ctx.textAlign='left';ctx.font='700 9px -apple-system, system-ui';
      lines.forEach(([k,v],i)=>{ctx.fillStyle='rgba(213,230,250,.56)';ctx.fillText(k,p.x+24,p.y+78+i*18);ctx.fillStyle='#f4f8ff';ctx.fillText(String(v),p.x+p.w*.43,p.y+78+i*18);});
    }
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawBrowser(ctx, eye, state) {
    const p = this._drawPanel(ctx, eye, state, v3(0, 0.02, -1.5), 1.32, 0.72, 'Pocket Browser', 'Internal web panel - external sites open in Safari');
    if (p) {
      ctx.fillStyle = 'rgba(255,255,255,.08)'; roundRect(ctx, p.x + 22, p.y + 82, p.w - 44, 42, 14); ctx.fill();
      ctx.fillStyle = 'rgba(235,244,255,.78)'; ctx.font = '600 10px -apple-system, system-ui'; ctx.textAlign = 'left'; ctx.fillText('Use the touch address field outside headset mode for reliable text input.', p.x + 36, p.y + 107);
    }
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawLabs(ctx, eye, state) {
    const p = this._drawPanel(ctx, eye, state, v3(0, 0.02, -1.5), 1.3, 0.72, 'Labs', 'Experimental systems are isolated from primary navigation');
    if (p) {
      const items = ['Spatial Hands', 'Direct Touch', 'Hand Ray', '6DoF Research', 'Camera Effects', 'Tracking Visualiser'];
      ctx.fillStyle = 'rgba(230,242,255,.78)'; ctx.font = '700 11px -apple-system, system-ui'; ctx.textAlign = 'left';
      items.forEach((item, i) => ctx.fillText(item, p.x + 35 + (i % 2) * (p.w / 2 - 20), p.y + 95 + Math.floor(i/2) * 42));
    }
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawButtonTarget(ctx, eye, state, target, widthM = 0.19, heightM = 0.12) {
    const p = this._project(target.position, eye, state);
    if (!p) return;
    const w = widthM * p.scale, h = heightM * p.scale;
    const active = state.aim?.targetId === target.id;
    drawGlass(ctx, p.x - w/2, p.y - h/2, w, h, { active });
    ctx.fillStyle = '#fff'; ctx.font = `700 ${clamp(9 / p.depth, 7, 11)}px -apple-system, system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(target.label, p.x, p.y);
  }

  _drawBottomButtons(ctx, eye, state, ids) {
    const map = new Map(this.getTargets(state).map((t) => [t.id, t]));
    for (const id of ids) {
      const target = map.get(id);
      if (target) this._drawButtonTarget(ctx, eye, state, target, 0.22, 0.11);
    }
  }

  _drawSystemButtons(ctx, eye, state) {
    const targets = this.getTargets(state).filter((t) => t.id.startsWith('system:'));
    for (const target of targets) this._drawButtonTarget(ctx, eye, state, target, 0.18, 0.09);
  }

  _drawTransition(ctx, width, height, state) {
    const p = state.transitionProgress || 0;
    if (p <= 0) return;
    const g = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * .7);
    g.addColorStop(0, `rgba(150,205,255,${p * .12})`);
    g.addColorStop(1, `rgba(0,0,0,${p * .42})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  _drawHandPresence(ctx, eye, state) {
    const hands = state.hands || {};
    for (const side of ['left', 'right']) {
      const hand = hands[side];
      if (!hand?.tracked || !Array.isArray(hand.jointsWorld) || hand.jointsWorld.length < 21) continue;
      const points = hand.jointsWorld.map((joint) => this._project(joint, eye, state));
      if (!points[0]) continue;
      const alpha = Math.max(0.16, Math.min(0.62, Number(hand.fade) || 0.55));
      const color = side === 'left' ? '112,226,255' : '236,145,255';
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(${color},.72)`;
      ctx.fillStyle = `rgba(${color},.78)`;
      ctx.shadowColor = `rgba(${color},.65)`;
      ctx.shadowBlur = 7;
      for (const [a,b] of HAND_CONNECTIONS) {
        if (!points[a] || !points[b]) continue;
        ctx.lineWidth = Math.max(1.2, Math.min(4, 3.6 / ((points[a].depth + points[b].depth) / 2)));
        ctx.beginPath(); ctx.moveTo(points[a].x, points[a].y); ctx.lineTo(points[b].x, points[b].y); ctx.stroke();
      }
      for (const index of [0,4,8,12,16,20]) {
        const p = points[index];
        if (!p) continue;
        const r = index === 4 || index === 8 ? 3.2 : 2.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      }
      const pinched = ['start','held'].includes(hand.gesture?.pinchPhase);
      if (pinched && points[4] && points[8]) {
        const x = (points[4].x + points[8].x) / 2;
        const y = (points[4].y + points[8].y) / 2;
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawSecondaryWindows(ctx, eye, state) {
    const app = state.appManager.activeAppId;
    for (const window of state.windows.windows.values()) {
      if (!window.visible || window.id === app) continue;
      const p = this._project(window.position, eye, state);
      if (!p) continue;
      const w = window.width * window.scale * p.scale;
      const h = window.height * window.scale * p.scale;
      const x = p.x - w / 2;
      const y = p.y - h / 2;
      const focused = state.aim?.targetId === `window:focus:${window.id}`;
      drawGlass(ctx, x, y, w, h, { active: focused, strong: true });
      ctx.fillStyle = '#fff';
      ctx.font = `750 ${clamp(14 / p.depth, 10, 16)}px -apple-system, system-ui`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(window.title, x + 14, y + 12);
      if (window.id === 'clock') {
        const now = new Date();
        ctx.textAlign = 'center';
        ctx.font = `800 ${clamp(30 / p.depth, 20, 38)}px -apple-system, system-ui`;
        ctx.fillText(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), p.x, p.y - 5);
      } else {
        ctx.fillStyle = 'rgba(225,238,255,.62)';
        ctx.font = `600 ${clamp(9 / p.depth, 7, 11)}px -apple-system, system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText('Secondary spatial window', p.x, p.y);
      }
      for (const target of this.getTargets(state).filter((t) => t.id.endsWith(`:${window.id}`) && t.id.startsWith('window:') && !t.id.startsWith('window:focus:'))) {
        this._drawButtonTarget(ctx, eye, state, target, 0.14, 0.065);
      }
    }
  }

  _drawReticle(ctx, width, height, state) {
    const cx = width / 2, cy = height / 2;
    const hasTarget = Boolean(state.aim?.targetId);
    const pinch = state.pinchActive;
    const radius = pinch ? 5 : (hasTarget ? 8 : 4);
    ctx.save();
    if (state.idle && state.appManager.activeAppId === 'home') ctx.globalAlpha = 0.18;
    ctx.strokeStyle = pinch ? '#ffffff' : (hasTarget ? 'rgba(183,226,255,.95)' : 'rgba(255,255,255,.42)');
    ctx.fillStyle = pinch ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.08)';
    ctx.lineWidth = hasTarget ? 2 : 1;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (state.settings.dwell && hasTarget) {
      const progress = clamp((state.aim?.heldMs || 0) / 1100, 0, 1);
      ctx.strokeStyle = '#a9ddff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, radius + 4, -Math.PI/2, -Math.PI/2 + progress * Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  _drawStatus(ctx, width, height, state) {
    if (state.idle && state.appManager.activeAppId === 'home') return;
    const text = `${state.appManager.active?.name || 'Pocket VR'} | ${state.inputStatus}`;
    ctx.save();
    ctx.font = '700 8px -apple-system, system-ui';
    const w = Math.min(width * .72, ctx.measureText(text).width + 28);
    const x = (width - w) / 2, y = 10;
    roundRect(ctx, x, y, w, 27, 13.5);
    ctx.fillStyle = 'rgba(5,9,16,.64)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.stroke();
    ctx.fillStyle = 'rgba(235,245,255,.82)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, width/2, y + 14);
    ctx.restore();
  }

  _drawNotification(ctx, width, height, state) {
    const item = state.notification;
    if (!item) return;
    ctx.save(); ctx.font = '700 9px -apple-system, system-ui';
    const w = Math.min(width * .78, ctx.measureText(item.message).width + 32);
    const x = (width - w)/2, y = 48;
    roundRect(ctx, x, y, w, 30, 15); ctx.fillStyle = 'rgba(24,36,52,.86)'; ctx.fill(); ctx.strokeStyle = 'rgba(157,213,255,.38)'; ctx.stroke();
    ctx.fillStyle = '#f8fbff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(item.message, width/2, y + 15);
    ctx.restore();
  }
}
