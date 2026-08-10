await import('./script.js?v=1.0.0-hand-core');
await import('./world-lock-v100.js?v=1.0.0-world-vector-anchor');
await import('./camera-hud-v100.js?v=1.0.0-fixed-hud-ultrawide');

const BUILD = 'v1.0.0';

function stampBuild() {
  const buildState = document.getElementById('buildState');
  const startBuild = document.getElementById('startBuild');
  if (buildState) buildState.textContent = `BUILD ${BUILD}`;
  if (startBuild) startBuild.textContent = `BUILD ${BUILD}`;
  document.documentElement.dataset.build = BUILD;
}

stampBuild();
requestAnimationFrame(stampBuild);
setTimeout(stampBuild, 250);
