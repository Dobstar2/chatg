const BUILD = 'v0.9.2';

const eyes = [...document.querySelectorAll('.eye')];
const globalHud = document.getElementById('hud');
const sourceIds = ['motionState', 'lookState', 'handState', 'cameraState'];
const sourceNodes = Object.fromEntries(sourceIds.map((id) => [id, document.getElementById(id)]));

const style = document.createElement('style');
style.textContent = `
  #hud { display: none !important; }
  .eye-hud-v092 {
    position: absolute;
    z-index: 60;
    top: max(5.2%, env(safe-area-inset-top));
    left: 50%;
    width: min(78%, 340px);
    transform: translate3d(-50%, 0, 0);
    pointer-events: none;
    display: grid;
    grid-template-columns: repeat(3, max-content);
    justify-content: center;
    align-items: center;
    gap: 4px 5px;
    padding: 6px 8px;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 15px;
    background: rgba(3,6,12,.84);
    box-shadow: 0 8px 22px rgba(0,0,0,.22);
    font: 800 6.7px/1 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    color: #f7f9ff;
    white-space: nowrap;
    contain: layout paint style;
    backface-visibility: hidden;
  }
  .eye-hud-v092 span {
    padding: 4px 5px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,.10);
    background: rgba(0,0,0,.46);
    text-align: center;
  }
  .eye-hud-v092 .accent {
    color: #74f6c2;
    border-color: rgba(116,246,194,.34);
    background: rgba(23,66,55,.48);
  }
  @media (max-height: 430px) {
    .eye-hud-v092 {
      top: 4.2%;
      width: min(75%, 315px);
      font-size: 6px;
      gap: 3px 4px;
      padding: 5px 6px;
    }
    .eye-hud-v092 span { padding: 3px 4px; }
  }
`;
document.head.appendChild(style);
if (globalHud) globalHud.style.display = 'none';

const huds = eyes.map((eye) => {
  const hud = document.createElement('div');
  hud.className = 'eye-hud-v092';
  hud.innerHTML = `
    <span class="accent">BUILD ${BUILD}</span>
    <span data-copy="motionState">HEAD: OFF</span>
    <span data-copy="handState">HAND: OFF</span>
    <span data-copy="cameraState">CAMERA: OFF</span>
    <span data-copy="lookState">LOOK: CENTER</span>
    <span class="accent" data-pos>POS: INERTIAL</span>
  `;
  eye.appendChild(hud);
  return hud;
});

function syncHud() {
  huds.forEach((hud) => {
    for (const id of sourceIds) {
      const target = hud.querySelector(`[data-copy="${id}"]`);
      const source = sourceNodes[id];
      if (target && source) target.textContent = source.textContent;
    }
  });

  const buildState = document.getElementById('buildState');
  const startBuild = document.getElementById('startBuild');
  if (buildState) buildState.textContent = `BUILD ${BUILD}`;
  if (startBuild) startBuild.textContent = `BUILD ${BUILD}`;
  document.documentElement.dataset.build = BUILD;
}

syncHud();
setInterval(syncHud, 120);
