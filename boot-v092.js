await import('./script.js?v=0.9.2-world-core');
await import('./headlock-v092.js?v=0.9.2-headlock');
await import('./spatial-v092.js?v=0.9.2-anchor');

const BUILD = 'v0.9.2';

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
