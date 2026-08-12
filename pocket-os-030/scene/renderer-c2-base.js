import { SpatialRenderer as SpatialRendererC1 } from './renderer.js';
import { clamp, v3 } from '../core/math.js';
import { filterLibraryApps } from '../core/library-search.js';
import { BUILD_SHORT } from '../core/version.js';

const ENVIRONMENTS = [
  { id: 'glass', name: 'Glass Studio', x: -0.48, y: 0.2, tint: '#82b9ff' },
  { id: 'dark', name: 'Dark Studio', x: 0, y: 0.2, tint: '#6c7899' },
  { id: 'space', name: 'Space', x: 0.48, y: 0.2, tint: '#8178ff' },
  { id: 'ocean', name: 'Ocean', x: -0.48, y: -0.18, tint: '#51d7ff' },
  { id: 'void', name: 'Void', x: 0, y: -0.18, tint: '#45455c' },
  { id: 'minimal', name: 'Minimal Room', x: 0.48, y: -0.18, tint: '#d8e7ff' },
];

function addTarget(targets, id, label, x, y, z, options = {}) {
  targets.push({
    id,
    label,
    position: v3(x, y, z),
    angularRadius: options.angularRadius || 0.055,
    priority: options.priority || 0,
    disabled: Boolean(options.disabled),
    action: options.action || id,
    meta: options.meta || null,
  });
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, '0');
  return `${minutes}:${secs}`;
}

export class SpatialRenderer extends SpatialRendererC1 {
  getTargets(state) {
    let targets = super.getTargets(state);
    const app = state.appManager.activeAppId;

    if (app === 'library') {
      targets = targets.filter((target) => !target.id.startsWith('library:filter:') && !target.id.startsWith('app:'));
      const filters = ['Featured', 'Recent', 'Favourites', 'Media', 'Utility', 'Labs'];
      filters.forEach((name, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        addTarget(targets, `library:filter:${name}`, name, -0.38 + col * 0.38, 0.48 - row * 0.14, -1.48, {
          angularRadius: 0.047,
          priority: state.apps.library.filter === name ? 1.5 : 0,
        });
      });
      addTarget(targets, 'library:search', state.apps.library.query ? `Search: ${state.apps.library.query}` : 'Search', 0.62, 0.48, -1.48, { angularRadius: 0.055, priority: 1 });
      const apps = filterLibraryApps(state.appManager.all(), {
        filter: state.apps.library.filter,
        query: state.apps.library.query,
        favourites: state.appManager.favourites,
        recents: state.appManager.recents,
      }).slice(0, 8);
      apps.forEach((item, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        addTarget(targets, `app:${item.id}`, item.name, -0.57 + col * 0.38, 0.12 - row * 0.31, -1.55, { angularRadius: 0.068, priority: 0.5 });
      });
    }

    if (app === 'settings') {
      targets = targets.filter((target) => !target.id.startsWith('settings:') && target.id !== 'app:tracking-lab');
      const rows = [
        ['settings:selection', `Select ${state.settings.selectionMethod}`, -0.54, 0.34],
        ['settings:hold', `Hold ${state.settings.holdMs}ms`, -0.18, 0.34],
        ['settings:assist', `Assist ${Math.round(state.settings.assist * 100)}%`, 0.18, 0.34],
        ['settings:stickiness', `Sticky ${state.settings.stickinessMs}ms`, 0.54, 0.34],
        ['settings:motion', `Motion ${state.settings.reduceMotion ? 'Reduced' : 'Full'}`, -0.54, 0.06],
        ['settings:transparency', `Glass ${state.settings.reduceTransparency ? 'Solid' : 'Layered'}`, -0.18, 0.06],
        ['settings:contrast', `Contrast ${state.settings.highContrast ? 'High' : 'Normal'}`, 0.18, 0.06],
        ['settings:brightness', `World ${Math.round(state.settings.worldBrightness * 100)}%`, 0.54, 0.06],
        ['settings:performance', `Perf ${state.performance.mode}`, -0.54, -0.22],
        ['settings:sound', `Sound ${state.settings.uiSound ? 'On' : 'Off'}`, -0.18, -0.22],
        ['settings:hands', `Hands ${state.settings.experimentalHands ? 'Labs' : 'Pinch'}`, 0.18, -0.22],
        ['system:recenter', 'Recenter', 0.54, -0.22],
        ['app:environments', 'Environments', -0.38, -0.47],
        ['app:tracking-lab', 'Tracking Lab', 0, -0.47],
        ['settings:reset', 'Reset Settings', 0.38, -0.47],
      ];
      rows.forEach(([id, label, x, y]) => addTarget(targets, id, label, x, y, -1.48, { angularRadius: 0.06, priority: id === 'system:recenter' ? 2 : 0 }));
    }

    if (app === 'cinema' && (state.apps.cinema.controlsVisible || !state.media.videoReady)) {
      addTarget(targets, 'cinema:environment', `Theatre ${state.apps.cinema.environment}`, -0.55, 0.41, -1.55, { angularRadius: 0.05 });
      addTarget(targets, 'cinema:brightness', `Dim ${Math.round(state.apps.cinema.environmentBrightness * 100)}%`, 0.55, 0.41, -1.55, { angularRadius: 0.05 });
      [25, 50, 75].forEach((percent, i) => addTarget(targets, `cinema:seek-percent:${percent}`, `${percent}%`, -0.26 + i * 0.26, -0.31, -1.42, { angularRadius: 0.04 }));
    }

    if (app === 'gallery') {
      addTarget(targets, 'gallery:mode', `Mode ${state.apps.gallery.mode}`, -0.34, -0.47, -1.36, { angularRadius: 0.05 });
      addTarget(targets, 'gallery:prev', 'Previous', 0, -0.47, -1.36, { angularRadius: 0.05, disabled: !state.media.images.length });
      addTarget(targets, 'gallery:next', 'Next', 0.34, -0.47, -1.36, { angularRadius: 0.05, disabled: !state.media.images.length });
      if (state.apps.gallery.mode === 'Grid') {
        state.media.images.slice(0, 8).forEach((image, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          addTarget(targets, `gallery:image:${i}`, image.name || `Image ${i + 1}`, -0.52 + col * 0.35, 0.18 - row * 0.3, -1.44, { angularRadius: 0.07 });
        });
      }
    }

    if (app === 'environments') {
      ENVIRONMENTS.forEach((env) => addTarget(targets, `environment:set:${env.id}`, env.name, env.x, env.y, -1.52, {
        angularRadius: 0.095,
        priority: state.settings.environment === env.id ? 2 : 0.5,
      }));
      this._systemBackTargets((id, label, x, y, z, options = {}) => addTarget(targets, id, label, x, y, z, options));
    }

    if (app === 'focus') {
      addTarget(targets, 'focus:toggle', state.apps.focus.running ? 'Pause' : 'Start', -0.3, -0.28, -1.38, { angularRadius: 0.065 });
      addTarget(targets, 'focus:duration', `${state.apps.focus.durationMinutes} min`, 0, -0.28, -1.38, { angularRadius: 0.065 });
      addTarget(targets, 'focus:reset', 'Reset', 0.3, -0.28, -1.38, { angularRadius: 0.065 });
      this._systemBackTargets((id, label, x, y, z, options = {}) => addTarget(targets, id, label, x, y, z, options));
    }

    if (this.performance.quality.secondaryWindows) {
      const id = state.windows.focusedId;
      const window = id && state.windows.windows.get(id);
      if (window && id !== app && window.visible) {
        const p = window.position;
        addTarget(targets, `window:resize:${id}`, 'Resize', p.x - 0.28, p.y - 0.32, p.z + 0.02, { angularRadius: 0.038, priority: 0.5 });
        addTarget(targets, `window:pin:${id}`, window.pinned ? 'Unpin' : 'Pin', p.x - 0.14, p.y - 0.32, p.z + 0.02, { angularRadius: 0.038 });
        addTarget(targets, `window:snap-left:${id}`, 'Left', p.x, p.y - 0.32, p.z + 0.02, { angularRadius: 0.035 });
        addTarget(targets, `window:snap-center:${id}`, 'Centre', p.x + 0.14, p.y - 0.32, p.z + 0.02, { angularRadius: 0.035 });
        addTarget(targets, `window:snap-right:${id}`, 'Right', p.x + 0.28, p.y - 0.32, p.z + 0.02, { angularRadius: 0.035 });
      }
    }

    return targets;
  }

  _renderEye(eye, state) {
    const app = state.appManager.activeAppId;
    if (!['environments', 'focus'].includes(app)) {
      super._renderEye(eye, state);
      return;
    }
    const ctx = this.contexts[eye];
    const width = this.widths[eye];
    const height = this.heights[eye];
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this._drawEnvironment(ctx, width, height, eye, state);
    if (app === 'environments') this._drawEnvironments(ctx, eye, state);
    else this._drawFocus(ctx, eye, state);
    this._drawHandPresence(ctx, eye, state);
    if (this.performance.quality.secondaryWindows) this._drawSecondaryWindows(ctx, eye, state);
    this._drawReticle(ctx, width, height, state);
    this._drawStatus(ctx, width, height, state);
    this._drawNotification(ctx, width, height, state);
  }

  _drawEnvironment(ctx, width, height, eye, state) {
    super._drawEnvironment(ctx, width, height, eye, state);
    const brightness = clamp(state.settings.worldBrightness ?? 1, 0.45, 1.15);
    if (brightness < 1) {
      ctx.fillStyle = `rgba(0,0,0,${1 - brightness})`;
      ctx.fillRect(0, 0, width, height);
    } else if (brightness > 1) {
      ctx.fillStyle = `rgba(150,195,255,${(brightness - 1) * 0.22})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  _drawLibrary(ctx, eye, state) {
    this._drawPanel(ctx, eye, state, v3(0, 0.03, -1.62), 1.72, 1.12, 'App Library', state.apps.library.query ? `Search: ${state.apps.library.query}` : `${state.apps.library.filter} · native keyboard search available`);
    const targets = this.getTargets(state);
    for (const target of targets.filter((item) => item.id.startsWith('library:filter:') || item.id === 'library:search')) this._drawButtonTarget(ctx, eye, state, target, 0.2, 0.075);
    for (const target of targets.filter((item) => item.id.startsWith('app:'))) {
      const id = target.id.slice(4);
      const app = state.appManager.getManifest(id);
      this._drawTargetCard(ctx, eye, state, target, { label: app?.name || id, size: 0.15, icon: app?.icon || '' });
    }
    if (!targets.some((item) => item.id.startsWith('app:'))) {
      const p = this._project(v3(0, 0.05, -1.5), eye, state);
      if (p) {
        ctx.fillStyle = 'rgba(230,240,255,.62)';
        ctx.font = '700 12px -apple-system, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('No apps match this search', p.x, p.y);
      }
    }
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawSettings(ctx, eye, state) {
    this._drawPanel(ctx, eye, state, v3(0, 0.01, -1.58), 1.65, 1.1, 'Settings', 'Controls · Appearance · Accessibility · Performance · Experimental');
    for (const target of this.getTargets(state)) {
      if (target.id.startsWith('settings:') || target.id.startsWith('app:') || target.id === 'system:recenter') this._drawButtonTarget(ctx, eye, state, target, 0.25, 0.105);
    }
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawCinema(ctx, eye, state) {
    super._drawCinema(ctx, eye, state);
    const c = state.apps.cinema;
    if (!(c.controlsVisible || !state.media.videoReady)) return;
    const targets = this.getTargets(state);
    for (const target of targets.filter((item) => item.id === 'cinema:environment' || item.id === 'cinema:brightness' || item.id.startsWith('cinema:seek-percent:'))) {
      this._drawButtonTarget(ctx, eye, state, target, itemWidth(target.id), 0.075);
    }
    const video = state.media.video;
    const width = this.widths[eye];
    const height = this.heights[eye];
    const duration = Number(video?.duration) || 0;
    const current = Number(video?.currentTime) || 0;
    const progress = duration > 0 ? clamp(current / duration, 0, 1) : 0;
    const barWidth = Math.min(width * 0.52, 300);
    const x = (width - barWidth) / 2;
    const y = height * 0.72;
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.fillRect(x, y, barWidth, 3);
    ctx.fillStyle = 'rgba(173,220,255,.86)';
    ctx.fillRect(x, y, barWidth * progress, 3);
    ctx.fillStyle = 'rgba(230,240,255,.68)';
    ctx.font = '700 8px -apple-system, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${formatTime(current)} / ${formatTime(duration)} · ${c.format.toUpperCase()} · ${c.environment}`, width / 2, y + 15);
  }

  _drawGallery(ctx, eye, state) {
    const images = state.media.images;
    const mode = state.apps.gallery.mode;
    const selected = clamp(state.apps.gallery.selectedIndex || 0, 0, Math.max(0, images.length - 1));
    this._drawPanel(ctx, eye, state, v3(0, 0.02, -1.56), 1.5, 0.94, 'Spatial Gallery', images.length ? `${mode} · ${images.length} local image(s)` : 'Choose images with the trusted iPhone picker');
    if (mode === 'Grid') {
      images.slice(0, 8).forEach((image, i) => {
        const point = this._project(v3(-0.52 + (i % 4) * 0.35, 0.18 - Math.floor(i / 4) * 0.3, -1.44), eye, state);
        if (!point) return;
        const w = 0.22 * point.scale, h = 0.15 * point.scale;
        try { ctx.drawImage(image.element, point.x - w / 2, point.y - h / 2, w, h); } catch (_) {}
        ctx.strokeStyle = state.aim?.targetId === `gallery:image:${i}` ? '#d9f3ff' : 'rgba(255,255,255,.26)';
        ctx.lineWidth = state.aim?.targetId === `gallery:image:${i}` ? 2 : 1;
        ctx.strokeRect(point.x - w / 2, point.y - h / 2, w, h);
      });
    } else if (images[selected]) {
      const point = this._project(v3(0, 0.05, -1.48), eye, state);
      if (point) {
        const w = (mode === 'Immersive' ? 0.9 : 0.66) * point.scale;
        const h = w * 0.66;
        try { ctx.drawImage(images[selected].element, point.x - w / 2, point.y - h / 2, w, h); } catch (_) {}
        ctx.strokeStyle = 'rgba(225,243,255,.48)';
        ctx.strokeRect(point.x - w / 2, point.y - h / 2, w, h);
      }
    }
    this._drawBottomButtons(ctx, eye, state, ['gallery:open', 'gallery:mode', 'gallery:prev', 'gallery:next']);
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawSecondaryWindows(ctx, eye, state) {
    super._drawSecondaryWindows(ctx, eye, state);
    const id = state.windows.focusedId;
    if (!id || id === state.appManager.activeAppId) return;
    for (const target of this.getTargets(state).filter((item) => item.id.endsWith(`:${id}`) && (item.id.startsWith('window:resize:') || item.id.startsWith('window:pin:') || item.id.startsWith('window:snap-')))) {
      this._drawButtonTarget(ctx, eye, state, target, 0.13, 0.055);
    }
  }

  _drawReticle(ctx, width, height, state) {
    super._drawReticle(ctx, width, height, state);
    if (!state.settings.highContrast) return;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawEnvironments(ctx, eye, state) {
    this._drawPanel(ctx, eye, state, v3(0, 0.02, -1.6), 1.58, 0.94, 'Environments', `Current: ${state.settings.environment} · lightweight procedural worlds`);
    for (const env of ENVIRONMENTS) {
      const target = this.getTargets(state).find((item) => item.id === `environment:set:${env.id}`);
      if (!target) continue;
      const p = this._project(target.position, eye, state);
      if (!p) continue;
      const r = 0.115 * p.scale;
      ctx.fillStyle = env.tint;
      ctx.globalAlpha = state.settings.environment === env.id ? 0.72 : 0.34;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 6, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = state.aim?.targetId === target.id ? '#fff' : 'rgba(255,255,255,.28)';
      ctx.lineWidth = state.aim?.targetId === target.id ? 3 : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 6, r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '700 9px -apple-system, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(env.name, p.x, p.y + r + 12);
    }
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawFocus(ctx, eye, state) {
    const focus = state.apps.focus;
    const panel = this._drawPanel(ctx, eye, state, v3(0, 0.02, -1.5), 1.05, 0.63, 'Focus', 'Minimal timer · gaze controls only when needed');
    if (panel) {
      const remaining = Math.max(0, focus.remainingMs);
      const mins = Math.floor(remaining / 60000);
      const secs = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
      ctx.fillStyle = '#fff';
      ctx.font = '800 38px -apple-system, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${mins}:${secs}`, panel.x + panel.w / 2, panel.y + panel.h / 2 + 6);
      ctx.fillStyle = 'rgba(223,237,255,.58)';
      ctx.font = '700 9px -apple-system, system-ui';
      ctx.fillText(focus.running ? 'Focus session active' : 'Ready', panel.x + panel.w / 2, panel.y + panel.h / 2 + 34);
    }
    this._drawBottomButtons(ctx, eye, state, ['focus:toggle', 'focus:duration', 'focus:reset']);
    this._drawSystemButtons(ctx, eye, state);
  }

  _drawStatus(ctx, width, height, state) {
    super._drawStatus(ctx, width, height, state);
    if (!state.settings.highContrast) return;
    ctx.strokeStyle = 'rgba(255,255,255,.65)';
    ctx.lineWidth = 1;
    ctx.strokeRect(width / 2 - 2, 10, 4, 27);
  }
}

function itemWidth(id) {
  return id.startsWith('cinema:seek-percent:') ? 0.15 : 0.24;
}
