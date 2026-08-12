import { SpatialRenderer as SpatialRendererC2Base } from './renderer-c2-base.js';
import { clamp, v3 } from '../core/math.js';

function roundRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function addTarget(targets, id, label, position, options = {}) {
  targets.push({
    id,
    label,
    position,
    angularRadius: options.angularRadius || 0.04,
    priority: options.priority || 0,
    disabled: Boolean(options.disabled),
    action: options.action || id,
    meta: options.meta || null,
  });
}

export class SpatialRenderer extends SpatialRendererC2Base {
  getTargets(state) {
    let targets = super.getTargets(state);

    // Deduplicate inherited targets (notably Recenter in the expanded Settings
    // layout) so target scoring has one authoritative target per action.
    targets = [...new Map(targets.map((target) => [target.id, target])).values()];

    // The C2 base initially showed advanced controls only for focused windows.
    // In practice the active app is focused, while manipulation is needed on a
    // visible secondary window. Add the controls to every secondary panel. The
    // app budget limits these to at most two lightweight windows.
    targets = targets.filter((target) => !target.id.startsWith('window:resize:')
      && !target.id.startsWith('window:pin:')
      && !target.id.startsWith('window:snap-'));

    if (this.performance.quality.secondaryWindows) {
      for (const window of state.windows.windows.values()) {
        if (!window.visible || window.id === state.appManager.activeAppId) continue;
        const p = window.position;
        addTarget(targets, `window:resize:${window.id}`, 'Resize', v3(p.x - 0.28, p.y - 0.32, p.z + 0.02), { priority: 0.5 });
        addTarget(targets, `window:pin:${window.id}`, window.pinned ? 'Unpin' : 'Pin', v3(p.x - 0.14, p.y - 0.32, p.z + 0.02));
        addTarget(targets, `window:snap-left:${window.id}`, 'Left', v3(p.x, p.y - 0.32, p.z + 0.02), { angularRadius: 0.035 });
        addTarget(targets, `window:snap-center:${window.id}`, 'Centre', v3(p.x + 0.14, p.y - 0.32, p.z + 0.02), { angularRadius: 0.035 });
        addTarget(targets, `window:snap-right:${window.id}`, 'Right', v3(p.x + 0.28, p.y - 0.32, p.z + 0.02), { angularRadius: 0.035 });
      }
    }

    return targets;
  }

  _drawEnvironment(ctx, width, height, eye, state) {
    super._drawEnvironment(ctx, width, height, eye, state);

    if (state.settings.environment === 'dark') {
      ctx.fillStyle = 'rgba(0,0,0,.38)';
      ctx.fillRect(0, 0, width, height);
    } else if (state.settings.environment === 'minimal') {
      const glow = ctx.createLinearGradient(0, 0, 0, height);
      glow.addColorStop(0, 'rgba(180,210,235,.09)');
      glow.addColorStop(1, 'rgba(70,90,115,.035)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }

    // Theatre brightness affects the virtual room, not the movie pixels. This
    // method runs before _drawCinema(), so the subsequently rendered screen is
    // intentionally not dimmed by this ambient treatment.
    if (state.appManager.activeAppId === 'cinema') {
      const cinema = state.apps.cinema;
      const level = clamp(cinema.environmentBrightness ?? 0.16, 0.05, 0.9);
      const tint = {
        Black: [0, 0, 0],
        Moon: [88, 108, 160],
        Cozy: [180, 104, 62],
        Space: [65, 76, 160],
      }[cinema.environment] || [0, 0, 0];
      if (cinema.environment === 'Black') {
        ctx.fillStyle = `rgba(0,0,0,${clamp(0.72 - level * 0.58, 0.12, 0.68)})`;
      } else {
        ctx.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${clamp(level * 0.22, 0.025, 0.18)})`;
      }
      ctx.fillRect(0, 0, width, height);

      if (cinema.environment === 'Moon' || cinema.environment === 'Space') {
        ctx.fillStyle = `rgba(225,238,255,${0.16 + level * 0.18})`;
        for (let i = 0; i < 26; i += 1) {
          const x = (i * 97.3 + eye * 7) % width;
          const y = 18 + (i * 43.1) % Math.max(20, height * 0.64);
          ctx.fillRect(x, y, i % 5 === 0 ? 1.5 : 1, i % 5 === 0 ? 1.5 : 1);
        }
      }
      if (cinema.environment === 'Cozy') {
        const lamp = ctx.createRadialGradient(width * 0.16, height * 0.7, 0, width * 0.16, height * 0.7, width * 0.32);
        lamp.addColorStop(0, `rgba(255,157,91,${0.12 + level * 0.12})`);
        lamp.addColorStop(1, 'rgba(255,140,80,0)');
        ctx.fillStyle = lamp;
        ctx.fillRect(0, 0, width, height);
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
    const solid = state.settings.reduceTransparency || this.performance.mode === 'performance';
    roundRect(ctx, x, y, w, h, Math.min(22, h * 0.09));
    if (solid) {
      ctx.fillStyle = 'rgba(10,15,25,.96)';
    } else {
      const glass = ctx.createLinearGradient(x, y, x + w, y + h);
      glass.addColorStop(0, 'rgba(91,112,150,.28)');
      glass.addColorStop(.35, 'rgba(24,32,48,.76)');
      glass.addColorStop(1, 'rgba(12,18,29,.88)');
      ctx.fillStyle = glass;
    }
    ctx.fill();
    ctx.strokeStyle = state.settings.highContrast ? 'rgba(255,255,255,.62)' : 'rgba(236,245,255,.22)';
    ctx.lineWidth = state.settings.highContrast ? 1.8 : 1;
    ctx.stroke();

    ctx.fillStyle = '#f7f9ff';
    ctx.font = `800 ${clamp(18 / p.depth, 12, 23)}px -apple-system, system-ui`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, x + 22, y + 34);
    if (subtitle) {
      ctx.fillStyle = state.settings.highContrast ? 'rgba(242,247,255,.86)' : 'rgba(220,232,250,.58)';
      ctx.font = `650 ${clamp(8 / p.depth, 7, 10)}px -apple-system, system-ui`;
      ctx.fillText(subtitle, x + 22, y + 51);
    }
    return { x, y, w, h, depth: p.depth, scale: p.scale };
  }

  _drawButtonTarget(ctx, eye, state, target, widthM = 0.19, heightM = 0.12) {
    const p = this._project(target.position, eye, state);
    if (!p) return;
    const w = widthM * p.scale;
    const h = heightM * p.scale;
    const x = p.x - w / 2;
    const y = p.y - h / 2;
    const active = state.aim?.targetId === target.id;
    roundRect(ctx, x, y, w, h, Math.min(16, h * 0.26));
    const solid = state.settings.reduceTransparency || this.performance.mode === 'performance';
    if (active) ctx.fillStyle = 'rgba(151,213,255,.30)';
    else ctx.fillStyle = solid ? 'rgba(22,29,43,.96)' : 'rgba(255,255,255,.07)';
    ctx.fill();
    ctx.strokeStyle = active
      ? '#ccecff'
      : (state.settings.highContrast ? 'rgba(255,255,255,.58)' : 'rgba(255,255,255,.16)');
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();
    ctx.fillStyle = target.disabled ? 'rgba(230,238,248,.35)' : '#f8fbff';
    ctx.font = `750 ${clamp(9 / p.depth, 7, 11)}px -apple-system, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(target.label, p.x, p.y);
  }

  _drawSecondaryWindows(ctx, eye, state) {
    super._drawSecondaryWindows(ctx, eye, state);
    if (!this.performance.quality.secondaryWindows) return;
    const targets = this.getTargets(state);
    for (const window of state.windows.windows.values()) {
      if (!window.visible || window.id === state.appManager.activeAppId) continue;
      for (const target of targets.filter((item) => item.id.endsWith(`:${window.id}`)
        && (item.id.startsWith('window:resize:') || item.id.startsWith('window:pin:') || item.id.startsWith('window:snap-')))) {
        this._drawButtonTarget(ctx, eye, state, target, 0.13, 0.055);
      }
    }
  }
}
