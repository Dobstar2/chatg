const eyes = [...document.querySelectorAll('.eye')];
const worlds = [...document.querySelectorAll('.world')];
const shells = [...document.querySelectorAll('.shell')];
const recenterButton = document.getElementById('recenterButton');
const startScreen = document.getElementById('startScreen');

const style = document.createElement('style');
style.textContent = `
  .eye { perspective: 1100px !important; }
  .world { inset: 0 !important; }
  .shell {
    width: min(68%, 520px) !important;
    max-height: 82% !important;
    left: 50% !important;
    top: 54% !important;
    transform-origin: 50% 50% !important;
  }
  .topbar,
  .gesture-status,
  .hero,
  .app-grid,
  .dock,
  .panel { max-width: 100%; }
  .spatial-app-panel {
    left: 6% !important;
    right: 6% !important;
    top: 15% !important;
    min-height: 0 !important;
    max-height: 70% !important;
    overflow: auto !important;
    padding: 14px !important;
    border-radius: 18px !important;
  }
  .tracker-preview-wrap {
    width: 88px !important;
    height: 55px !important;
    left: 8px !important;
    bottom: 8px !important;
    opacity: .72 !important;
  }
  .tracker-preview-wrap:has(canvas) { transform: translateZ(0); }
  .app-grid { gap: 6px !important; }
  .app-tile { min-height: 72px !important; }
  .hero { padding: 8px 9px !important; }
  .panel { margin-left: auto !important; margin-right: auto !important; }
  @media (max-height: 430px) {
    .shell { width: min(64%, 470px) !important; top: 55% !important; }
    .topbar { padding: 6px 9px !important; margin-bottom: 5px !important; }
    .gesture-status { margin-bottom: 5px !important; }
    .app-tile { min-height: 58px !important; padding: 6px !important; }
    .dock { margin-top: 6px !important; }
    .spatial-app-panel {
      top: 10% !important;
      left: 5% !important;
      right: 5% !important;
      max-height: 78% !important;
      padding: 11px !important;
    }
    .tracker-preview-wrap { width: 76px !important; height: 48px !important; opacity: .58 !important; }
  }
`;
document.head.appendChild(style);

let accelAvailable = false;
let lastMotionAt = 0;
const pos = { x: 0, y: 0, z: 0 };
const vel = { x: 0, y: 0, z: 0 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resetPosition() {
  pos.x = pos.y = pos.z = 0;
  vel.x = vel.y = vel.z = 0;
}

function screenAngle() {
  const angle = screen.orientation?.angle;
  if (Number.isFinite(angle)) return ((angle % 360) + 360) % 360;
  if (Number.isFinite(window.orientation)) return ((Number(window.orientation) % 360) + 360) % 360;
  return 0;
}

function mapAcceleration(acceleration) {
  const x = Number.isFinite(acceleration?.x) ? acceleration.x : 0;
  const y = Number.isFinite(acceleration?.y) ? acceleration.y : 0;
  const z = Number.isFinite(acceleration?.z) ? acceleration.z : 0;
  switch (screenAngle()) {
    case 90: return { x: -y, y: x, z };
    case 180: return { x: -x, y: -y, z };
    case 270: return { x: y, y: -x, z };
    default: return { x, y, z };
  }
}

function deadzone(value, threshold = 0.09) {
  return Math.abs(value) <= threshold ? 0 : value - Math.sign(value) * threshold;
}

function onMotion(event) {
  if (!event.acceleration) return;
  const a = mapAcceleration(event.acceleration);
  accelAvailable = true;

  const now = performance.now();
  const dt = clamp(lastMotionAt ? (now - lastMotionAt) / 1000 : 1 / 60, 0.008, 0.045);
  lastMotionAt = now;

  const ax = clamp(deadzone(a.x), -3, 3);
  const ay = clamp(deadzone(a.y), -3, 3);
  const az = clamp(deadzone(a.z), -3, 3);

  const spring = 15;
  const damping = Math.exp(-7.5 * dt);
  vel.x += (ax - pos.x * spring) * dt;
  vel.y += (ay - pos.y * spring) * dt;
  vel.z += (az - pos.z * spring) * dt;
  vel.x *= damping;
  vel.y *= damping;
  vel.z *= damping;

  pos.x = clamp(pos.x + vel.x * dt, -0.032, 0.032);
  pos.y = clamp(pos.y + vel.y * dt, -0.026, 0.026);
  pos.z = clamp(pos.z + vel.z * dt, -0.022, 0.022);
}

window.addEventListener('devicemotion', onMotion, { passive: true });
window.addEventListener('orientationchange', resetPosition, { passive: true });
recenterButton?.addEventListener('click', resetPosition);

function applyStereoPlacement() {
  const px = accelAvailable ? clamp(-pos.x * 420, -14, 14) : 0;
  const py = accelAvailable ? clamp(pos.y * 420, -11, 11) : 0;
  const depthScale = accelAvailable ? clamp(1 + pos.z * 0.35, 0.992, 1.008) : 1;

  shells.forEach((shell, index) => {
    // Small opposite offsets create one comfortable virtual depth instead of two
    // visibly separate copies. Inertial translation is intentionally subtle.
    const stereo = index === 0 ? 2.2 : -2.2;
    shell.style.translate = `${(px + stereo).toFixed(1)}px ${py.toFixed(1)}px`;
    shell.style.scale = depthScale.toFixed(4);
  });

  requestAnimationFrame(applyStereoPlacement);
}
requestAnimationFrame(applyStereoPlacement);

function autoAnchorWhenReady() {
  let anchored = false;

  const placeAnchor = () => {
    if (anchored || !startScreen?.classList.contains('hidden')) return;
    anchored = true;
    // Let sensor/camera startup settle before capturing forward direction.
    setTimeout(() => recenterButton?.click(), 650);
  };

  placeAnchor();
  const observer = new MutationObserver(placeAnchor);
  if (startScreen) observer.observe(startScreen, { attributes: true, attributeFilter: ['class'] });
  setTimeout(() => observer.disconnect(), 6000);
}
autoAnchorWhenReady();
