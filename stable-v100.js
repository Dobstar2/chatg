const BUILD = 'v1.0.0';

const camera = document.getElementById('camera');
const startScreen = document.getElementById('startScreen');
const recenterButton = document.getElementById('recenterButton');
const buildState = document.getElementById('buildState');
const startBuild = document.getElementById('startBuild');
const motionState = document.getElementById('motionState');
const lookState = document.getElementById('lookState');
const handState = document.getElementById('handState');
const cameraState = document.getElementById('cameraState');
const worlds = [...document.querySelectorAll('.world')];
const shells = worlds.map((world) => world.querySelector('.shell'));

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothFactor = (dtMs, tauMs) => 1 - Math.exp(-dtMs / tauMs);

// Remove every older HUD overlay. v1.0 uses a canvas visor that never enters
// the world transform tree and therefore cannot slide with head rotation.
document.querySelectorAll('.eye-hud,.eye-hud-v092,.visor-root-v093,.visor-root-v094').forEach((node) => node.remove());
const legacyHud = document.getElementById('hud');
if (legacyHud) legacyHud.style.display = 'none';

const style = document.createElement('style');
style.textContent = `
  .world { inset: 0 !important; }
  .eye { perspective: 1000px !important; }
  .shell {
    width: min(64%, 500px) !important;
    left: 50% !important;
    top: 52% !important;
    transform-origin: 50% 50% !important;
    translate: none !important;
    scale: none !important;
    will-change: transform !important;
  }
  .spatial-app-panel {
    left: 5% !important;
    right: 5% !important;
    top: 13% !important;
    min-height: 0 !important;
    max-height: 72% !important;
    overflow: auto !important;
  }
  .tracker-preview-wrap {
    width: 82px !important;
    height: 52px !important;
    left: 8px !important;
    bottom: 8px !important;
    opacity: .68 !important;
  }
  #stableHudV100 {
    position: fixed !important;
    inset: 0 !important;
    z-index: 2147483000 !important;
    width: 100vw !important;
    height: 100vh !important;
    margin: 0 !important;
    padding: 0 !important;
    pointer-events: none !important;
    transform: none !important;
    translate: none !important;
    rotate: none !important;
    scale: none !important;
  }
  @media (max-height: 430px) {
    .shell { width: min(60%, 455px) !important; top: 53% !important; }
    .app-tile { min-height: 58px !important; }
    .hero { display: none !important; }
    .tracker-preview-wrap { width: 72px !important; height: 45px !important; opacity: .55 !important; }
  }
`;
document.head.appendChild(style);

// ----- Fixed visor HUD: canvas pixels, no CSS reflow from status text -----
const hudCanvas = document.createElement('canvas');
hudCanvas.id = 'stableHudV100';
hudCanvas.setAttribute('aria-hidden', 'true');
document.body.appendChild(hudCanvas);
const hudCtx = hudCanvas.getContext('2d');
let hudCssWidth = 1;
let hudCssHeight = 1;
let hudDpr = 1;

function resizeHudCanvas() {
  hudCssWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  hudCssHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  hudDpr = Math.min(window.devicePixelRatio || 1, 2);
  hudCanvas.width = Math.round(hudCssWidth * hudDpr);
  hudCanvas.height = Math.round(hudCssHeight * hudDpr);
  hudCanvas.style.width = `${hudCssWidth}px`;
  hudCanvas.style.height = `${hudCssHeight}px`;
  hudCtx.setTransform(hudDpr, 0, 0, hudDpr, 0, 0);
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawChip(ctx, text, x, y, w, h, accent = false) {
  roundedRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = accent ? 'rgba(23,66,55,.88)' : 'rgba(0,0,0,.72)';
  ctx.fill();
  ctx.strokeStyle = accent ? 'rgba(116,246,194,.52)' : 'rgba(255,255,255,.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  roundedRect(ctx, x + 1, y + 1, w - 2, h - 2, h / 2 - 1);
  ctx.clip();
  ctx.fillStyle = accent ? '#74f6c2' : '#f7f9ff';
  ctx.font = '800 7px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + 0.3);
  ctx.restore();
}

function drawFixedHud() {
  if (!hudCtx) return;
  hudCtx.clearRect(0, 0, hudCssWidth, hudCssHeight);

  const eyeWidth = hudCssWidth / 2;
  const compact = hudCssHeight <= 430;
  const panelWidth = Math.min(compact ? 286 : 318, eyeWidth * 0.72);
  const panelHeight = compact ? 50 : 54;
  const top = Math.max(8, compact ? hudCssHeight * 0.038 : hudCssHeight * 0.05);
  const chipGap = 4;
  const padding = 6;
  const chipWidth = (panelWidth - padding * 2 - chipGap * 2) / 3;
  const chipHeight = (panelHeight - padding * 2 - chipGap) / 2;

  const statuses = [
    [`BUILD ${BUILD}`, true],
    [motionState?.textContent || 'HEAD: OFF', false],
    [handState?.textContent || 'HAND: OFF', false],
    [cameraState?.textContent || 'CAMERA: OFF', false],
    [lookState?.textContent || 'LOOK: CENTER', false],
    ['HUD: LOCKED', true],
  ];

  for (let eye = 0; eye < 2; eye += 1) {
    const panelX = eye * eyeWidth + (eyeWidth - panelWidth) / 2;
    roundedRect(hudCtx, panelX, top, panelWidth, panelHeight, 14);
    hudCtx.fillStyle = 'rgba(3,6,12,.88)';
    hudCtx.fill();
    hudCtx.strokeStyle = 'rgba(255,255,255,.15)';
    hudCtx.lineWidth = 1;
    hudCtx.stroke();

    statuses.forEach(([text, accent], index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = panelX + padding + col * (chipWidth + chipGap);
      const y = top + padding + row * (chipHeight + chipGap);
      drawChip(hudCtx, text, x, y, chipWidth, chipHeight, accent);
    });
  }
}

resizeHudCanvas();
window.addEventListener('resize', () => {
  resizeHudCanvas();
  drawFixedHud();
}, { passive: true });
window.addEventListener('orientationchange', () => setTimeout(() => {
  resizeHudCanvas();
  drawFixedHud();
}, 250), { passive: true });
setInterval(drawFixedHud, 100);

// ----- Stable world anchor: rotation only. No accelerometer integration. -----
function qNormalize(q) {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

function qMultiply(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function qConjugate(q) {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function qAxisAngle(x, y, z, angle) {
  const half = angle / 2;
  const s = Math.sin(half);
  return { x: x * s, y: y * s, z: z * s, w: Math.cos(half) };
}

function qFromEulerYXZ(x, y, z) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 - s1 * s2 * c3,
    w: c1 * c2 * c3 + s1 * s2 * s3,
  };
}

function qRotateVector(q, v) {
  const result = qMultiply(qMultiply(q, { x: v.x, y: v.y, z: v.z, w: 0 }), qConjugate(q));
  return { x: result.x, y: result.y, z: result.z };
}

function screenAngleDegrees() {
  const angle = screen.orientation?.angle;
  if (Number.isFinite(angle)) return ((angle % 360) + 360) % 360;
  if (Number.isFinite(window.orientation)) return ((Number(window.orientation) % 360) + 360) % 360;
  return 0;
}

function deviceQuaternion(alpha, beta, gamma) {
  const euler = qFromEulerYXZ(beta * DEG, alpha * DEG, -gamma * DEG);
  const cameraCorrection = qAxisAngle(1, 0, 0, -Math.PI / 2);
  const screenCorrection = qAxisAngle(0, 0, 1, -screenAngleDegrees() * DEG);
  return qNormalize(qMultiply(qMultiply(euler, cameraCorrection), screenCorrection));
}

function poseFromRelative(base, current) {
  const relative = qNormalize(qMultiply(qConjugate(base), current));
  const forward = qRotateVector(relative, { x: 0, y: 0, z: -1 });
  const up = qRotateVector(relative, { x: 0, y: 1, z: 0 });
  return {
    yaw: clamp(Math.atan2(-forward.x, -forward.z) * RAD, -72, 72),
    pitch: clamp(Math.asin(clamp(forward.y, -1, 1)) * RAD, -48, 48),
    roll: clamp(Math.atan2(up.x, up.y) * RAD, -28, 28),
  };
}

let stableCurrentQuat = null;
let stableBaselineQuat = null;
let stableTargetPose = { yaw: 0, pitch: 0, roll: 0 };
let stablePose = { yaw: 0, pitch: 0, roll: 0 };
let stableLastFrame = 0;
let waitingToAnchor = true;

function resetStableAnchor() {
  if (stableCurrentQuat) stableBaselineQuat = { ...stableCurrentQuat };
  stableTargetPose = { yaw: 0, pitch: 0, roll: 0 };
  stablePose = { yaw: 0, pitch: 0, roll: 0 };
  waitingToAnchor = false;
}

function onStableOrientation(event) {
  const alpha = Number.isFinite(event.alpha) ? event.alpha : 0;
  const beta = Number.isFinite(event.beta) ? event.beta : 0;
  const gamma = Number.isFinite(event.gamma) ? event.gamma : 0;
  stableCurrentQuat = deviceQuaternion(alpha, beta, gamma);

  if (waitingToAnchor && startScreen?.classList.contains('hidden')) {
    resetStableAnchor();
  }
  if (!stableBaselineQuat) return;

  const pose = poseFromRelative(stableBaselineQuat, stableCurrentQuat);
  stableTargetPose.yaw = Math.abs(pose.yaw) < 0.06 ? 0 : pose.yaw;
  stableTargetPose.pitch = Math.abs(pose.pitch) < 0.06 ? 0 : pose.pitch;
  stableTargetPose.roll = Math.abs(pose.roll) < 0.10 ? 0 : pose.roll;
}

window.addEventListener('deviceorientation', onStableOrientation, { capture: true, passive: true });
recenterButton?.addEventListener('click', resetStableAnchor, true);
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="recenter"]')) resetStableAnchor();
}, true);

const startObserver = new MutationObserver(() => {
  if (startScreen?.classList.contains('hidden')) {
    waitingToAnchor = true;
    setTimeout(() => {
      if (stableCurrentQuat) resetStableAnchor();
    }, 450);
  }
});
if (startScreen) startObserver.observe(startScreen, { attributes: true, attributeFilter: ['class'] });

function renderStableWorld(now) {
  const dt = clamp(stableLastFrame ? now - stableLastFrame : 16.7, 7, 35);
  stableLastFrame = now;
  const s = smoothFactor(dt, 11);
  stablePose.yaw += (stableTargetPose.yaw - stablePose.yaw) * s;
  stablePose.pitch += (stableTargetPose.pitch - stablePose.pitch) * s;
  stablePose.roll += (stableTargetPose.roll - stablePose.roll) * s;

  shells.forEach((shell, index) => {
    const world = worlds[index];
    if (!shell || !world) return;
    const width = Math.max(1, world.clientWidth);
    const height = Math.max(1, world.clientHeight);

    // Pinhole projection of a world-fixed billboard. This is deliberately
    // rotation-only: there is no accelerometer-derived position to drift.
    const horizontalHalfFov = 43 * DEG;
    const verticalHalfFov = 35 * DEG;
    const focalX = width / 2 / Math.tan(horizontalHalfFov);
    const focalY = height / 2 / Math.tan(verticalHalfFov);
    const yaw = stablePose.yaw * DEG;
    const pitch = stablePose.pitch * DEG;

    // When the user turns LEFT (negative yaw), a world-fixed object moves RIGHT.
    // When the user turns RIGHT (positive yaw), it moves LEFT.
    const projectedX = clamp(-Math.tan(yaw) * focalX, -width * 2.2, width * 2.2);
    const projectedY = clamp(Math.tan(pitch) * focalY, -height * 1.8, height * 1.8);
    const stereo = index === 0 ? 2 : -2;

    shell.style.translate = 'none';
    shell.style.scale = 'none';
    shell.style.transform = `translate3d(calc(-50% + ${(projectedX + stereo).toFixed(2)}px), calc(-50% + ${projectedY.toFixed(2)}px), 0) rotateZ(${(-stablePose.roll).toFixed(2)}deg)`;
  });

  requestAnimationFrame(renderStableWorld);
}
requestAnimationFrame(renderStableWorld);

// ----- Rear 0.5x preference -----
let replacementStream = null;
let cameraUpgradeRunning = false;
let cameraUpgradeDone = false;

function isFrontTrack(track) {
  if (!track) return true;
  const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
  const label = (track.label || '').toLowerCase();
  return settings.facingMode === 'user' || /front|user|facetime|selfie/.test(label);
}

function isUltraWideLabel(label) {
  return /ultra[ -]?wide|0\.5|0,5/.test((label || '').toLowerCase());
}

async function applyHalfZoom(track) {
  if (!track || typeof track.getCapabilities !== 'function' || typeof track.applyConstraints !== 'function') return false;
  const caps = track.getCapabilities();
  const zoom = caps?.zoom;
  if (!zoom) return false;

  const min = Number.isFinite(zoom.min) ? zoom.min : 1;
  const max = Number.isFinite(zoom.max) ? zoom.max : 1;
  let target = null;
  if (min <= 0.5 && max >= 0.5) target = 0.5;
  else if (min < 1) target = min;
  if (target == null) return false;

  try {
    await track.applyConstraints({ advanced: [{ zoom: target }] });
    return true;
  } catch (_) {
    return false;
  }
}

async function upgradeToRearHalfCamera() {
  if (cameraUpgradeRunning || cameraUpgradeDone) return;
  const currentStream = camera?.srcObject;
  const currentTrack = currentStream?.getVideoTracks?.()[0];
  if (!currentTrack || isFrontTrack(currentTrack)) return;

  cameraUpgradeRunning = true;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const ultra = devices.find((device) => device.kind === 'videoinput' && isUltraWideLabel(device.label));
    let activeTrack = currentTrack;

    if (ultra) {
      const currentId = currentTrack.getSettings?.().deviceId;
      if (!currentId || currentId !== ultra.deviceId) {
        try {
          const nextStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: ultra.deviceId },
              width: { ideal: 640, max: 960 },
              height: { ideal: 480, max: 720 },
              frameRate: { ideal: 30, max: 30 },
            },
            audio: false,
          });
          const nextTrack = nextStream.getVideoTracks()[0];
          if (nextTrack && !isFrontTrack(nextTrack)) {
            replacementStream?.getTracks().forEach((track) => track.stop());
            replacementStream = nextStream;
            camera.srcObject = nextStream;
            await camera.play();
            currentStream.getTracks().forEach((track) => track.stop());
            activeTrack = nextTrack;
          } else {
            nextStream.getTracks().forEach((track) => track.stop());
          }
        } catch (_) {}
      }
    }

    const zoomApplied = await applyHalfZoom(activeTrack);
    const settings = activeTrack.getSettings?.() || {};
    const label = activeTrack.label || '';
    const confirmedHalf = isUltraWideLabel(label) || (Number.isFinite(settings.zoom) && settings.zoom <= 0.62);

    if (cameraState) {
      if (confirmedHalf) cameraState.textContent = 'CAMERA: REAR 0.5X';
      else if (zoomApplied) cameraState.textContent = 'CAMERA: REAR 0.5 TRY';
      else cameraState.textContent = 'CAMERA: REAR';
    }
    cameraUpgradeDone = true;
  } finally {
    cameraUpgradeRunning = false;
  }
}

function watchForCamera() {
  if (cameraUpgradeDone) return;
  if (camera?.srcObject && camera.readyState >= 1) {
    upgradeToRearHalfCamera();
  } else {
    setTimeout(watchForCamera, 180);
  }
}
setTimeout(watchForCamera, 250);
camera?.addEventListener('loadedmetadata', () => setTimeout(upgradeToRearHalfCamera, 120));

window.addEventListener('pagehide', () => {
  replacementStream?.getTracks().forEach((track) => track.stop());
});

function stampBuild() {
  if (buildState) buildState.textContent = `BUILD ${BUILD}`;
  if (startBuild) startBuild.textContent = `BUILD ${BUILD}`;
  document.documentElement.dataset.build = BUILD;
}
stampBuild();
setInterval(stampBuild, 500);
drawFixedHud();
