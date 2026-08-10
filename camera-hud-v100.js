const BUILD = 'v1.0.0';

const camera = document.getElementById('camera');
const buildState = document.getElementById('buildState');
const startBuild = document.getElementById('startBuild');
const motionState = document.getElementById('motionState');
const lookState = document.getElementById('lookState');
const handState = document.getElementById('handState');
const cameraState = document.getElementById('cameraState');

// Remove all older HUD implementations. This build draws directly to a fixed
// canvas, so status text cannot resize/recenter the visor and scene transforms
// cannot affect it.
document.querySelectorAll('.eye-hud,.eye-hud-v092,.visor-root-v093,.visor-root-v094,#stableHudV100').forEach((node) => node.remove());
const legacyHud = document.getElementById('hud');
if (legacyHud) legacyHud.style.display = 'none';

const style = document.createElement('style');
style.textContent = `
  #fixedVisorV100 {
    position: fixed !important;
    left: 0 !important;
    top: 0 !important;
    right: auto !important;
    bottom: auto !important;
    z-index: 2147483000 !important;
    pointer-events: none !important;
    margin: 0 !important;
    padding: 0 !important;
    transform: none !important;
    translate: none !important;
    rotate: none !important;
    scale: none !important;
  }
`;
document.head.appendChild(style);

const canvas = document.createElement('canvas');
canvas.id = 'fixedVisorV100';
canvas.setAttribute('aria-hidden', 'true');
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');
let cssWidth = 1;
let cssHeight = 1;
let dpr = 1;

function resizeCanvas() {
  cssWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  cssHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function roundRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawChip(text, x, y, width, height, accent = false) {
  roundRect(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = accent ? 'rgba(23,66,55,.9)' : 'rgba(0,0,0,.74)';
  ctx.fill();
  ctx.strokeStyle = accent ? 'rgba(116,246,194,.56)' : 'rgba(255,255,255,.14)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  roundRect(ctx, x + 1, y + 1, width - 2, height - 2, Math.max(1, height / 2 - 1));
  ctx.clip();
  ctx.fillStyle = accent ? '#74f6c2' : '#f7f9ff';
  ctx.font = '800 7px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + width / 2, y + height / 2 + 0.3);
  ctx.restore();
}

function drawHud() {
  if (!ctx) return;
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const eyeWidth = cssWidth / 2;
  const compact = cssHeight <= 430;
  const panelWidth = Math.min(compact ? 286 : 316, eyeWidth * 0.70);
  const panelHeight = compact ? 50 : 54;
  const top = Math.max(8, cssHeight * (compact ? 0.038 : 0.05));
  const padding = 6;
  const gap = 4;
  const chipWidth = (panelWidth - padding * 2 - gap * 2) / 3;
  const chipHeight = (panelHeight - padding * 2 - gap) / 2;

  const chips = [
    [`BUILD ${BUILD}`, true],
    [motionState?.textContent || 'HEAD: OFF', false],
    [handState?.textContent || 'HAND: OFF', false],
    [cameraState?.textContent || 'CAMERA: OFF', false],
    [lookState?.textContent || 'LOOK: CENTER', false],
    ['HUD: FIXED', true],
  ];

  for (let eye = 0; eye < 2; eye += 1) {
    const panelX = eye * eyeWidth + (eyeWidth - panelWidth) / 2;
    roundRect(ctx, panelX, top, panelWidth, panelHeight, 14);
    ctx.fillStyle = 'rgba(3,6,12,.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    chips.forEach(([text, accent], index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      drawChip(
        text,
        panelX + padding + col * (chipWidth + gap),
        top + padding + row * (chipHeight + gap),
        chipWidth,
        chipHeight,
        accent
      );
    });
  }
}

resizeCanvas();
drawHud();
setInterval(drawHud, 100);
window.addEventListener('resize', () => { resizeCanvas(); drawHud(); }, { passive: true });
window.addEventListener('orientationchange', () => setTimeout(() => { resizeCanvas(); drawHud(); }, 250), { passive: true });

function stampBuild() {
  if (buildState) buildState.textContent = `BUILD ${BUILD}`;
  if (startBuild) startBuild.textContent = `BUILD ${BUILD}`;
  document.documentElement.dataset.build = BUILD;
}
stampBuild();
setInterval(stampBuild, 500);

// Rear camera upgrade. Safari reveals device labels only after camera permission,
// so the existing rear stream starts first; then we switch to the best 0.5-capable
// rear device without touching the hand-tracking logic.
let replacementStream = null;
let upgradeRunning = false;
let upgradeFinished = false;

function isFront(track) {
  if (!track) return true;
  const settings = track.getSettings?.() || {};
  const label = (track.label || '').toLowerCase();
  return settings.facingMode === 'user' || /front|user|facetime|selfie/.test(label);
}

function cameraScore(device) {
  const label = (device.label || '').toLowerCase();
  if (/front|user|facetime|selfie/.test(label)) return -10000;
  let score = 0;
  if (/ultra[ -]?wide|0\.5|0,5/.test(label)) score += 2000;
  if (/dual[ -]?wide|triple/.test(label)) score += 1300;
  if (/back|rear|environment/.test(label)) score += 600;
  if (/tele|telephoto/.test(label)) score -= 900;
  return score;
}

function looksHalf(label) {
  return /ultra[ -]?wide|0\.5|0,5/.test((label || '').toLowerCase());
}

async function requestDevice(deviceId) {
  return navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: { exact: deviceId },
      width: { ideal: 640, max: 960 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  });
}

async function requestHalfZoom(track) {
  const caps = track?.getCapabilities?.();
  if (!caps?.zoom || typeof track.applyConstraints !== 'function') return false;
  const min = Number.isFinite(caps.zoom.min) ? caps.zoom.min : 1;
  const max = Number.isFinite(caps.zoom.max) ? caps.zoom.max : 1;
  const target = min <= 0.5 && max >= 0.5 ? 0.5 : (min < 1 ? min : null);
  if (target == null) return false;
  try {
    await track.applyConstraints({ advanced: [{ zoom: target }] });
    return true;
  } catch (_) {
    return false;
  }
}

async function upgradeRearCamera() {
  if (upgradeRunning || upgradeFinished || !camera?.srcObject) return;
  const oldStream = camera.srcObject;
  const oldTrack = oldStream.getVideoTracks?.()[0];
  if (!oldTrack || isFront(oldTrack)) return;

  upgradeRunning = true;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices())
      .filter((device) => device.kind === 'videoinput')
      .map((device) => ({ device, score: cameraScore(device) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    let activeStream = oldStream;
    let activeTrack = oldTrack;
    const currentId = oldTrack.getSettings?.().deviceId;

    for (const { device } of devices) {
      if (device.deviceId === currentId && looksHalf(device.label)) break;
      if (device.deviceId === currentId) continue;
      try {
        const candidate = await requestDevice(device.deviceId);
        const candidateTrack = candidate.getVideoTracks()[0];
        if (!candidateTrack || isFront(candidateTrack)) {
          candidate.getTracks().forEach((track) => track.stop());
          continue;
        }

        const candidateLabel = candidateTrack.label || device.label || '';
        const candidateCaps = candidateTrack.getCapabilities?.();
        const canHalfZoom = Boolean(candidateCaps?.zoom && Number.isFinite(candidateCaps.zoom.min) && candidateCaps.zoom.min < 1);
        const isPreferred = looksHalf(candidateLabel) || /dual[ -]?wide|triple/i.test(candidateLabel) || canHalfZoom;

        if (!isPreferred) {
          candidate.getTracks().forEach((track) => track.stop());
          continue;
        }

        replacementStream?.getTracks().forEach((track) => track.stop());
        replacementStream = candidate;
        camera.srcObject = candidate;
        await camera.play();
        oldStream.getTracks().forEach((track) => track.stop());
        activeStream = candidate;
        activeTrack = candidateTrack;
        break;
      } catch (_) {}
    }

    // On a composite rear camera, this is the command that normally selects the
    // ultra-wide end of the lens range when the browser exposes zoom control.
    if (!looksHalf(activeTrack.label)) await requestHalfZoom(activeTrack);

    const settings = activeTrack.getSettings?.() || {};
    const label = activeTrack.label || '';
    const confirmed = looksHalf(label) || (Number.isFinite(settings.zoom) && settings.zoom <= 0.62);
    const caps = activeTrack.getCapabilities?.();
    const hasSubOneZoom = Boolean(caps?.zoom && Number.isFinite(caps.zoom.min) && caps.zoom.min < 1);

    if (cameraState) {
      cameraState.textContent = confirmed
        ? 'CAMERA: REAR 0.5X'
        : (hasSubOneZoom ? 'CAMERA: REAR WIDE' : 'CAMERA: REAR');
    }

    upgradeFinished = true;
  } finally {
    upgradeRunning = false;
  }
}

function waitForRearCamera() {
  if (upgradeFinished) return;
  if (camera?.srcObject && camera.readyState >= 1) upgradeRearCamera();
  else setTimeout(waitForRearCamera, 160);
}
setTimeout(waitForRearCamera, 220);
camera?.addEventListener('loadedmetadata', () => setTimeout(upgradeRearCamera, 100));

window.addEventListener('pagehide', () => replacementStream?.getTracks().forEach((track) => track.stop()));
