import {
  clamp,
  pointInPolygon,
  qConjugate,
  qRotateVec,
  v3Add,
  v3Scale,
  v3Sub,
} from '../core/math.js';

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

function rotateAroundZ(point, center, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + x * c - y * s,
    y: center.y + x * s + y * c,
    z: point.z,
  };
}

export class StereoRenderer {
  constructor(leftCanvas, rightCanvas, interactionManager) {
    this.canvases = [leftCanvas, rightCanvas];
    this.contexts = this.canvases.map((canvas) => canvas.getContext('2d'));
    this.interaction = interactionManager;
    this.ipd = 0.064;
    this.fovYDeg = 86;
    this.dpr = 1;
    this.width = 1;
    this.height = 1;
    this.frameTimes = [];
    this.fps = 0;
    this.debug = false;
    this.performanceMode = 'balanced';
    this.cachedButtonPolygons = [new Map(), new Map()];
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this.canvases.forEach((canvas) => this._resizeObserver.observe(canvas));
    this.resize();
  }

  setDebug(enabled) {
    this.debug = Boolean(enabled);
  }

  togglePerformanceMode() {
    const order = ['quality', 'balanced', 'performance'];
    this.performanceMode = order[(order.indexOf(this.performanceMode) + 1) % order.length];
    this.resize();
    return this.performanceMode;
  }

  resize() {
    const rect = this.canvases[0].getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    const maxDpr = this.performanceMode === 'quality' ? 2 : (this.performanceMode === 'performance' ? 1 : 1.45);
    this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.canvases.forEach((canvas) => {
      canvas.width = Math.round(this.width * this.dpr);
      canvas.height = Math.round(this.height * this.dpr);
      canvas.style.width = `${this.width}px`;
      canvas.style.height = `${this.height}px`;
    });
  }

  render({ now, headOrientation, hands, cameraInfo, trackingStats, statusText }) {
    this._updateFps(now);
    for (let eyeIndex = 0; eyeIndex < 2; eyeIndex += 1) {
      const ctx = this.contexts[eyeIndex];
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.width, this.height);
      this.cachedButtonPolygons[eyeIndex].clear();
      this._drawBackground(ctx, eyeIndex, headOrientation);
      this._drawFloor(ctx, eyeIndex, headOrientation);
      this._drawPanel(ctx, eyeIndex, headOrientation);
      this._drawObjects(ctx, eyeIndex, headOrientation);
      this._drawHands(ctx, eyeIndex, headOrientation, hands);
      this._drawHud(ctx, eyeIndex, hands, cameraInfo, trackingStats, statusText);
      if (this.debug) this._drawDebug(ctx, hands, cameraInfo, trackingStats, headOrientation);
    }
  }

  hitTestUi(eyeIndex, x, y) {
    const map = this.cachedButtonPolygons[eyeIndex];
    for (const [id, polygon] of map.entries()) {
      if (pointInPolygon({ x, y }, polygon)) return id;
    }
    return null;
  }

  _project(worldPoint, eyeIndex, headOrientation) {
    const eyeLocal = { x: eyeIndex === 0 ? -this.ipd / 2 : this.ipd / 2, y: 0, z: 0 };
    const eyeWorld = qRotateVec(headOrientation, eyeLocal);
    const relativeWorld = v3Sub(worldPoint, eyeWorld);
    const cameraPoint = qRotateVec(qConjugate(headOrientation), relativeWorld);
    if (cameraPoint.z >= -0.035) return null;

    const fovY = this.fovYDeg * Math.PI / 180;
    const focalY = this.height / (2 * Math.tan(fovY / 2));
    const focalX = focalY;
    const invZ = 1 / -cameraPoint.z;
    return {
      x: this.width / 2 + cameraPoint.x * focalX * invZ,
      y: this.height / 2 - cameraPoint.y * focalY * invZ,
      depth: -cameraPoint.z,
      scale: focalY * invZ,
    };
  }

  _drawBackground(ctx, eyeIndex) {
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#080d18');
    gradient.addColorStop(0.58, '#030711');
    gradient.addColorStop(1, '#010308');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    const glowX = this.width * 0.5 + (eyeIndex === 0 ? 3 : -3);
    const glow = ctx.createRadialGradient(glowX, this.height * 0.48, 0, glowX, this.height * 0.48, this.width * 0.55);
    glow.addColorStop(0, 'rgba(86,113,255,.18)');
    glow.addColorStop(1, 'rgba(86,113,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  _drawFloor(ctx, eyeIndex, headOrientation) {
    ctx.save();
    ctx.strokeStyle = 'rgba(105,135,210,.13)';
    ctx.lineWidth = 1;
    for (let z = -0.6; z >= -4.5; z -= 0.35) {
      const a = this._project({ x: -2.5, y: -0.55, z }, eyeIndex, headOrientation);
      const b = this._project({ x: 2.5, y: -0.55, z }, eyeIndex, headOrientation);
      if (a && b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    for (let x = -2.4; x <= 2.4; x += 0.3) {
      const a = this._project({ x, y: -0.55, z: -0.5 }, eyeIndex, headOrientation);
      const b = this._project({ x, y: -0.55, z: -4.6 }, eyeIndex, headOrientation);
      if (a && b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _panelCorner(localX, localY) {
    const panel = this.interaction.panel;
    return {
      x: panel.center.x + localX,
      y: panel.center.y + localY,
      z: panel.center.z,
    };
  }

  _drawPanel(ctx, eyeIndex, headOrientation) {
    const panel = this.interaction.panel;
    const corners = [
      this._panelCorner(-panel.width / 2, panel.height / 2),
      this._panelCorner(panel.width / 2, panel.height / 2),
      this._panelCorner(panel.width / 2, -panel.height / 2),
      this._panelCorner(-panel.width / 2, -panel.height / 2),
    ].map((point) => this._project(point, eyeIndex, headOrientation));
    if (corners.some((point) => !point)) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    corners.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.fillStyle = 'rgba(13,18,31,.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,210,255,.34)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const title = this._project(this._panelCorner(-0.49, 0.26), eyeIndex, headOrientation);
    const subtitle = this._project(this._panelCorner(-0.49, 0.21), eyeIndex, headOrientation);
    if (title && subtitle) {
      ctx.fillStyle = '#f6f8ff';
      ctx.font = `800 ${clamp(18 / title.depth, 12, 25)}px -apple-system, system-ui`;
      ctx.textAlign = 'left';
      ctx.fillText('Pocket VR Tracking Lab', title.x, title.y);
      ctx.fillStyle = '#9fb0d0';
      ctx.font = `700 ${clamp(9 / subtitle.depth, 7, 12)}px -apple-system, system-ui`;
      ctx.fillText('TWO HANDS · ESTIMATED DEPTH · WORLD SPACE', subtitle.x, subtitle.y);
    }

    for (const button of this.interaction.buttons) {
      this._drawButton(ctx, eyeIndex, headOrientation, button);
    }
    ctx.restore();
  }

  _drawButton(ctx, eyeIndex, headOrientation, button) {
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
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    polygon.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.fillStyle = pressed
      ? 'rgba(111,246,194,.34)'
      : (hovered ? 'rgba(72,93,135,.96)' : 'rgba(25,32,50,.96)');
    ctx.fill();
    ctx.strokeStyle = hovered ? '#91ffda' : 'rgba(255,255,255,.20)';
    ctx.lineWidth = hovered ? 2 : 1;
    ctx.stroke();

    const center = this._project(this._panelCorner(button.x, button.y), eyeIndex, headOrientation);
    if (!center) return;
    ctx.fillStyle = '#f7f9ff';
    ctx.font = `800 ${clamp(10 / center.depth, 7, 13)}px -apple-system, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(button.label, center.x, center.y);

    if (button.hoveredBy.size) {
      const sideText = [...button.hoveredBy].map((side) => side[0].toUpperCase()).join('+');
      ctx.fillStyle = '#7bf5cb';
      ctx.font = `800 ${clamp(7 / center.depth, 6, 9)}px -apple-system, system-ui`;
      ctx.fillText(sideText, center.x, center.y + 12);
    }
  }

  _drawObjects(ctx, eyeIndex, headOrientation) {
    for (const object of this.interaction.objects) {
      this._drawCube(ctx, eyeIndex, headOrientation, object);
    }
  }

  _drawCube(ctx, eyeIndex, headOrientation, object) {
    const s = object.size;
    const local = [
      { x: -s, y: -s, z: -s }, { x: s, y: -s, z: -s },
      { x: s, y: s, z: -s }, { x: -s, y: s, z: -s },
      { x: -s, y: -s, z: s }, { x: s, y: -s, z: s },
      { x: s, y: s, z: s }, { x: -s, y: s, z: s },
    ];
    const points = local.map((offset) => {
      const rotated = rotateAroundZ(v3Add(object.position, offset), object.position, object.rotationZ);
      return this._project(rotated, eyeIndex, headOrientation);
    });
    if (points.some((point) => !point)) return;

    const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    ctx.save();
    ctx.strokeStyle = object.color;
    ctx.lineWidth = object.grabbedBy.size ? 3 : 2;
    ctx.shadowColor = object.color;
    ctx.shadowBlur = object.grabbedBy.size ? 16 : 8;
    for (const [a, b] of edges) {
      ctx.beginPath();
      ctx.moveTo(points[a].x, points[a].y);
      ctx.lineTo(points[b].x, points[b].y);
      ctx.stroke();
    }
    const center = this._project(object.position, eyeIndex, headOrientation);
    if (center) {
      ctx.fillStyle = object.color;
      ctx.font = `800 ${clamp(8 / center.depth, 6, 11)}px -apple-system, system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(object.grabbedBy.size === 2 ? 'TWO HAND' : (object.grabbedBy.size ? 'HELD' : 'PINCH'), center.x, center.y);
    }
    ctx.restore();
  }

  _drawHands(ctx, eyeIndex, headOrientation, hands) {
    for (const side of ['left', 'right']) {
      const hand = hands[side];
      if (!hand || hand.fade <= 0.01) continue;
      const color = side === 'left' ? '#68e9ff' : '#ff78d2';
      const points = hand.jointsWorld.map((joint) => this._project(joint, eyeIndex, headOrientation));
      if (!points[0]) continue;

      ctx.save();
      ctx.globalAlpha = hand.fade;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      for (const [a, b] of HAND_CONNECTIONS) {
        if (!points[a] || !points[b]) continue;
        ctx.lineWidth = clamp(5 / ((points[a].depth + points[b].depth) / 2), 1.4, 5);
        ctx.beginPath();
        ctx.moveTo(points[a].x, points[a].y);
        ctx.lineTo(points[b].x, points[b].y);
        ctx.stroke();
      }

      points.forEach((point, index) => {
        if (!point) return;
        const radius = clamp((index === 8 ? 5 : 3.2) / point.depth, 1.5, 6);
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      const wrist = points[0];
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${clamp(10 / wrist.depth, 7, 13)}px -apple-system, system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(`${side.toUpperCase()} · ${hand.gesture.name.toUpperCase()} · ${hand.depthMeters.toFixed(2)}m`, wrist.x, wrist.y + 18);

      const rayStart = points[5];
      const rayEnd = points[8];
      if (rayStart && rayEnd && (hand.gesture.name === 'point' || hand.target)) {
        const dx = rayEnd.x - rayStart.x;
        const dy = rayEnd.y - rayStart.y;
        const length = Math.hypot(dx, dy) || 1;
        ctx.strokeStyle = hand.target ? '#a8ffe5' : color;
        ctx.globalAlpha = hand.fade * 0.75;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(rayEnd.x, rayEnd.y);
        ctx.lineTo(rayEnd.x + dx / length * 240, rayEnd.y + dy / length * 240);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }

  _drawHud(ctx, eyeIndex, hands, cameraInfo, trackingStats, statusText) {
    const panelWidth = Math.min(this.width * 0.74, 330);
    const panelHeight = 52;
    const x = (this.width - panelWidth) / 2;
    const y = 10;
    ctx.save();
    ctx.fillStyle = 'rgba(2,5,11,.88)';
    ctx.strokeStyle = 'rgba(255,255,255,.15)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, x, y, panelWidth, panelHeight, 14);
    ctx.fill();
    ctx.stroke();

    const chips = [
      ['NEXT v0.1', true],
      [`L:${hands.left.tracked ? hands.left.gesture.name : 'lost'}`, hands.left.tracked],
      [`R:${hands.right.tracked ? hands.right.gesture.name : 'lost'}`, hands.right.tracked],
      [cameraInfo?.lens === 'rear-0.5' ? 'CAM:0.5X' : 'CAM:WIDE', cameraInfo?.lens === 'rear-0.5'],
      [`TFPS:${trackingStats.trackingFps.toFixed(0)}`, false],
      [statusText || 'READY', true],
    ];
    const gap = 4;
    const padding = 6;
    const chipW = (panelWidth - padding * 2 - gap * 2) / 3;
    const chipH = 18;
    chips.forEach(([text, accent], index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const chipX = x + padding + col * (chipW + gap);
      const chipY = y + padding + row * (chipH + gap);
      this._roundRect(ctx, chipX, chipY, chipW, chipH, 9);
      ctx.fillStyle = accent ? 'rgba(27,77,62,.85)' : 'rgba(0,0,0,.65)';
      ctx.fill();
      ctx.strokeStyle = accent ? 'rgba(112,246,194,.48)' : 'rgba(255,255,255,.11)';
      ctx.stroke();
      ctx.fillStyle = accent ? '#78f4c8' : '#eef2ff';
      ctx.font = '800 7px -apple-system, system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.toUpperCase(), chipX + chipW / 2, chipY + chipH / 2 + 0.5);
    });
    ctx.restore();
  }

  _drawDebug(ctx, hands, cameraInfo, trackingStats, headOrientation) {
    const x = 8;
    const y = 72;
    const width = Math.min(this.width - 16, 250);
    const lines = [
      `Render FPS: ${this.fps.toFixed(1)}`,
      `Tracking FPS: ${trackingStats.trackingFps.toFixed(1)}`,
      `Inference: ${trackingStats.inferenceMs.toFixed(1)} ms`,
      `Tracking source: MediaPipe Tasks Vision`,
      `Camera: ${cameraInfo?.label || 'unknown'} (${cameraInfo?.lens || 'unknown'})`,
      `Head quaternion: ${headOrientation.x.toFixed(2)}, ${headOrientation.y.toFixed(2)}, ${headOrientation.z.toFixed(2)}, ${headOrientation.w.toFixed(2)}`,
      `LEFT: ${hands.left.tracked ? 'Tracked' : 'Lost'} conf ${hands.left.confidence.toFixed(2)} xyz ${this._formatVec(hands.left.jointsWorld[0])}`,
      `LEFT gesture ${hands.left.gesture.name} target ${hands.left.target || '-'} mode ${hands.left.interactionMode}`,
      `RIGHT: ${hands.right.tracked ? 'Tracked' : 'Lost'} conf ${hands.right.confidence.toFixed(2)} xyz ${this._formatVec(hands.right.jointsWorld[0])}`,
      `RIGHT gesture ${hands.right.gesture.name} target ${hands.right.target || '-'} mode ${hands.right.interactionMode}`,
      `Performance: ${this.performanceMode}`,
    ];

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.78)';
    this._roundRect(ctx, x, y, width, lines.length * 13 + 14, 10);
    ctx.fill();
    ctx.fillStyle = '#9fffdc';
    ctx.font = '700 8px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    lines.forEach((line, index) => ctx.fillText(line, x + 8, y + 13 + index * 13));
    ctx.restore();
  }

  _formatVec(v) {
    return `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
  }

  _roundRect(ctx, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  _updateFps(now) {
    this.frameTimes.push(now);
    while (this.frameTimes.length && now - this.frameTimes[0] > 1000) this.frameTimes.shift();
    this.fps = Math.max(0, this.frameTimes.length - 1);
  }
}
