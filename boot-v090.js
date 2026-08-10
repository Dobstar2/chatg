import './script.js?v=0.9.0-world-anchor';

const BUILD = 'v0.9.0';

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
