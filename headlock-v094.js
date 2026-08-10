const BUILD = 'v0.9.4';

// Remove every previous HUD implementation so only this hard-locked visor exists.
document.querySelectorAll('#hud,.eye-hud,.eye-hud-v092,.visor-root-v093,.visor-root-v094').forEach((node) => {
  if (node.id === 'hud') node.style.display = 'none';
  else node.remove();
});

const sourceIds = ['motionState', 'lookState', 'handState', 'cameraState'];
const sourceNodes = Object.fromEntries(sourceIds.map((id) => [id, document.getElementById(id)]));

const style = document.createElement('style');
style.textContent = `
  .visor-root-v094 {
    position: absolute !important;
    z-index: 2147483000 !important;
    pointer-events: none !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    transform: none !important;
    translate: none !important;
    rotate: none !important;
    scale: none !important;
    perspective: none !important;
    transform-origin: 0 0 !important;
    contain: strict !important;
    overflow: hidden !important;
  }
  .visor-eye-v094 {
    position: absolute !important;
    top: 0 !important;
    bottom: 0 !important;
    width: 50% !important;
    margin: 0 !important;
    padding: 0 !important;
    transform: none !important;
    translate: none !important;
    rotate: none !important;
    scale: none !important;
    perspective: none !important;
    overflow: visible !important;
  }
  .visor-eye-v094[data-eye="left"] { left: 0 !important; }
  .visor-eye-v094[data-eye="right"] { right: 0 !important; }
  .visor-hud-v094 {
    position: absolute !important;
    margin: 0 !important;
    transform: none !important;
    translate: none !important;
    rotate: none !important;
    scale: none !important;
    perspective: none !important;
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    grid-template-rows: repeat(2, 1fr) !important;
    align-items: center !important;
    justify-items: stretch !important;
    gap: 4px !important;
    padding: 6px !important;
    border: 1px solid rgba(255,255,255,.14) !important;
    border-radius: 14px !important;
    background: rgba(3,6,12,.88) !important;
    box-shadow: 0 8px 22px rgba(0,0,0,.22) !important;
    color: #f7f9ff !important;
    font: 800 6.4px/1 -apple-system,BlinkMacSystemFont,system-ui,sans-serif !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
    backface-visibility: hidden !important;
  }
  .visor-hud-v094 span {
    display: block !important;
    width: 100% !important;
    min-width: 0 !important;
    height: 20px !important;
    line-height: 12px !important;
    padding: 4px 3px !important;
    box-sizing: border-box !important;
    border-radius: 999px !important;
    border: 1px solid rgba(255,255,255,.10) !important;
    background: rgba(0,0,0,.50) !important;
    color: #f7f9ff !important;
    text-align: center !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: clip !important;
  }
  .visor-hud-v094 span.accent {
    color: #74f6c2 !important;
    border-color: rgba(116,246,194,.34) !important;
    background: rgba(23,66,55,.52) !important;
  }
`;
document.head.appendChild(style);

const root = document.createElement('div');
root.className = 'visor-root-v094';
root.setAttribute('aria-hidden', 'true');
root.innerHTML = `
  <div class="visor-eye-v094" data-eye="left">
    <div class="visor-hud-v094">
      <span class="accent">BUILD ${BUILD}</span>
      <span data-copy="motionState">HEAD: OFF</span>
      <span data-copy="handState">HAND: OFF</span>
      <span data-copy="cameraState">CAMERA: OFF</span>
      <span data-copy="lookState">LOOK: CENTER</span>
      <span class="accent">HUD: LOCKED</span>
    </div>
  </div>
  <div class="visor-eye-v094" data-eye="right">
    <div class="visor-hud-v094">
      <span class="accent">BUILD ${BUILD}</span>
      <span data-copy="motionState">HEAD: OFF</span>
      <span data-copy="handState">HAND: OFF</span>
      <span data-copy="cameraState">CAMERA: OFF</span>
      <span data-copy="lookState">LOOK: CENTER</span>
      <span class="accent">HUD: LOCKED</span>
    </div>
  </div>
`;

// Append directly to <html>, not <body>, so the body's fixed/VR layout cannot affect it.
document.documentElement.appendChild(root);

function visibleViewport() {
  const vv = window.visualViewport;
  if (vv) {
    return {
      left: Number.isFinite(vv.pageLeft) ? vv.pageLeft : 0,
      top: Number.isFinite(vv.pageTop) ? vv.pageTop : 0,
      width: Math.max(1, vv.width),
      height: Math.max(1, vv.height),
    };
  }
  return {
    left: window.scrollX || 0,
    top: window.scrollY || 0,
    width: Math.max(1, document.documentElement.clientWidth || window.innerWidth),
    height: Math.max(1, document.documentElement.clientHeight || window.innerHeight),
  };
}

function hardLockGeometry() {
  const viewport = visibleViewport();
  root.style.left = `${viewport.left.toFixed(2)}px`;
  root.style.top = `${viewport.top.toFixed(2)}px`;
  root.style.width = `${viewport.width.toFixed(2)}px`;
  root.style.height = `${viewport.height.toFixed(2)}px`;

  const eyeWidth = viewport.width * 0.5;
  const landscapeCompact = viewport.height <= 430;
  const hudWidth = Math.min(landscapeCompact ? 300 : 330, eyeWidth * (landscapeCompact ? 0.72 : 0.76));
  const hudHeight = landscapeCompact ? 50 : 54;
  const hudTop = Math.max(8, viewport.height * (landscapeCompact ? 0.042 : 0.052));
  const hudLeft = (eyeWidth - hudWidth) * 0.5;

  root.querySelectorAll('.visor-hud-v094').forEach((hud) => {
    hud.style.left = `${hudLeft.toFixed(2)}px`;
    hud.style.top = `${hudTop.toFixed(2)}px`;
    hud.style.width = `${hudWidth.toFixed(2)}px`;
    hud.style.height = `${hudHeight.toFixed(2)}px`;
  });

  requestAnimationFrame(hardLockGeometry);
}

function syncHud() {
  root.querySelectorAll('.visor-hud-v094').forEach((hud) => {
    for (const id of sourceIds) {
      const source = sourceNodes[id];
      const target = hud.querySelector(`[data-copy="${id}"]`);
      if (source && target) target.textContent = source.textContent;
    }
  });

  const buildState = document.getElementById('buildState');
  const startBuild = document.getElementById('startBuild');
  if (buildState) buildState.textContent = `BUILD ${BUILD}`;
  if (startBuild) startBuild.textContent = `BUILD ${BUILD}`;
  document.documentElement.dataset.build = BUILD;
}

syncHud();
setInterval(syncHud, 100);
requestAnimationFrame(hardLockGeometry);
