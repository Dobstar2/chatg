import { StereoRenderer } from './stereo-renderer.js?v=020';

const originalDrawHands = StereoRenderer.prototype._drawHands;

StereoRenderer.prototype._drawHands = function patchedDrawHands(ctx, eyeIndex, headOrientation, hands) {
  originalDrawHands.call(this, ctx, eyeIndex, headOrientation, hands);

  for (const side of ['left', 'right']) {
    const hand = hands[side];
    if (!hand?.tracked || !hand.target) continue;

    let worldPoint = null;
    const button = this.interaction.buttons.find((item) => item.id === hand.target);
    if (button) {
      worldPoint = {
        x: this.interaction.panel.center.x + button.x,
        y: this.interaction.panel.center.y + button.y,
        z: this.interaction.panel.center.z,
      };
    } else {
      const object = this.interaction.objects.find((item) => item.id === hand.target);
      if (object) worldPoint = object.position;
    }
    if (!worldPoint) continue;

    const projected = this._project(worldPoint, eyeIndex, headOrientation);
    if (!projected) continue;

    const state = hand.reticleState || 'HOVER';
    const color = state === 'SELECTED'
      ? '#ffffff'
      : (state === 'PINCH READY' ? '#74f6c2' : (state === 'DISABLED' ? '#778196' : '#a7c4ff'));
    const radius = state === 'SELECTED' ? 10 : 8;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = state === 'SELECTED' ? 'rgba(116,246,194,.30)' : 'rgba(0,0,0,.28)';
    ctx.lineWidth = state === 'SELECTED' ? 3 : 2;
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }
};

StereoRenderer.prototype._drawHud = function trackingHud(ctx, eyeIndex, hands, cameraInfo, trackingStats, statusText) {
  const panelWidth = Math.min(this.width * 0.82, 350);
  const panelHeight = 54;
  const x = (this.width - panelWidth) / 2;
  const y = 9;
  ctx.save();
  ctx.fillStyle = 'rgba(2,5,11,.90)';
  ctx.strokeStyle = 'rgba(255,255,255,.15)';
  ctx.lineWidth = 1;
  this._roundRect(ctx, x, y, panelWidth, panelHeight, 14);
  ctx.fill();
  ctx.stroke();

  const shortQuality = (hand) => hand.tracked ? `${hand.side[0].toUpperCase()}:${String(hand.quality || 'OK').slice(0, 4).toUpperCase()}` : `${hand.side[0].toUpperCase()}:LOST`;
  const chips = [
    ['CTRL 0.2', true],
    [shortQuality(hands.left), hands.left.interactionSafe],
    [shortQuality(hands.right), hands.right.interactionSafe],
    [cameraInfo?.lens === 'rear-0.5' ? 'CAM:0.5X' : 'CAM:REAR', cameraInfo?.lens === 'rear-0.5'],
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
    ctx.fillText(String(text).toUpperCase(), chipX + chipW / 2, chipY + chipH / 2 + 0.5);
  });
  ctx.restore();
};
