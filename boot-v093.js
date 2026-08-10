await import('./script.js?v=0.9.3-world-core');
await import('./spatial-v092.js?v=0.9.3-anchor-core');
await import('./headlock-v093.js?v=0.9.3-fixed-visor');

const BUILD = 'v0.9.3';

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
