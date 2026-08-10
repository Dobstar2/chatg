const BUILD = 'v0.9.3';

const oldHud = document.getElementById('hud');
if (oldHud) oldHud.style.display = 'none';
document.querySelectorAll('.eye-hud,.eye-hud-v092').forEach((node) => node.remove());

const sourceIds = ['motionState', 'lookState', 'handState', 'cameraState'];
const sourceNodes = Object.fromEntries(sourceIds.map((id) => [id, document.getElementById(id)]));

const style = document.createElement('style');
style.textContent = `
  .visor-root-v093 {
    position: fixed;
    inset: 0;
    z-index: 100;
    pointer-events: none;
    display: flex;
    transform: none !important;
    translate: none !important;
    rotate: none !important;
    scale: none !important;
    perspective: none !important;
    contain: layout paint style;
  }
  .visor-eye-v093 {
    position: relative;
    width: 50%;
    height: 100%;
    overflow: visible;
    transform: none !important;
    translate: none !important;
    rotate: none !important;
    scale: none !important;
  }
  .visor-hud-v093 {
    position: absolute;
    top: max(5.5%, env(safe-area-inset-top));
    left: 50%;
    width: min(78%, 330px);
    transform: translate3d(-50%,0,0) !important;
    translate: none !important;
    rotate: none !important;
    scale: 1 !important;
    display: grid;
    grid-template-columns: repeat(3,max-content);
    justify-content: center;
    align-items: center;
    gap: 4px 5px;
    padding: 6px 8px;
    border-radius: 15px;
    border: 1px solid rgba(255,255,255,.14);
    background: rgba(3,6,12,.86);
    box-shadow: 0 8px 22px rgba(0,0,0,.22);
    font: 800 6.7px/1 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;
    color: #f7f9ff;
    white-space: nowrap;
    backface-visibility: hidden;
  }
  .visor-hud-v093 span {
    padding: 4px 5px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,.10);
    background: rgba(0,0,0,.48);
    text-align: center;
  }
  .visor-hud-v093 .accent {
    color: #74f6c2;
    border-color: rgba(116,246,194,.34);
    background: rgba(23,66,55,.5);
  }
  @media (max-height:430px) {
    .visor-hud-v093 {
      top: 4.4%;
      width: min(74%,300px);
      font-size: 6px;
      gap: 3px 4px;
      padding: 5px 6px;
    }
    .visor-hud-v093 span { padding: 3px 4px; }
  }
`;
document.head.appendChild(style);

const root = document.createElement('div');
root.className = 'visor-root-v093';
root.innerHTML = `
  <div class="visor-eye-v093" data-visor-eye="left">
    <div class="visor-hud-v093">
      <span class="accent">BUILD ${BUILD}</span>
      <span data-copy="motionState">HEAD: OFF</span>
      <span data-copy="handState">HAND: OFF</span>
      <span data-copy="cameraState">CAMERA: OFF</span>
      <span data-copy="lookState">LOOK: CENTER</span>
      <span class="accent">HUD: HEAD LOCK</span>
    </div>
  </div>
  <div class="visor-eye-v093" data-visor-eye="right">
    <div class="visor-hud-v093">
      <span class="accent">BUILD ${BUILD}</span>
      <span data-copy="motionState">HEAD: OFF</span>
      <span data-copy="handState">HAND: OFF</span>
      <span data-copy="cameraState">CAMERA: OFF</span>
      <span data-copy="lookState">LOOK: CENTER</span>
      <span class="accent">HUD: HEAD LOCK</span>
    </div>
  </div>
`;
document.body.appendChild(root);

function syncHud() {
  root.querySelectorAll('.visor-hud-v093').forEach((hud) => {
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
setInterval(syncHud,120);
