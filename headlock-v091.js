const BUILD = 'v0.9.1';

const eyes = [...document.querySelectorAll('.eye')];
const shells = [...document.querySelectorAll('.shell')];
const globalHud = document.getElementById('hud');

const sourceIds = ['buildState', 'motionState', 'lookState', 'handState', 'cameraState'];
const sourceNodes = Object.fromEntries(sourceIds.map((id) => [id, document.getElementById(id)]));

const style = document.createElement('style');
style.textContent = `
  #hud { display: none !important; }
  .eye-hud {
    position: absolute;
    z-index: 45;
    top: max(7%, env(safe-area-inset-top));
    left: 50%;
    width: min(92%, 390px);
    transform: translate3d(-50%, 0, 0);
    pointer-events: none;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px;
    padding: 6px 7px;
    border: 1px solid rgba(255,255,255,.16);
    border-radius: 14px;
    background: rgba(4,7,13,.82);
    font: 800 7px/1 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    color: #f7f9ff;
    white-space: nowrap;
    contain: layout paint style;
    backface-visibility: hidden;
  }
  .eye-hud[data-eye-index="0"] { margin-left: 1px; }
  .eye-hud[data-eye-index="1"] { margin-left: -1px; }
  .eye-hud span {
    padding: 4px 5px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,.10);
    background: rgba(0,0,0,.48);
  }
  .eye-hud .hud-build,
  .eye-hud .hud-position {
    color: #74f6c2;
    border-color: rgba(116,246,194,.32);
    background: rgba(23,66,55,.48);
  }
  @media (max-height: 430px) {
    .eye-hud { top: 5%; width: 88%; font-size: 6px; padding: 4px 5px; gap: 3px; }
    .eye-hud span { padding: 3px 4px; }
  }
`;
document.head.appendChild(style);

if (globalHud) globalHud.style.display = 'none';

const huds = eyes.map((eye, index) => {
  const hud = document.createElement('div');
  hud.className = 'eye-hud';
  hud.dataset.eyeIndex = String(index);
  hud.innerHTML = `
    <span class="hud-build">BUILD ${BUILD}</span>
    <span data-copy="motionState">HEAD: OFF</span>
    <span data-copy="lookState">LOOK: CENTER</span>
    <span data-copy="handState">HAND: OFF</span>
    <span data-copy="cameraState">CAMERA: OFF</span>
    <span>ANCHOR: WORLD</span>
    <span class="hud-position" data-position>POS: ROT ONLY</span>
  `;
  eye.appendChild(hud);
  return hud;
});

function syncHud() {
  huds.forEach((hud) => {
    hud.querySelector('.hud-build').textContent = `BUILD ${BUILD}`;
    for (const id of sourceIds) {
      if (id === 'buildState') continue;
      const target = hud.querySelector(`[data-copy="${id}"]`);
      const source = sourceNodes[id];
      if (target && source) target.textContent = source.textContent;
    }
  });

  const buildState = sourceNodes.buildState;
  const startBuild = document.getElementById('startBuild');
  if (buildState) buildState.textContent = `BUILD ${BUILD}`;
  if (startBuild) startBuild.textContent = `BUILD ${BUILD}`;
  document.documentElement.dataset.build = BUILD;
}

let accelAvailable = false;
let lastMotionTime = 0;
const position = { x: 0, y: 0, z: 0 };
const velocity = { x: 0, y: 0, z: 0 };

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function screenAngle() {
  const angle = screen.orientation?.angle;
  if (Number.isFinite(angle)) return ((angle % 360) + 360) % 360;
  if (Number.isFinite(window.orientation)) return ((Number(window.orientation) % 360) + 360) % 360;
  return 0;
}

function accelerationInScreenAxes(acceleration) {
  const x = finiteOrZero(acceleration.x);
  const y = finiteOrZero(acceleration.y);
  const z = finiteOrZero(acceleration.z);

  switch (screenAngle()) {
    case 90:
      return { x: -y, y: x, z };
    case 180:
      return { x: -x, y: -y, z };
    case 270:
      return { x: y, y: -x, z };
    default:
      return { x, y, z };
  }
}

function deadzone(value, threshold = 0.075) {
  if (Math.abs(value) < threshold) return 0;
  return value - Math.sign(value) * threshold;
}

function resetInertialPosition() {
  position.x = 0;
  position.y = 0;
  position.z = 0;
  velocity.x = 0;
  velocity.y = 0;
  velocity.z = 0;
}

function onDeviceMotion(event) {
  const acceleration = event.acceleration;
  if (!acceleration) return;

  const raw = accelerationInScreenAxes(acceleration);
  if (![raw.x, raw.y, raw.z].some((value) => Number.isFinite(value))) return;

  accelAvailable = true;
  const now = performance.now();
  const eventDt = Number.isFinite(event.interval) && event.interval > 0 ? event.interval / 1000 : 0;
  const measuredDt = lastMotionTime ? (now - lastMotionTime) / 1000 : 1 / 60;
  const dt = Math.min(0.05, Math.max(0.008, eventDt || measuredDt));
  lastMotionTime = now;

  const ax = Math.max(-4, Math.min(4, deadzone(raw.x)));
  const ay = Math.max(-4, Math.min(4, deadzone(raw.y)));
  const az = Math.max(-4, Math.min(4, deadzone(raw.z)));

  // A spring-damper keeps integration bounded. This creates short-range
  // translation/parallax only; it is intentionally not treated as absolute 6DoF.
  const spring = 12.0;
  const damping = Math.exp(-6.2 * dt);

  velocity.x += (ax - position.x * spring) * dt;
  velocity.y += (ay - position.y * spring) * dt;
  velocity.z += (az - position.z * spring) * dt;

  velocity.x *= damping;
  velocity.y *= damping;
  velocity.z *= damping;

  position.x = Math.max(-0.055, Math.min(0.055, position.x + velocity.x * dt));
  position.y = Math.max(-0.045, Math.min(0.045, position.y + velocity.y * dt));
  position.z = Math.max(-0.035, Math.min(0.035, position.z + velocity.z * dt));
}

window.addEventListener('devicemotion', onDeviceMotion, { passive: true });
window.addEventListener('orientationchange', resetInertialPosition, { passive: true });

document.addEventListener('click', (event) => {
  if (event.target.closest('#recenterButton,[data-action="recenter"]')) resetInertialPosition();
}, true);

function renderInertialParallax() {
  const targetX = accelAvailable ? Math.max(-34, Math.min(34, -position.x * 680)) : 0;
  const targetY = accelAvailable ? Math.max(-26, Math.min(26, position.y * 680)) : 0;
  const targetScale = accelAvailable ? Math.max(0.975, Math.min(1.025, 1 + position.z * 0.52)) : 1;

  shells.forEach((shell) => {
    // Individual transform properties compose with the base script's `transform`,
    // so rotation/world anchoring stays intact while translation adds parallax.
    shell.style.translate = `${targetX.toFixed(1)}px ${targetY.toFixed(1)}px`;
    shell.style.scale = targetScale.toFixed(4);
  });

  const label = accelAvailable ? 'POS: INERTIAL' : 'POS: ROT ONLY';
  huds.forEach((hud) => {
    const node = hud.querySelector('[data-position]');
    if (node) node.textContent = label;
  });

  requestAnimationFrame(renderInertialParallax);
}

syncHud();
setInterval(syncHud, 120);
requestAnimationFrame(renderInertialParallax);
