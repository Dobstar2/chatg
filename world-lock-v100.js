const startScreen = document.getElementById('startScreen');
const recenterButton = document.getElementById('recenterButton');
const worlds = [...document.querySelectorAll('.world')];
const shells = worlds.map((world) => world.querySelector('.shell'));

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothFactor = (dtMs, tauMs) => 1 - Math.exp(-dtMs / tauMs);

// This rule is the ONLY visible owner of .shell transform in v1.0.0.
// script.js may still write an inline transform for its legacy renderer, but
// this !important transform always wins and is fed only by the world-vector
// projection below. No accelerometer translation is part of the anchor.
const style = document.createElement('style');
style.textContent = `
  .world { inset: 0 !important; }
  .eye { perspective: 1050px !important; }
  .shell {
    width: min(64%, 500px) !important;
    left: 50% !important;
    top: 52% !important;
    translate: none !important;
    scale: none !important;
    transform-origin: 50% 50% !important;
    transform: translate3d(
      calc(-50% + var(--world-x, 0px)),
      calc(-50% + var(--world-y, 0px)),
      0
    ) rotateZ(var(--world-roll, 0deg)) !important;
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
  @media (max-height: 430px) {
    .shell { width: min(60%, 455px) !important; top: 53% !important; }
    .hero { display: none !important; }
    .app-tile { min-height: 58px !important; }
    .tracker-preview-wrap { width: 72px !important; height: 45px !important; opacity: .55 !important; }
  }
`;
document.head.appendChild(style);

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
  const half = angle * 0.5;
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

let currentQuat = null;
let anchorForwardWorld = null;
let anchorUpWorld = null;
let targetScreen = { x: 0, y: 0, roll: 0 };
let smoothScreen = { x: 0, y: 0, roll: 0 };
let lastFrameAt = 0;
let pendingAutoAnchor = false;

function captureAnchor() {
  if (!currentQuat) return false;
  // Store the exact camera-forward and camera-up directions in world coordinates.
  // Those vectors do not move until the user explicitly recenters.
  anchorForwardWorld = qRotateVector(currentQuat, { x: 0, y: 0, z: -1 });
  anchorUpWorld = qRotateVector(currentQuat, { x: 0, y: 1, z: 0 });
  targetScreen = { x: 0, y: 0, roll: 0 };
  smoothScreen = { x: 0, y: 0, roll: 0 };
  shells.forEach((shell) => {
    shell?.style.setProperty('--world-x', '0px');
    shell?.style.setProperty('--world-y', '0px');
    shell?.style.setProperty('--world-roll', '0deg');
  });
  return true;
}

function onOrientation(event) {
  const alpha = Number.isFinite(event.alpha) ? event.alpha : 0;
  const beta = Number.isFinite(event.beta) ? event.beta : 0;
  const gamma = Number.isFinite(event.gamma) ? event.gamma : 0;
  currentQuat = deviceQuaternion(alpha, beta, gamma);

  if (pendingAutoAnchor && startScreen?.classList.contains('hidden')) {
    if (captureAnchor()) pendingAutoAnchor = false;
  }

  if (!anchorForwardWorld || !anchorUpWorld) return;

  // Convert the frozen world vectors back into the CURRENT camera coordinate
  // system. This is the key difference from the earlier yaw-multiplier code.
  const worldToCamera = qConjugate(currentQuat);
  const forwardCamera = qRotateVector(worldToCamera, anchorForwardWorld);
  const upCamera = qRotateVector(worldToCamera, anchorUpWorld);

  const depth = Math.max(0.08, -forwardCamera.z);
  const normalizedX = forwardCamera.x / depth;
  const normalizedY = forwardCamera.y / depth;
  const roll = Math.atan2(upCamera.x, upCamera.y) * RAD;

  targetScreen.x = clamp(normalizedX, -6, 6);
  targetScreen.y = clamp(-normalizedY, -5, 5);
  targetScreen.roll = clamp(roll, -32, 32);
}

window.addEventListener('deviceorientation', onOrientation, { capture: true, passive: true });

function requestAnchor() {
  pendingAutoAnchor = true;
  setTimeout(() => {
    if (currentQuat && startScreen?.classList.contains('hidden')) {
      captureAnchor();
      pendingAutoAnchor = false;
    }
  }, 420);
}

recenterButton?.addEventListener('click', () => {
  captureAnchor();
  pendingAutoAnchor = false;
}, true);

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="recenter"]')) {
    captureAnchor();
    pendingAutoAnchor = false;
  }
}, true);

if (startScreen) {
  const observer = new MutationObserver(() => {
    if (startScreen.classList.contains('hidden')) requestAnchor();
  });
  observer.observe(startScreen, { attributes: true, attributeFilter: ['class'] });
}

function render(now) {
  const dt = clamp(lastFrameAt ? now - lastFrameAt : 16.7, 7, 35);
  lastFrameAt = now;
  const alpha = smoothFactor(dt, 12);
  smoothScreen.x += (targetScreen.x - smoothScreen.x) * alpha;
  smoothScreen.y += (targetScreen.y - smoothScreen.y) * alpha;
  smoothScreen.roll += (targetScreen.roll - smoothScreen.roll) * alpha;

  shells.forEach((shell, index) => {
    const world = worlds[index];
    if (!shell || !world) return;
    const width = Math.max(1, world.clientWidth);
    const height = Math.max(1, world.clientHeight);
    const focalX = width / 2 / Math.tan(43 * DEG);
    const focalY = height / 2 / Math.tan(35 * DEG);
    const stereo = index === 0 ? 2 : -2;

    const x = clamp(smoothScreen.x * focalX, -width * 2.2, width * 2.2) + stereo;
    const y = clamp(smoothScreen.y * focalY, -height * 1.8, height * 1.8);

    shell.style.setProperty('--world-x', `${x.toFixed(2)}px`);
    shell.style.setProperty('--world-y', `${y.toFixed(2)}px`);
    shell.style.setProperty('--world-roll', `${smoothScreen.roll.toFixed(2)}deg`);
  });

  requestAnimationFrame(render);
}
requestAnimationFrame(render);
