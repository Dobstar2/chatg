import { clamp, projectWorld, seededRandom, v3 } from '../core/math.js';
import { createLayout } from './layout.js';
import { DESIGN } from './design.js';
import { drawAppIcon } from './icons.js';
import { sourceRectForEye, displayAspect } from '../core/media.js';
const random = seededRandom(13731);
const STARS = Array.from({ length: 90 }, () =>
  v3((random() - 0.5) * 28, random() * 10 - 1, -4 - random() * 22),
);
const PLANETS = [
  [
    'mercury',
    'Mercury',
    0.042,
    0.5,
    4.15,
    '#b1aea3',
    'A small, rocky world with a heavily cratered surface.',
  ],
  [
    'venus',
    'Venus',
    0.062,
    0.72,
    1.62,
    '#dec295',
    'A dense atmosphere traps heat around this rocky planet.',
  ],
  ['earth', 'Earth', 0.072, 0.94, 1, '#78b3ae', 'Our ocean world, with one natural moon.'],
  [
    'mars',
    'Mars',
    0.058,
    1.15,
    0.53,
    '#d2967a',
    'Iron minerals give the surface its rusty colour.',
  ],
  [
    'jupiter',
    'Jupiter',
    0.14,
    1.42,
    0.084,
    '#dabca0',
    'The largest planet, a gas giant with banded clouds.',
  ],
  [
    'saturn',
    'Saturn',
    0.12,
    1.75,
    0.034,
    '#d0c9ad',
    'A gas giant surrounded by rings of ice and rock.',
  ],
];
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
function box(ctx, x, y, w, h, r = DESIGN.radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, h / 2));
}
function text(
  ctx,
  value,
  x,
  y,
  size = 13,
  color = DESIGN.colors.ink,
  align = 'center',
  weight = 500,
  maxWidth,
) {
  ctx.font = `${weight} ${size}px ${DESIGN.font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (maxWidth) {
    let str = String(value || '');
    while (ctx.measureText(str).width > maxWidth && str.length > 1) str = str.slice(0, -2) + '…';
    ctx.fillText(str, x, y);
  } else ctx.fillText(String(value || ''), x, y);
}
function fitImage(ctx, img, x, y, w, h) {
  const iw = img?.naturalWidth || img?.width,
    ih = img?.naturalHeight || img?.height;
  if (!iw || !ih) return;
  const scale = Math.min(w / iw, h / ih);
  ctx.drawImage(img, x + (w - iw * scale) / 2, y + (h - ih * scale) / 2, iw * scale, ih * scale);
}
export class SpatialRenderer {
  constructor(left, right, performanceManager) {
    this.canvases = [left, right];
    this.contexts = this.canvases.map((c) => c.getContext('2d', { alpha: false }));
    if (this.contexts.some((c) => !c)) throw new Error('Canvas is unavailable. Reload in Safari.');
    this.performance = performanceManager;
    this.widths = [1, 1];
    this.heights = [1, 1];
    this.dpr = 1;
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.canvases.forEach((c) => this.resizeObserver.observe(c));
  }
  resize() {
    this.dpr = this.performance.dpr(window.devicePixelRatio || 1);
    this.canvases.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      this.widths[i] = Math.max(1, r.width);
      this.heights[i] = Math.max(1, r.height);
      const w = Math.round(this.widths[i] * this.dpr),
        h = Math.round(this.heights[i] * this.dpr);
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
    });
  }
  _planetPositions(time) {
    return PLANETS.map(([id, name, radius, orbit, speed, color, description], i) => {
      const angle = i * 1.1 + time * 0.00007 * speed;
      return {
        id,
        name,
        radius,
        orbit,
        speed,
        color,
        description,
        position: v3(
          Math.cos(angle) * orbit,
          Math.sin(angle) * 0.25,
          -2.5 + Math.sin(angle) * orbit * 0.22,
        ),
      };
    });
  }
  layout(state) {
    state.planetPositions = this._planetPositions(state.apps.planetarium.simTime);
    return createLayout(state);
  }
  getTargets(state) {
    return this.layout(state).controls;
  }
  _project(point, eye, s) {
    return projectWorld(
      point,
      s.headOrientation,
      this.widths[eye],
      this.heights[eye],
      s.mode === 'screen' ? 0 : ((eye ? 1 : -1) * (s.settings.eyeSeparation || 0.064)) / 2,
      65 / (s.settings.viewScale || 1),
    );
  }
  local(point, layout) {
    const w = layout.surface;
    return w
      ? {
          x: w.position.x + point.x * w.scale,
          y: w.position.y + point.y * w.scale,
          z: w.position.z,
        }
      : point;
  }
  point(x, y, eye, s, l) {
    return this._project(this.local(v3(x, y, -1.65), l), eye, s);
  }
  hitTest(clientX, clientY, canvas, state) {
    const eye = this.canvases.indexOf(canvas),
      r = canvas.getBoundingClientRect();
    return (
      this.getTargets(state)
        .filter((t) => !t.disabled && t.visible !== false)
        .reverse()
        .find((t) => {
          const p = this._project(t.position, eye, state);
          if (!p) return false;
          return (
            Math.abs(clientX - r.left - p.x) <= (t.width * p.scale) / 2 &&
            Math.abs(clientY - r.top - p.y) <= (t.height * p.scale) / 2
          );
        }) || null
    );
  }
  render(state) {
    const l = this.layout(state);
    for (let eye = 0; eye < (state.mode === 'screen' ? 1 : 2); eye++) this.renderEye(eye, state, l);
  }
  renderEye(eye, s, l) {
    const ctx = this.contexts[eye],
      w = this.widths[eye],
      h = this.heights[eye];
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    let env = s.settings.environment;
    if (s.appManager.activeAppId === 'portal' && s.apps.portal.selected)
      env = s.apps.portal.selected;
    if (['planetarium', 'music', 'arcade'].includes(s.appManager.activeAppId)) env = 'space';
    this.environment(ctx, eye, s, env);
    if (l.stage === 'passthrough') this.passthrough(ctx, eye, s);
    if (l.panel) this.panel(ctx, eye, s, l);
    const title = this.point(-0.86, l.stage === 'cinema' ? 0.83 : 0.72, eye, s, l),
      sub = this.point(-0.86, l.stage === 'cinema' ? 0.7 : 0.57, eye, s, l);
    if (title)
      text(
        ctx,
        l.title,
        title.x,
        title.y,
        clamp(title.scale * 0.108, 16, 23),
        undefined,
        'left',
        600,
        1.75 * title.scale,
      );
    if (sub && l.subtitle)
      text(
        ctx,
        l.subtitle,
        sub.x,
        sub.y,
        clamp(sub.scale * 0.058, 10.5, 13),
        DESIGN.colors.muted,
        'left',
        500,
        1.75 * sub.scale,
      );
    this.content(ctx, eye, s, l);
    for (const t of l.controls) this.control(ctx, eye, s, t);
    const dock = this._project(v3(0, -0.89, -1.68), eye, s);
    if (dock) {
      /* Each dock item draws its own readable silhouette. */
    }
    this.reticle(ctx, w, h, s);
    if (s.notification) {
      const msg = s.notification.message;
      box(ctx, w / 2 - Math.min(w * 0.46, 175), 8, Math.min(w * 0.92, 350), 24, 12);
      ctx.fillStyle = '#173036';
      ctx.fill();
      text(ctx, msg, w / 2, 20, 11, DESIGN.colors.ink, 'center', 500, Math.min(w * 0.88, 330));
    }
    if (s.appManager.activeAppId === 'home')
      text(
        ctx,
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        w - 24,
        22,
        12,
        DESIGN.colors.muted,
        'right',
      );
  }
  panel(ctx, eye, s, l) {
    const p = this.point(0, 0.08, eye, s, l);
    if (!p) return;
    const scale = l.surface?.scale || 1,
      w = 1.95 * p.scale * scale,
      h = 1.5 * p.scale * scale,
      x = p.x - w / 2,
      y = p.y - h / 2;
    ctx.save();
    ctx.shadowColor = '#0008';
    ctx.shadowBlur = s.settings.reduceTransparency ? 0 : 16;
    ctx.shadowOffsetY = 8;
    box(ctx, x, y, w, h, 18);
    ctx.fillStyle = s.settings.reduceTransparency ? DESIGN.colors.solid : 'rgba(17,38,42,.94)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = s.settings.highContrast ? '#dbe9e3' : '#56727580';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  control(ctx, eye, s, t) {
    const p = this._project(t.position, eye, s);
    if (!p) return;
    const w = t.width * p.scale,
      h = t.height * p.scale,
      x = p.x - w / 2,
      y = p.y - h / 2;
    const active = s.aim?.targetId === t.id,
      pressed = active && (s.pinchActive || s.realNow - (s.lastSelectAt || 0) < 150);
    ctx.save();
    if (t.kind === 'planet' || t.kind === 'orb') {
      this.sphere(ctx, p.x, p.y, Math.max(8, w / 2), t.planet?.color || '#b8dcc9', active);
      if (t.kind === 'planet') text(ctx, t.label, p.x, p.y + h / 2 + 13, 12, DESIGN.colors.ink);
      ctx.restore();
      return;
    }
    box(ctx, x, y, w, h, t.kind === 'dock' ? 15 : 12);
    ctx.fillStyle = t.disabled
      ? '#26393a'
      : pressed
        ? '#8aaf9f'
        : active
          ? '#365952'
          : s.settings.reduceTransparency
            ? '#21393c'
            : t.kind === 'app'
              ? '#213d40aa'
              : '#25424788';
    ctx.fill();
    ctx.strokeStyle = active ? '#d1eadc' : s.settings.highContrast ? '#adc5bf' : '#6c88834a';
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();
    if (t.kind === 'photo') {
      if (t.image.status === 'ready') {
        ctx.save();
        box(ctx, x + 2, y + 2, w - 4, h - 4, 10);
        ctx.clip();
        fitImage(ctx, t.image.element, x + 4, y + 4, w - 8, h - 8);
        ctx.restore();
      } else
        text(
          ctx,
          t.image.status === 'error' ? 'Cannot decode' : 'Loading…',
          p.x,
          p.y,
          11,
          DESIGN.colors.muted,
        );
    } else if (t.kind === 'environment') {
      ctx.save();
      box(ctx, x + 2, y + 2, w - 4, h - 4, 11);
      ctx.clip();
      this.environmentPreview(ctx, x, y, w, h, t.environment);
      ctx.restore();
      box(ctx, x + 4, y + h - 29, w - 8, 25, 8);
      ctx.fillStyle = '#0c232be8';
      ctx.fill();
      text(ctx, t.label, p.x, y + h - 16, 12);
    } else if (t.kind === 'world') {
      this.diorama(ctx, x + 5, y + 6, w - 10, h - 34, t.world);
      text(ctx, t.label, p.x, y + h - 16, 12);
    } else if (t.kind === 'preview') {
      drawAppIcon(ctx, t.icon, p.x, p.y - 16, 76, active);
      text(ctx, t.label, p.x, p.y + 25, 13);
      text(
        ctx,
        t.previewId === 'clock'
          ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : t.previewId === 'gallery'
            ? `${s.media.images.length} photos · preview`
            : 'Paused app · preview',
        p.x,
        p.y + 45,
        10,
        DESIGN.colors.muted,
        'center',
        500,
        w - 8,
      );
    } else if (t.icon && t.kind !== 'inline') {
      const iconSize = t.kind === 'dock' ? 44 : 66;
      drawAppIcon(ctx, t.icon, p.x, p.y - (t.kind === 'dock' ? 5 : 8), iconSize, active);
      text(
        ctx,
        t.label,
        p.x,
        p.y + (t.kind === 'dock' ? 12 : 20),
        t.kind === 'dock' ? 11.5 : 12.5,
        t.disabled ? '#809390' : DESIGN.colors.ink,
        'center',
        500,
        w - 6,
      );
    } else
      text(
        ctx,
        t.label,
        p.x,
        p.y,
        t.kind === 'small' ? 10 : 12.5,
        t.disabled ? '#809390' : DESIGN.colors.ink,
        'center',
        500,
        w - 9,
      );
    ctx.restore();
  }
  reticle(ctx, w, h, s) {
    if (s.mode === 'screen') return;
    const active = !!s.aim?.targetId,
      r = active ? 7 : 3;
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.strokeStyle = active ? '#ecfff3' : '#d9e9e3b0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    if (s.settings.selectionMethod === 'dwell' && active) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.dwellProgress);
      ctx.strokeStyle = '#c5edce';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }
  poly(ctx, points, eye, s, color, stroke) {
    const ps = points.map((p) => this._project(v3(...p), eye, s));
    if (ps.some((p) => !p)) return;
    ctx.beginPath();
    ps.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  environment(ctx, eye, s, env = 'glass') {
    const w = this.widths[eye],
      h = this.heights[eye];
    const colors =
      env === 'ocean'
        ? ['#758f9d', '#d5c7a2', '#244e59']
        : env === 'space'
          ? ['#060f20', '#142537', '#080f18']
          : ['#13252e', '#3b6267', '#102729'];
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, colors[0]);
    sky.addColorStop(0.63, colors[1]);
    sky.addColorStop(1, colors[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    if (env === 'space' || env === 'void') {
      for (const point of STARS) {
        const p = this._project(point, eye, s);
        if (p) {
          ctx.fillStyle = '#d9e8e2a0';
          ctx.beginPath();
          ctx.arc(p.x, p.y, point.z < -12 ? 0.7 : 1.2, 0, 7);
          ctx.fill();
        }
      }
      const planet = this._project(v3(3, 1.1, -8), eye, s);
      if (planet && s.appManager.activeAppId !== 'planetarium') {
        this.sphere(ctx, planet.x, planet.y, planet.scale * 1.35, '#789496', false);
        ctx.strokeStyle = '#b9b9a787';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(planet.x, planet.y, planet.scale * 2, planet.scale * 0.32, -0.3, 0, 7);
        ctx.stroke();
      }
      this.poly(
        ctx,
        [
          [-6, -1.2, -3],
          [6, -1.2, -3],
          [9, -1.2, -16],
          [-9, -1.2, -16],
        ],
        eye,
        s,
        '#102028',
        '#293f47',
      );
      for (const x of [-3, 3])
        this.poly(
          ctx,
          [
            [x - 0.1, -1.2, -5],
            [x + 0.1, -1.2, -5],
            [x + 0.1, 4, -5],
            [x - 0.1, 4, -5],
          ],
          eye,
          s,
          '#263c47',
        );
    } else if (env === 'ocean') {
      const sun = this._project(v3(3, 1.5, -14), eye, s);
      if (sun) {
        ctx.fillStyle = '#eedcace0';
        ctx.beginPath();
        ctx.arc(sun.x, sun.y, 20, 0, 7);
        ctx.fill();
      }
      this.poly(
        ctx,
        [
          [-40, -1, -35],
          [40, -1, -35],
          [40, -1, -1],
          [-40, -1, -1],
        ],
        eye,
        s,
        '#365f69',
      );
      for (let i = 0; i < 16; i++) {
        const z = -2 - i * 1.8;
        const a = this._project(v3(-25, -0.99, z), eye, s),
          b = this._project(v3(25, -0.99, z), eye, s);
        if (a && b) {
          ctx.strokeStyle = i % 3 ? '#bdcdb51b' : '#e4d1a730';
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      this.poly(
        ctx,
        [
          [-12, -1, -15],
          [-8, 1.1, -15],
          [-5, -1, -15],
        ],
        eye,
        s,
        '#405d64',
      );
      this.poly(
        ctx,
        [
          [5, -1, -19],
          [9, 0.4, -19],
          [14, -1, -19],
        ],
        eye,
        s,
        '#56767a',
      );
      this.poly(
        ctx,
        [
          [-4, -1.1, -1],
          [4, -1.1, -1],
          [4, -1.1, -3.3],
          [-4, -1.1, -3.3],
        ],
        eye,
        s,
        '#203a3c',
        '#5e7872',
      );
    } else {
      // Studio: a terrace floor, two architectural columns, ceiling slats,
      // distant hills, low lounge seating and an original potted silhouette.
      this.poly(
        ctx,
        [
          [-8, -1.3, -1],
          [8, -1.3, -1],
          [8, -1.3, -11],
          [-8, -1.3, -11],
        ],
        eye,
        s,
        '#193436',
      );
      this.poly(
        ctx,
        [
          [-9, -1, -12],
          [-6, 2, -12],
          [-2, -1, -12],
        ],
        eye,
        s,
        '#496c6c',
      );
      this.poly(
        ctx,
        [
          [0, -1, -17],
          [5, 2, -17],
          [10, -1, -17],
        ],
        eye,
        s,
        '#65837c',
      );
      for (const x of [-2.8, 2.8])
        this.poly(
          ctx,
          [
            [x - 0.12, -1.3, -4],
            [x + 0.12, -1.3, -4],
            [x + 0.12, 3, -4],
            [x - 0.12, 3, -4],
          ],
          eye,
          s,
          '#1d3639',
          '#55736b',
        );
      for (let i = 0; i < 7; i++)
        this.poly(
          ctx,
          [
            [-4, 2.1, -3 - i * 0.8],
            [4, 2.1, -3 - i * 0.8],
            [4, 2.16, -3.1 - i * 0.8],
            [-4, 2.16, -3.1 - i * 0.8],
          ],
          eye,
          s,
          '#728b7840',
        );
      this.poly(
        ctx,
        [
          [-3, -1.1, -4.3],
          [-1.4, -1.1, -4.3],
          [-1.4, -0.6, -4.3],
          [-3, -0.6, -4.3],
        ],
        eye,
        s,
        '#8a958372',
      );
      this.poly(
        ctx,
        [
          [1.9, -1.3, -3.7],
          [2.4, -1.3, -3.7],
          [2.5, -0.7, -3.7],
          [1.8, -0.7, -3.7],
        ],
        eye,
        s,
        '#9f9d82',
      );
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4;
        const base = this._project(v3(2.15, -0.7, -3.7), eye, s),
          tip = this._project(
            v3(2.15 + Math.cos(a) * 0.45, -0.3 + (i % 3) * 0.28, -3.7 + Math.sin(a) * 0.3),
            eye,
            s,
          );
        if (base && tip) {
          ctx.strokeStyle = '#789b7a';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(base.x, base.y);
          ctx.quadraticCurveTo(tip.x, base.y - 25, tip.x, tip.y);
          ctx.stroke();
        }
      }
    }
    let brightness = s.settings.worldBrightness;
    if (s.appManager.activeAppId === 'cinema') brightness = s.apps.cinema.environmentBrightness;
    if (brightness < 1) {
      ctx.fillStyle = `rgba(0,0,0,${1 - brightness})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
  environmentPreview(ctx, x, y, w, h, env) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, env === 'ocean' ? '#76939b' : env === 'space' ? '#101d33' : '#355b62');
    g.addColorStop(1, '#163638');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    if (env === 'space') {
      ctx.fillStyle = '#8ba4a5';
      ctx.beginPath();
      ctx.arc(x + w * 0.6, y + h * 0.34, w * 0.19, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#bfc8ae';
      ctx.beginPath();
      ctx.ellipse(x + w * 0.6, y + h * 0.34, w * 0.3, w * 0.06, -0.3, 0, 7);
      ctx.stroke();
    } else {
      ctx.fillStyle = env === 'ocean' ? '#abc0b1' : '#6e8c7d';
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.65);
      ctx.lineTo(x + w * 0.35, y + h * 0.3);
      ctx.lineTo(x + w, y + h * 0.7);
      ctx.fill();
      ctx.fillStyle = '#163d44';
      ctx.fillRect(x, y + h * 0.65, w, h * 0.35);
    }
  }
  sphere(ctx, x, y, r, color, active) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.05, x, y, r);
    g.addColorStop(0, '#e0e7ce');
    g.addColorStop(0.3, color);
    g.addColorStop(1, '#0e202c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
    if (active) {
      ctx.strokeStyle = '#e2f4db';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, 7);
      ctx.stroke();
    }
  }
  content(ctx, eye, s, l) {
    const app = l.stage;
    const center = this.point(0, 0.05, eye, s, l);
    if (!center) return;
    const lines = (lines, y = -0.02) =>
      lines.forEach((line, i) => {
        const p = this.point(0, y - i * 0.14, eye, s, l);
        if (p) text(ctx, line, p.x, p.y, 12, DESIGN.colors.muted, 'center', 400, 1.72 * p.scale);
      });
    if (l.lines.length)
      lines(l.lines, app === 'tutorial' ? -0.19 : app === 'gallery' ? 0.05 : -0.08);
    if (l.page) {
      const p = this.point(0, -0.51, eye, s, l);
      if (p) text(ctx, l.page, p.x, p.y, 11, DESIGN.colors.muted);
    }
    if (app === 'cinema') this.cinema(ctx, eye, s, l);
    if (app === 'gallery' && s.apps.gallery.mode !== 'Grid' && s.media.images.length) {
      const image = s.media.images[s.apps.gallery.selectedIndex],
        p = this.point(0, 0.05, eye, s, l),
        w = 1.65 * p.scale,
        h = 0.85 * p.scale;
      if (image?.status === 'ready') fitImage(ctx, image.element, p.x - w / 2, p.y - h / 2, w, h);
      else
        text(
          ctx,
          image?.status === 'error'
            ? 'This photo could not be decoded. Try JPEG or PNG.'
            : 'Loading photo…',
          p.x,
          p.y,
          12,
        );
    }
    if (app === 'focus' || app === 'clock') {
      const value =
        app === 'focus'
          ? formatTime(Math.ceil(s.apps.focus.remainingMs / 1000))
          : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      text(ctx, value, center.x, center.y, 48, DESIGN.colors.ink, 'center', 300);
      if (app === 'focus') {
        ctx.beginPath();
        ctx.arc(
          center.x,
          center.y,
          66,
          -Math.PI / 2,
          -Math.PI / 2 +
            (Math.PI * 2 * s.apps.focus.remainingMs) / (s.apps.focus.durationMinutes * 60000),
        );
        ctx.strokeStyle = '#b1cbb8';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (app === 'music') this.music(ctx, eye, s, l);
    if (app === 'planetarium') {
      const focus = s.apps.planetarium.focus;
      if (focus) {
        const p = this._planetPositions(0).find((p) => p.id === focus);
        this.sphere(ctx, center.x, center.y, 50, p.color, false);
        text(ctx, p.name, center.x, center.y - 70, 20);
        lines([p.description], -0.39);
      } else {
        const sun = this._project(v3(0, 0, -2.5), eye, s);
        if (sun) this.sphere(ctx, sun.x, sun.y, 15, '#e6bc7f', false);
      }
    }
    if (app === 'hologram') this.hologram(ctx, eye, s, l);
    if (app === 'mini-worlds' && s.apps.miniWorlds.expanded)
      this.diorama(ctx, center.x - 125, center.y - 70, 250, 130, s.apps.miniWorlds.expanded);
    if (app === 'arcade' && s.apps.arcade.phase === 'playing')
      text(
        ctx,
        `${s.apps.arcade.score} hits   ·   ${Math.ceil(s.apps.arcade.remainingMs / 1000)}s`,
        center.x,
        55,
        20,
      );
    if (app === 'alignment') {
      const p = this.point(0, 0.45, eye, s, l);
      if (p) {
        ctx.strokeStyle = '#d6ecd4';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - 18, p.y);
        ctx.lineTo(p.x + 18, p.y);
        ctx.moveTo(p.x, p.y - 9);
        ctx.lineTo(p.x, p.y + 9);
        ctx.stroke();
      }
    }
  }
  cinema(ctx, eye, s, l) {
    const c = s.apps.cinema,
      v = s.media.video;
    const p = this._project(v3(0, c.controlsVisible ? 0.35 : 0.05, -c.distance), eye, s);
    if (!p) return;
    const fixture =
      c.fixtureImage?.complete &&
      c.fixtureImage.naturalWidth > 0 &&
      (!s.media.videoReady || (v.paused && !v.currentTime))
        ? c.fixtureImage
        : null;
    const source = fixture || v;
    const aspect =
      s.media.videoReady || fixture
        ? displayAspect(
            fixture ? fixture.naturalWidth : v.videoWidth,
            fixture ? fixture.naturalHeight : v.videoHeight,
            c.format,
          )
        : 16 / 9;
    const w = Math.min(1.45 * c.size * p.scale, this.widths[eye] * 0.86),
      h = Math.min(w / aspect, this.heights[eye] * (c.controlsVisible ? 0.36 : 0.6)),
      actualW = h * aspect,
      x = p.x - actualW / 2,
      y = p.y - h / 2;
    box(ctx, x - 4, y - 4, actualW + 8, h + 8, 9);
    ctx.fillStyle = '#020606';
    ctx.fill();
    if ((s.media.videoReady && v.readyState >= 2) || fixture) {
      const r = sourceRectForEye(
        fixture ? fixture.naturalWidth : v.videoWidth,
        fixture ? fixture.naturalHeight : v.videoHeight,
        c.format,
        eye,
      );
      ctx.drawImage(source, r.sx, r.sy, r.sw, r.sh, x, y, actualW, h);
    } else {
      text(
        ctx,
        s.media.videoState === 'error'
          ? 'Cannot decode this video'
          : s.media.videoState === 'loading'
            ? 'Loading your video…'
            : 'Your own private cinema',
        p.x,
        p.y - 8,
        16,
      );
      text(
        ctx,
        s.media.videoError || 'Choose a local video or try the stereo test.',
        p.x,
        p.y + 16,
        11,
        DESIGN.colors.muted,
        'center',
        400,
        actualW - 8,
      );
    }
    if (c.controlsVisible || !s.media.videoReady) {
      const p2 = this.point(0, -0.25, eye, s, l);
      text(
        ctx,
        `${formatTime(v.currentTime)} / ${formatTime(v.duration)} · ${fixture ? (s.media.videoReady ? 'Stereo alignment test · press Play' : 'Static stereo fixture · video decode unavailable') : s.media.videoState || 'Choose a video'}`,
        p2.x,
        p2.y,
        11,
        DESIGN.colors.muted,
      );
      const trackW = 1.7 * p2.scale;
      ctx.fillStyle = '#648279';
      ctx.fillRect(p2.x - trackW / 2, p2.y - 15, trackW, 2);
      ctx.fillStyle = '#dfedcc';
      ctx.fillRect(
        p2.x - trackW / 2,
        p2.y - 15,
        trackW * (Number.isFinite(v.duration) && v.duration ? v.currentTime / v.duration : 0),
        2,
      );
    }
  }
  music(ctx, eye, s, l) {
    const p = this.point(0, 0.25, eye, s, l),
      bins = s.media.spectrum,
      playing = s.media.audioPlaying;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2,
        level = playing ? (bins[i] || 0) / 255 : 0;
      const inner =
        s.apps.music.mode === 'Calm' ? 46 : s.apps.music.mode === 'Tunnel' ? 25 + i * 0.7 : 48;
      const outer = Math.min(80, inner + 2 + level * 40);
      ctx.strokeStyle = `rgba(184,220,201,${0.2 + level * 0.7})`;
      ctx.lineWidth = s.apps.music.mode === 'Calm' ? 1 : 2;
      ctx.beginPath();
      if (s.apps.music.mode === 'Tunnel') ctx.ellipse(p.x, p.y, outer, outer * 0.6, 0, 0, 7);
      else {
        ctx.moveTo(p.x + Math.cos(a) * inner, p.y + Math.sin(a) * inner);
        ctx.lineTo(p.x + Math.cos(a) * outer, p.y + Math.sin(a) * outer);
      }
      ctx.stroke();
    }
    text(
      ctx,
      s.media.audioName || 'Bring a song into your space',
      p.x,
      p.y + 95,
      13,
      DESIGN.colors.ink,
      'center',
      500,
      300,
    );
    text(
      ctx,
      s.media.audioError ||
        (playing ? 'Live audio spectrum' : s.media.audioState || 'No microphone needed'),
      p.x,
      p.y + 113,
      11,
      DESIGN.colors.muted,
      'center',
      400,
      320,
    );
  }
  hologram(ctx, eye, s, l) {
    const h = s.apps.hologram,
      points = [],
      edges = [];
    if (h.model === 'Orb') {
      for (let j = 0; j < 6; j++)
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2,
            b = (j / 5 - 0.5) * Math.PI;
          points.push([Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a)]);
          if (i) edges.push([points.length - 2, points.length - 1]);
          if (j) edges.push([points.length - 15, points.length - 1]);
        }
    } else if (h.model === 'Ship') {
      points.push(
        [0, 0, -1.8],
        [-1.4, -0.2, 0.8],
        [0, 0.65, 0.3],
        [1.4, -0.2, 0.8],
        [0, -0.4, 0.7],
        [0, 0, 1.1],
      );
      edges.push([0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 3], [1, 4], [4, 3], [1, 5], [5, 3]);
    } else {
      points.push(
        [-1, -1, -1],
        [1, -1, -1],
        [1, 1, -1],
        [-1, 1, -1],
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      );
      edges.push(
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 4],
        [0, 4],
        [1, 5],
        [2, 6],
        [3, 7],
      );
    }
    const scale = 0.2 * h.zoom;
    const ps = points.map(([x, y, z]) =>
      this._project(
        v3(
          (x * Math.cos(h.rotation) - z * Math.sin(h.rotation)) * scale,
          0.18 + y * scale,
          -1.65 + (x * Math.sin(h.rotation) + z * Math.cos(h.rotation)) * scale,
        ),
        eye,
        s,
      ),
    );
    const faces = [];
    if (h.model === 'Orb')
      for (let j = 1; j < 6; j++)
        for (let i = 0; i < 14; i++)
          faces.push([
            (j - 1) * 14 + i,
            (j - 1) * 14 + ((i + 1) % 14),
            j * 14 + ((i + 1) % 14),
            j * 14 + i,
          ]);
    else if (h.model === 'Ship')
      faces.push([0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [1, 4, 5], [3, 5, 4]);
    else
      faces.push(
        [0, 1, 2, 3],
        [4, 7, 6, 5],
        [0, 4, 5, 1],
        [1, 5, 6, 2],
        [2, 6, 7, 3],
        [3, 7, 4, 0],
      );
    if (!h.wireframe)
      for (const face of faces
        .filter((f) => f.every((i) => ps[i]))
        .sort(
          (a, b) =>
            b.reduce((v, i) => v + ps[i].depth, 0) / b.length -
            a.reduce((v, i) => v + ps[i].depth, 0) / a.length,
        )) {
        ctx.beginPath();
        face.forEach((i, j) => (j ? ctx.lineTo(ps[i].x, ps[i].y) : ctx.moveTo(ps[i].x, ps[i].y)));
        ctx.closePath();
        ctx.fillStyle = s.settings.reduceTransparency ? '#42675e' : 'rgba(132,187,163,.24)';
        ctx.fill();
      }
    ctx.strokeStyle = '#c4decb';
    ctx.lineWidth = h.wireframe ? 1 : 2;
    for (const [a, b] of edges)
      if (ps[a] && ps[b]) {
        ctx.beginPath();
        ctx.moveTo(ps[a].x, ps[a].y);
        ctx.lineTo(ps[b].x, ps[b].y);
        ctx.stroke();
      }
  }
  diorama(ctx, x, y, w, h, world) {
    ctx.save();
    ctx.translate(x + w / 2, y + h * 0.68);
    const scale = w / 110;
    ctx.scale(scale, scale);
    ctx.fillStyle = '#172d34';
    ctx.beginPath();
    ctx.ellipse(0, 3, 48, 17, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = world === 'island' ? '#6e9274' : world === 'forest' ? '#426d57' : '#456269';
    ctx.beginPath();
    ctx.ellipse(0, -2, 45, 15, 0, 0, 7);
    ctx.fill();
    if (world === 'city') {
      for (let i = 0; i < 9; i++) {
        const bx = ((i % 3) - 1) * 20,
          by = (Math.floor(i / 3) - 1) * 7,
          bh = 12 + ((i * 17) % 26);
        ctx.fillStyle = i % 2 ? '#b4baa0' : '#789798';
        ctx.fillRect(bx - 6, by - bh, 12, bh);
        ctx.fillStyle = '#dce0bf';
        for (let j = 0; j < 3; j++) ctx.fillRect(bx - 3, by - bh + 5 + j * 6, 2, 2);
      }
    } else {
      for (let i = 0; i < (world === 'forest' ? 9 : 3); i++) {
        const tx = ((i % 3) - 1) * 22,
          ty = Math.floor(i / 3) * 5;
        ctx.fillStyle = '#9baf86';
        ctx.fillRect(tx - 1, ty - 21, 2, 23);
        ctx.fillStyle = i % 2 ? '#7eaa8a' : '#4c8369';
        ctx.beginPath();
        ctx.moveTo(tx - 11, ty - 5);
        ctx.lineTo(tx, ty - 39);
        ctx.lineTo(tx + 11, ty - 5);
        ctx.closePath();
        ctx.fill();
      }
      if (world === 'island') {
        ctx.strokeStyle = '#a1c0b4';
        ctx.beginPath();
        ctx.ellipse(0, 4, 52, 20, 0, 0, 7);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  passthrough(ctx, eye, s) {
    const v = s.cameraVideo,
      w = this.widths[eye],
      h = this.heights[eye];
    if (v?.readyState >= 2 && v.videoWidth) {
      const scale = Math.max(w / v.videoWidth, h / v.videoHeight);
      ctx.drawImage(
        v,
        (w - v.videoWidth * scale) / 2,
        (h - v.videoHeight * scale) / 2,
        v.videoWidth * scale,
        v.videoHeight * scale,
      );
      ctx.fillStyle = '#07191c44';
      ctx.fillRect(0, 0, w, h);
    }
  }
  dispose() {
    this.resizeObserver.disconnect();
  }
}
