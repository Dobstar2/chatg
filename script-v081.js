import './script.js?v=0.8.1';

const BUILD_ID = 'v0.8.1';
const BUILD_TIME = '10 Aug 2026 17:39 BST';

function applyBuildBadge() {
  document.documentElement.dataset.build = BUILD_ID;
  const buildState = document.getElementById('buildState');
  const startBuild = document.getElementById('startBuild');
  if (buildState) buildState.textContent = `BUILD ${BUILD_ID}`;
  if (startBuild) startBuild.textContent = `BUILD ${BUILD_ID} • ${BUILD_TIME}`;

  const handState = document.getElementById('handState');
  if (handState && /WORKER/i.test(handState.textContent || '')) {
    handState.textContent = 'HAND: LOADING';
  }
}

applyBuildBadge();
window.addEventListener('load', applyBuildBadge, { once: true });
setTimeout(applyBuildBadge, 1000);
