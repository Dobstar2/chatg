import { StereoRenderer } from './stereo-renderer.js?v=020';
import { clamp } from '../core/math.js';

const VISUAL_LABELS = {
  recenter: 'Recenter',
  recalibrate: 'Hands',
  debug: 'Tracking',
  'reset-objects': 'Objects',
  performance: 'Performance',
  exit: 'Exit',
};

function pathPolygon(ctx, polygon) {
  ctx.beginPath();
  ctx.moveTo(polygon[0].x, polygon[0].y);
  polygon.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
}

function handStatus(hand, side) {
  if (!hand?.tracked) return `${side} ○`;
  if (hand.interactionSafe) return `${side} ●`;
  return `${side} ◐`;
}

StereoRenderer.prototype._drawBackground = function pocketBackground(ctx, eyeIndex) {
  const sky = ctx.createLinearGradient(0, 0, 0, this.height);
  sky.addColorStop(0, '#0c1424');
  sky.addColorStop(0.48, '#080b13');
  sky.addColorStop(1, '#030508');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, this.width, this.height);

  const horizon = ctx.createRadialGradient(
    this.width * (eyeIndex === 0 ? 0.53 : 0.47),
    this.height * 0.54,
    0,
    this.width * 0.5,
    this.height * 0.56,
    this.width * 0.68,
  );
  horizon.addColorStop(0, 'rgba(117,178,255,.16)');
  horizon.addColorStop(.46, 'rgba(121,113,225,.055)');
  horizon.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, 0, this.width, this.height);

  if (this.performanceMode !== 'performance') {
    ctx.save();
    ctx.globalAlpha = .26;
    for (let i = 0; i < 18; i += 1) {
      const x = ((i * 83 + eyeIndex * 11) % 997) / 997 * this.width;
      const y = ((i * 137 + 43) % 719) / 719 * this.height * .62;
      ctx.fillStyle = i % 3 === 0 ? '#b7d8ff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, i % 4 === 0 ? 1 : .55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
};

StereoRenderer.prototype._drawFloor = function pocketFloor(ctx, eyeIndex, headOrientation) {
  ctx.save();
  ctx.strokeStyle = 'rgba(151,186,235,.075)';
  ctx.lineWidth = 1;
  for (let z = -0.85; z >= -4.0; z -= 0.55) {
    const a = this._project({ x: -2.3, y: -0.58, z }, eyeIndex, headOrientation);
    const b = this._project({ x: 2.3, y: -0.58, z }, eyeIndex, headOrientation);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
};

StereoRenderer.prototype._drawPanel = function pocketPanel(ctx, eyeIndex, headOrientation) {
  const panel = this.interaction.panel;
  const corners = [
    this._panelCorner(-panel.width / 2, panel.height / 2),
    this._panelCorner(panel.width / 2, panel.height / 2),
    this._panelCorner(panel.width / 2, -panel.height / 2),
    this._panelCorner(-panel.width / 2, -panel.height / 2),
  ].map((point) => this._project(point, eyeIndex, headOrientation));
  if (corners.some((point) => !point)) return;

  ctx.save();
  pathPolygon(ctx, corners);
  const glass = ctx.createLinearGradient(corners[0].x, corners[0].y, corners[2].x, corners[2].y);
  glass.addColorStop(0, 'rgba(75,91,119,.38)');
  glass.addColorStop(.35, 'rgba(27,34,48,.78)');
  glass.addColorStop(1, 'rgba(18,23,33,.86)');
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.strokeStyle = 'rgba(238,246,255,.24)';
  ctx.lineWidth = 1.15;
  ctx.stroke();

  if (this.performanceMode !== 'performance') {
    ctx.save();
    pathPolygon(ctx, corners);
    ctx.clip();
    const highlight = ctx.createRadialGradient(corners[0].x + 40, corners[0].y - 10, 0, corners[0].x + 40, corners[0].y, 180);
    highlight.addColorStop(0, 'rgba(255,255,255,.18)');
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = highlight;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  const title = this._project(this._panelCorner(-0.49, 0.27), eyeIndex, headOrientation);
  const subtitle = this._project(this._panelCorner(-0.49, 0.215), eyeIndex, headOrientation);
  if (title && subtitle) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,.98)';
    ctx.font = `760 ${clamp(18 / title.depth, 12, 24)}px -apple-system, system-ui`;
    ctx.fillText('Quick Settings', title.x, title.y);
    ctx.fillStyle = 'rgba(225,235,251,.58)';
    ctx.font = `690 ${clamp(8.5 / subtitle.depth, 7, 11)}px -apple-system, system-ui`;
    ctx.fillText('One hand is enough · second hand joins automatically', subtitle.x, subtitle.y);
  }

  for (const button of this.interaction.buttons) this._drawButton(ctx, eyeIndex, headOrientation, button);
  ctx.restore();
};

StereoRenderer.prototype._drawButton = function pocketButton(ctx, eyeIndex, headOrientation, button) {
  const halfW = button.w / 2;
  const halfH = button.h / 2;
  const polygon = [
    this._panelCorner(button.x - halfW, button.y + halfH),
    this._panelCorner(button.x + halfW, button.y + halfH),
    this._panelCorner(button.x + halfW, button.y - halfH),
    this._panelCorner(button.x - halfW, button.y - halfH),
  ].map((point) => this._project(point, eyeIndex, headOrientation));
  if (polygon.some((point) => !point)) return;
  this.cachedButtonPolygons[eyeIndex].set(button.id, polygon);

  const hovered = button.hoveredBy.size > 0;
  const pressed = button.pressedBy.size > 0;
  pathPolygon(ctx, polygon);
  const fill = ctx.createLinearGradient(polygon[0].x, polygon[0].y, polygon[2].x, polygon[2].y);
  if (pressed) {
    fill.addColorStop(0, 'rgba(190,225,255,.36)');
    fill.addColorStop(1, 'rgba(109,143,205,.26)');
  } else if (hovered) {
    fill.addColorStop(0, 'rgba(168,211,255,.24)');
    fill.addColorStop(1, 'rgba(76,94,128,.42)');
  } else {
    fill.addColorStop(0, 'rgba(255,255,255,.075)');
    fill.addColorStop(1, 'rgba(255,255,255,.035)');
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = pressed
    ? 'rgba(240,249,255,.82)'
    : (hovered ? 'rgba(168,217,255,.68)' : 'rgba(255,255,255,.13)');
  ctx.lineWidth = hovered || pressed ? 1.5 : 1;
  ctx.stroke();

  const center = this._project(this._panelCorner(button.x, button.y), eyeIndex, headOrientation);
  if (!center) return;
  ctx.fillStyle = pressed ? '#ffffff' : 'rgba(249,251,255,.96)';
  ctx.font = `750 ${clamp(10.5 / center.depth, 7.5, 13)}px -apple-system, system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(VISUAL_LABELS[button.id] || button.label, center.x, center.y - 1);

  if (hovered) {
    ctx.fillStyle = pressed ? '#dff5ff' : 'rgba(190,220,255,.72)';
    ctx.font = `720 ${clamp(6.5 / center.depth, 5.5, 8)}px -apple-system, system-ui`;
    ctx.fillText(pressed ? 'Selected' : 'Pinch to select', center.x, center.y + 12);
  }
};

StereoRenderer.prototype._drawHud = function pocketStatus(ctx, eyeIndex, hands, cameraInfo, trackingStats, statusText) {
  const width = Math.min(this.width * .68, 260);
  const height = 30;
  const x = (this.width - width) / 2;
  const y = 10;

  ctx.save();
  this._roundRect(ctx, x, y, width, height, 15);
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, 'rgba(40,49,65,.76)');
  gradient.addColorStop(1, 'rgba(14,18,26,.82)');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const left = handStatus(hands.left, 'L');
  const right = handStatus(hands.right, 'R');
  const camera = cameraInfo?.lens === 'rear-0.5' ? '0.5×' : 'Rear';
  const status = statusText === 'SHOW BOTH HANDS' ? 'Show either hand' : (statusText || 'Ready');

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,.96)';
  ctx.font = '740 8px -apple-system, system-ui';
  ctx.fillText(`${left}   ${right}`, x + 12, y + height / 2);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(221,232,248,.62)';
  ctx.font = '700 7px -apple-system, system-ui';
  ctx.fillText(`${camera} · ${trackingStats.trackingFps.toFixed(0)} fps`, x + width / 2, y + height / 2);

  ctx.textAlign = 'right';
  ctx.fillStyle = /LOST|ERROR/i.test(status) ? '#ffd38b' : '#9fd0ff';
  ctx.font = '740 7px -apple-system, system-ui';
  ctx.fillText(String(status).slice(0, 19), x + width - 11, y + height / 2);
  ctx.restore();
};
